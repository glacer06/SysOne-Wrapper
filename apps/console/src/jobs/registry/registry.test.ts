// Registry jobs against recorded HTTP (no network): registry sync, alias observation, alias probe
// and contract watch (system-one-models.md section 6; testing.md, Model registry tests).

import { EventEnvelope, SEED_MODEL_PROFILES, SEED_MODEL_ROUTES, SEED_SYSTEM_ONE_PRICES } from "@bandwise/core";
import { SdkTransport, loadContractSnapshots } from "@bandwise/system-one-client";
import { describe, expect, it } from "vitest";
import { loadRecording, replayFetch, textFetch } from "~/test/replay-http";
import {
  type RegistryEvent,
  contractWatch,
  createMemoryRegistryStore,
  createRecorder,
  diffOpenapi,
  diffText,
  MAX_LINE_CHANGES,
  observeAlias,
  parseOpenRouterListing,
  probeIdleAliases,
  registrySync,
} from "./index";

const HTTP = new URL("./__fixtures__/http/", import.meta.url);
const rec = (name: string) => loadRecording(HTTP, name);

const ORG_A = "00000000-0000-7000-8000-00000000000a";
const ORG_B = "00000000-0000-7000-8000-00000000000b";
const SET_A = "00000000-0000-7000-8000-0000000005a1";
const SET_B = "00000000-0000-7000-8000-0000000005b1";
const NOW = new Date("2026-09-27T03:00:00.000Z");

function world() {
  const store = createMemoryRegistryStore({
    profiles: SEED_MODEL_PROFILES,
    routes: SEED_MODEL_ROUTES,
    prices: SEED_SYSTEM_ONE_PRICES,
    sets: [
      { orgId: ORG_A, setId: SET_A, model: "jev-latest" },
      { orgId: ORG_B, setId: SET_B, model: "jev-latest", provider: "openrouter" },
    ],
  });
  const recorder = createRecorder();
  return { store, recorder, deps: { store, events: recorder, alerts: recorder } };
}

/** Every emitted event is a valid EventEnvelope once the feed adds id, time and actor. */
function assertEnvelopes(events: readonly RegistryEvent[]): void {
  for (const [i, e] of events.entries()) {
    EventEnvelope.parse({
      ...e,
      id: `00000000-0000-7000-8000-${String(i + 1).padStart(12, "0")}`,
      occurredAt: NOW.toISOString(),
      actor: { type: "system", client: "job" },
    });
  }
}

describe("registry sync", () => {
  it("TypeSafe: lists with GET /v1/models and stores reachable ids, alias targets included", async () => {
    const { store, recorder, deps } = world();
    const fetch = replayFetch([rec("typesafe-models.json")]);
    const r = await registrySync({ ...deps, fetch }, { orgId: ORG_A, provider: "typesafe", apiKey: "sk-test", now: NOW });
    expect(r).toMatchObject({ ok: true, listed: ["jev-latest", "jev-preview"], insertedUnreviewed: [], unmapped: [] });
    // jev-1.13.0 is not listed but is the observed target of a listed alias.
    expect(r.reachable).toEqual(["jev-1.13.0", "jev-latest", "jev-preview"]);
    expect(store.keyModels.get(`${ORG_A}:typesafe`)).toEqual(r.reachable);
    expect(fetch.seen).toEqual(["GET https://api.typesafe.ai/v1/models"]);
    expect(fetch.auth).toEqual(["Bearer sk-test"]);
    expect(recorder.events).toEqual([]);
    expect(recorder.alerts).toEqual([]);
  });

  it("TypeSafe: inserts an unseen name as unreviewed, emits model.unreviewed and alerts once", async () => {
    const { store, recorder, deps } = world();
    const fetch = replayFetch([rec("typesafe-models-new-name.json")]);
    const r = await registrySync({ ...deps, fetch }, { orgId: ORG_A, provider: "typesafe", apiKey: "sk-test", now: NOW });
    expect(r.insertedUnreviewed).toEqual(["foo-2.0.0"]);
    expect(store.rows.get("foo-2.0.0")).toMatchObject({ kind: "alias", status: "unreviewed", limits: null, family: "foo", releaseDate: "2026-10-01" });
    expect(recorder.events).toEqual([{ type: "model.unreviewed", orgId: null, subject: { type: "model", id: "foo-2.0.0" }, data: { modelId: "foo-2.0.0", seenVia: "list" } }]);
    expect(recorder.alerts.map((a) => a.kind)).toEqual(["model_unreviewed"]);
    assertEnvelopes(recorder.events);

    // A second sync finds the row and inserts nothing.
    await registrySync({ ...deps, fetch }, { orgId: ORG_A, provider: "typesafe", apiKey: "sk-test", now: NOW });
    expect(recorder.events).toHaveLength(1);
  });

  it("TypeSafe: a refused listing alerts and writes nothing", async () => {
    const { store, recorder, deps } = world();
    const r = await registrySync({ ...deps, fetch: replayFetch([rec("typesafe-models-no-key.json")]) }, { orgId: ORG_A, provider: "typesafe", apiKey: "", now: NOW });
    expect(r.ok).toBe(false);
    expect(store.keyModels.size).toBe(0);
    expect(recorder.alerts[0]?.kind).toBe("listing_failed");
  });

  it("OpenRouter: reads the Models API for decisions models, maps them through the routes and records the alias target", async () => {
    const { store, recorder, deps } = world();
    const fetch = replayFetch([rec("openrouter-models-decisions.json")]);
    const r = await registrySync({ ...deps, fetch }, { orgId: ORG_B, provider: "openrouter", apiKey: "sk-or-test", now: NOW });
    expect(r.ok).toBe(true);
    expect(r.listed).toEqual(["~typesafe/jev-latest", "typesafe/jev-1.13"]);
    expect(r.reachable).toEqual(["jev-1.13.0", "jev-latest"]);
    expect(r.unmapped).toEqual([]);
    // The public Models API gets no org key.
    expect(fetch.auth).toEqual([null]);
    expect(store.observations).toEqual([
      { provider: "openrouter", alias: "jev-latest", resolvedId: "typesafe/jev-1.13-20260917", firstSeen: NOW, lastSeen: NOW },
    ]);
    // The first observation is a move from nothing, for the org whose set is on the OpenRouter alias.
    expect(recorder.events).toEqual([
      {
        type: "model.alias_moved",
        orgId: ORG_B,
        subject: { type: "model", id: "jev-latest" },
        data: { provider: "openrouter", alias: "jev-latest", fromResolvedId: null, toResolvedId: "typesafe/jev-1.13-20260917", affectedSetIds: [SET_B] },
      },
    ]);
    assertEnvelopes(recorder.events);
    // TypeSafe's jev-latest target is tracked apart and not touched.
    expect(store.rows.get("jev-latest")?.aliasTarget).toBe("jev-1.13.0");
  });

  it("OpenRouter: an id with no route row alerts instead of inserting a profile", async () => {
    const { store, recorder, deps } = world();
    const body = rec("openrouter-models-decisions.json");
    const listing = body.response.body as { data: unknown[] };
    body.response.body = { data: [...listing.data, { id: "typesafe/jev-2.0", canonical_slug: "typesafe/jev-2.0-20261201", context_length: 64000 }] };
    const r = await registrySync({ ...deps, fetch: replayFetch([body]) }, { orgId: ORG_B, provider: "openrouter", apiKey: "k", now: NOW });
    expect(r.unmapped).toEqual(["typesafe/jev-2.0"]);
    expect(recorder.alerts.map((a) => a.kind)).toEqual(["route_missing"]);
    expect(store.rows.has("typesafe/jev-2.0")).toBe(false);
  });

  it("Vercel: lists with GET /typesafe/v1/models and maps ids through the routes, never inserting a profile (ADR-013)", async () => {
    const { store, recorder, deps } = world();
    const fetch = replayFetch([rec("vercel-models.json")]);
    const r = await registrySync({ ...deps, fetch }, { orgId: ORG_B, provider: "vercel", apiKey: "vck-test", now: NOW });
    expect(r.ok).toBe(true);
    expect(fetch.seen).toEqual(["GET https://ai-gateway.vercel.sh/typesafe/v1/models"]);
    expect(fetch.auth).toEqual(["Bearer vck-test"]);
    expect(r.listed).toEqual(["typesafe-ai/jev"]);
    expect(r.reachable).toEqual(["jev-1.13.0", "jev-latest"]);
    expect(r.insertedUnreviewed).toEqual([]);
    expect(store.observations).toEqual([]);

    const body = rec("vercel-models.json");
    const listing = body.response.body as { models: unknown[] };
    body.response.body = { models: [...listing.models, { name: "typesafe-ai/jev-2", description: "x", release_date: "2026-12-01" }] };
    const again = await registrySync({ ...deps, fetch: replayFetch([body]) }, { orgId: ORG_B, provider: "vercel", apiKey: "k", now: NOW });
    expect(again.unmapped).toEqual(["typesafe-ai/jev-2"]);
    expect(recorder.alerts.map((a) => a.kind)).toContain("route_missing");
    expect(store.rows.has("typesafe-ai/jev-2")).toBe(false);
  });

  it("alerts when a stable versioned model has no price row", async () => {
    const store = createMemoryRegistryStore({ profiles: SEED_MODEL_PROFILES, routes: SEED_MODEL_ROUTES, prices: [] });
    const recorder = createRecorder();
    await registrySync({ store, events: recorder, alerts: recorder, fetch: replayFetch([rec("typesafe-models.json")]) }, { orgId: ORG_A, provider: "typesafe", apiKey: "k", now: NOW });
    expect(recorder.alerts).toEqual([expect.objectContaining({ kind: "stable_model_unpriced", details: { modelId: "jev-1.13.0" } })]);
  });

  it("parses only System One entries from a Models API body", () => {
    expect(parseOpenRouterListing({ data: [{ id: "anthropic/claude" }, { id: "typesafe/jev-1.13" }, { nope: 1 }, null] })).toEqual([
      { id: "typesafe/jev-1.13", canonicalSlug: null, contextLength: null, aliasTargetSlug: null },
    ]);
    expect(() => parseOpenRouterListing({ models: [] })).toThrow("data array");
  });
});

describe("alias observation", () => {
  it("replaying the alias-move observation writes one row and emits model.alias_moved once", async () => {
    const { store, recorder, deps } = world();
    // The seed has already seen jev-latest answered by jev-1.13.0.
    await observeAlias(deps, { provider: "typesafe", alias: "jev-latest", resolved: "jev-1.13.0", at: new Date("2026-09-26T00:00:00Z") });
    recorder.events.length = 0;

    const move = { provider: "typesafe" as const, alias: "jev-latest", resolved: "jev-1.14.0", at: NOW };
    const first = await observeAlias(deps, move);
    const replay = await observeAlias(deps, { ...move, at: new Date(NOW.getTime() + 60_000) });
    expect(first).toMatchObject({ recorded: true, moved: true, fromResolvedId: "jev-1.13.0", insertedUnreviewed: true });
    expect(replay).toMatchObject({ recorded: true, moved: false });
    expect(store.observations.filter((o) => o.resolvedId === "jev-1.14.0")).toHaveLength(1);
    const moved = recorder.events.filter((e) => e.type === "model.alias_moved");
    expect(moved).toEqual([
      {
        type: "model.alias_moved",
        orgId: ORG_A,
        subject: { type: "model", id: "jev-latest" },
        data: { provider: "typesafe", alias: "jev-latest", fromResolvedId: "jev-1.13.0", toResolvedId: "jev-1.14.0", affectedSetIds: [SET_A] },
      },
    ]);
    // The unseen build is inserted as unreviewed and the alias row points at it.
    expect(recorder.events.filter((e) => e.type === "model.unreviewed").map((e) => e.data)).toEqual([{ modelId: "jev-1.14.0", seenVia: "observation" }]);
    expect(store.rows.get("jev-latest")?.aliasTarget).toBe("jev-1.14.0");
    assertEnvelopes(recorder.events);
  });

  it("ignores names that are not alias rows", async () => {
    const { store, deps } = world();
    expect((await observeAlias(deps, { provider: "typesafe", alias: "jev-1.13.0", resolved: "jev-1.13.0", at: NOW })).recorded).toBe(false);
    expect((await observeAlias(deps, { provider: "typesafe", alias: "jev", resolved: "jev-1.13.0", at: NOW })).recorded).toBe(false);
    expect(store.observations).toEqual([]);
  });

  it("alerts on an OpenRouter build no route row knows", async () => {
    const { recorder, deps } = world();
    await observeAlias(deps, { provider: "openrouter", alias: "jev-latest", resolved: "typesafe/jev-1.14-20261101", at: NOW });
    expect(recorder.alerts.map((a) => a.kind)).toEqual(["alias_resolved_unmapped"]);
  });
});

describe("alias probe", () => {
  it("TypeSafe: probes each idle alias with a one-noul request and records the build", async () => {
    const { store, recorder, deps } = world();
    const fetch = replayFetch([rec("typesafe-probe-jev-latest.json"), rec("typesafe-probe-jev-preview.json")]);
    const r = await probeIdleAliases({ ...deps, transport: new SdkTransport({ fetch }) }, { provider: "typesafe", apiKey: "sk-test", now: NOW });
    expect(r.probed.map((p) => [p.alias, p.resolved])).toEqual([
      ["jev-latest", "jev-1.13.0"],
      ["jev-preview", "jev-1.13.0"],
    ]);
    expect(r.failed).toEqual([]);
    expect(fetch.seen).toEqual(["POST https://api.typesafe.ai/v1/systemone", "POST https://api.typesafe.ai/v1/systemone"]);
    expect(store.observations.map((o) => `${o.alias}->${o.resolvedId}`)).toEqual(["jev-latest->jev-1.13.0", "jev-preview->jev-1.13.0"]);
    // First sighting of jev-latest is reported to the org on it; nobody uses jev-preview.
    expect(recorder.events.map((e) => e.type)).toEqual(["model.alias_moved"]);

    // Probed again the same day: both aliases are skipped.
    const again = await probeIdleAliases({ ...deps, transport: new SdkTransport({ fetch }) }, { provider: "typesafe", apiKey: "sk-test", now: new Date(NOW.getTime() + 3_600_000) });
    expect(again.skipped).toEqual([
      { alias: "jev-latest", reason: "seen_today" },
      { alias: "jev-preview", reason: "seen_today" },
    ]);
  });

  it("TypeSafe: a probe that sees a new build moves the alias", async () => {
    const { store, recorder, deps } = world();
    await store.recordObservation("typesafe", "jev-latest", "jev-1.13.0", new Date("2026-09-20T00:00:00Z"));
    const fetch = replayFetch([rec("typesafe-probe-jev-latest-moved.json"), rec("typesafe-probe-jev-preview.json")]);
    await probeIdleAliases({ ...deps, transport: new SdkTransport({ fetch }) }, { provider: "typesafe", apiKey: "k", now: NOW });
    const moved = recorder.events.find((e) => e.type === "model.alias_moved");
    expect(moved?.data).toMatchObject({ fromResolvedId: "jev-1.13.0", toResolvedId: "jev-1.14.0" });
  });

  it("OpenRouter: probes only aliases with a route, sent as the route id", async () => {
    const { store, deps } = world();
    const fetch = replayFetch([rec("openrouter-probe-jev-latest.json")]);
    const r = await probeIdleAliases({ ...deps, transport: new SdkTransport({ fetch }) }, { provider: "openrouter", apiKey: "sk-or", now: NOW });
    expect(r.probed.map((p) => [p.alias, p.resolved])).toEqual([["jev-latest", "typesafe/jev-1.13-20260917"]]);
    expect(r.skipped).toEqual([{ alias: "jev-preview", reason: "no_route" }]);
    expect(fetch.seen).toEqual(["POST https://openrouter.ai/api/v1/systemone"]);
    expect(store.observations[0]).toMatchObject({ provider: "openrouter", alias: "jev-latest" });
  });

  it("alerts when a probe fails", async () => {
    const { recorder, deps } = world();
    const r = await probeIdleAliases({ ...deps, transport: new SdkTransport({ fetch: replayFetch([rec("typesafe-models-no-key.json")]) }) }, { provider: "typesafe", apiKey: "k", now: NOW });
    expect(r.failed.map((f) => f.alias)).toEqual(["jev-latest", "jev-preview"]);
    expect(recorder.alerts.every((a) => a.kind === "probe_failed")).toBe(true);
  });
});

describe("contract watch", () => {
  const snapshots = loadContractSnapshots();
  const URLS = {
    openapi: "https://api.typesafe.ai/openapi.json",
    llms_txt: "https://docs.typesafe.ai/llms.txt",
    models_md: "https://docs.typesafe.ai/models.md",
  };
  const live = (over: Partial<Record<keyof typeof URLS, string>> = {}) =>
    textFetch({
      [URLS.openapi]: { body: over.openapi ?? snapshots.openapi },
      [URLS.llms_txt]: { body: over.llms_txt ?? snapshots.llms_txt },
      [URLS.models_md]: { body: over.models_md ?? snapshots.models_md },
    });

  it("snapshots are TypeSafe's documents as recorded (openapi 0.2.0, three question types)", () => {
    const doc = JSON.parse(snapshots.openapi) as { info: { version: string } };
    expect(doc.info.version).toBe("0.2.0");
    expect(snapshots.llms_txt).toContain("# TypeSafe AI");
    expect(snapshots.models_md).toContain("`jev-1.13.0`");
  });

  it("is quiet when the live documents match the snapshots", async () => {
    const r = createRecorder();
    const fetch = live();
    const result = await contractWatch({ fetch, snapshots, events: r, alerts: r, issues: r });
    expect(result).toEqual({ changed: {}, failed: {} });
    expect(fetch.seen).toEqual([`GET ${URLS.openapi}`, `GET ${URLS.llms_txt}`, `GET ${URLS.models_md}`]);
    expect(r.events).toEqual([]);
    expect(r.issues).toEqual([]);
  });

  it("flags a version bump, a new question type, a new path and a changed schema", async () => {
    const doc = JSON.parse(snapshots.openapi) as {
      info: { version: string };
      paths: Record<string, unknown>;
      components: { schemas: Record<string, { discriminator?: { mapping: Record<string, string> }; description?: string }> };
    };
    doc.info.version = "0.3.0";
    doc.paths["/v1/batches"] = { post: { summary: "Batches" } };
    const q = doc.components.schemas["Question"];
    if (q?.discriminator === undefined) throw new Error("snapshot has no Question discriminator");
    q.discriminator.mapping["rank"] = "#/components/schemas/RankQuestion";
    const usage = doc.components.schemas["Usage"];
    if (usage !== undefined) usage.description = "changed";
    const r = createRecorder();
    const result = await contractWatch({ fetch: live({ openapi: JSON.stringify(doc) }), snapshots, events: r, alerts: r, issues: r });
    expect(result.changed.openapi).toEqual([
      { kind: "info_version", from: "0.2.0", to: "0.3.0" },
      { kind: "path_added", operation: "POST /v1/batches" },
      { kind: "schema_changed", schema: "Question" },
      { kind: "schema_changed", schema: "Usage" },
      { kind: "question_type_added", type: "rank" },
    ]);
    expect(r.events).toHaveLength(1);
    expect(r.events[0]).toMatchObject({ type: "contract.changed", orgId: null, subject: { type: "contract", id: "openapi" }, data: { source: "openapi" } });
    assertEnvelopes(r.events);
    expect(r.alerts.map((a) => a.kind)).toEqual(["contract_changed"]);
    expect(r.issues[0]?.title).toBe("TypeSafe contract changed: openapi.json 0.2.0 to 0.3.0");
    expect(r.issues[0]?.body).toContain("pnpm fixtures:record");
  });

  it("flags added and removed lines in llms.txt and models.md", async () => {
    const r = createRecorder();
    const models = snapshots.models_md.replace("| `jev-latest`  | `jev-1.13.0` |", "| `jev-latest`  | `jev-1.14.0` |");
    const llms = `${snapshots.llms_txt}\n- [Rank](https://docs.typesafe.ai/primitives/rank.md): A new question type.\n`;
    const result = await contractWatch({ fetch: live({ models_md: models, llms_txt: llms }), snapshots, events: r, alerts: r, issues: r });
    expect(result.changed.llms_txt).toEqual([{ kind: "line_added", line: "- [Rank](https://docs.typesafe.ai/primitives/rank.md): A new question type." }]);
    expect(result.changed.models_md?.map((c) => c.kind)).toEqual(["line_added", "line_removed"]);
    expect(r.events.map((e) => e.subject.id)).toEqual(["llms_txt", "models_md"]);
    expect(r.issues.map((i) => i.title)).toEqual(["TypeSafe contract changed: llms.txt", "TypeSafe contract changed: models.md"]);
  });

  it("alerts and carries on when a document cannot be fetched", async () => {
    const r = createRecorder();
    const fetch = textFetch({
      [URLS.openapi]: { status: 503, body: "down" },
      [URLS.llms_txt]: { body: snapshots.llms_txt },
      [URLS.models_md]: { body: snapshots.models_md },
    });
    const result = await contractWatch({ fetch, snapshots, events: r, alerts: r, issues: r });
    expect(result.failed.openapi).toContain("503");
    expect(r.alerts.map((a) => a.kind)).toEqual(["contract_fetch_failed"]);
    expect(r.events).toEqual([]);
  });

  it("diff helpers: an equal document is empty, a cosmetic change is document_changed, long diffs truncate", () => {
    const doc = JSON.parse(snapshots.openapi) as Record<string, unknown>;
    expect(diffOpenapi(doc, structuredClone(doc))).toEqual([]);
    expect(diffOpenapi(doc, { ...doc, servers: [{ url: "x" }] }).map((c) => c.kind)).toEqual(["document_changed"]);
    expect(diffOpenapi({ paths: { "/a": { get: {} } } }, {}).map((c) => c.kind)).toEqual(["path_removed"]);
    const big = Array.from({ length: MAX_LINE_CHANGES + 5 }, (_, i) => `line ${i}`).join("\n");
    const d = diffText("", big);
    expect(d).toHaveLength(MAX_LINE_CHANGES + 1);
    expect(d.at(-1)).toEqual({ kind: "truncated", more: 5 });
    expect(diffText("a\n\nb  \n", "a\nb")).toEqual([]);
  });
});
