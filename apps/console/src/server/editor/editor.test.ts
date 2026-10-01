// The draft editor's server steps on PGlite as the app role: save with If-Match and the 412
// conflict, validate, the draft preview through set.run (dry and with a synthetic fixture answer),
// and reading a past run's state as a sample.

import type { QuestionSetSpec, TenantContext } from "@bandwise/core";
import { repos, seedOrgs, type SeededOrg } from "@bandwise/db";
import { createTestDatabase, type TestDatabase } from "@bandwise/db/testing";
import { FixtureTransport, loadBundledFixtures } from "@bandwise/system-one-client/fixture";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { runOperation, type OperationDeps } from "../operations/run-operation";
import type { RunSetDeps } from "../run/run-set";
import { CONFLICT_MESSAGE, GENERIC_FAILURE, previewDraft, runState, saveDraft, validateSpec } from "./editor";

const NICK = "nick@internal.test";
const VIC = "vic@internal.test";

let t: TestDatabase;
let internal: SeededOrg;
let acme: SeededOrg;
let deps: OperationDeps;

function session(org: SeededOrg, email: string, role: "owner" | "viewer"): TenantContext {
  const userId = org.userIds[email];
  if (userId === undefined) throw new Error(`no user ${email}`);
  return { orgId: org.orgId, actor: { type: "user", userId, role, platformRole: null, impersonatorId: null }, client: "console", plan: "internal", requestId: "req-editor" };
}

const owner = () => session(internal, NICK, "owner");

function runDeps(): RunSetDeps {
  return { db: t.db, transport: new FixtureTransport(loadBundledFixtures(), { synthesize: true }), platformKeys: { typesafe: "test-platform-key" } };
}

async function draft(): Promise<{ spec: QuestionSetSpec; etag: string }> {
  const r = await runOperation("draft.get", owner(), { ref: "inbox-triage" }, {}, deps);
  if (r.kind !== "ok" || r.etag === undefined) throw new Error("no draft");
  return { spec: r.output, etag: r.etag };
}

function relabel(spec: QuestionSetSpec, label: string): QuestionSetSpec {
  const next = structuredClone(spec);
  const q = next.stages[0]?.questions["needs_reply"];
  if (q === undefined) throw new Error("fixture changed");
  q.meta = { ...q.meta, label };
  return next;
}

beforeAll(async () => {
  t = await createTestDatabase();
  deps = { db: t.db };
  [internal, acme] = (await seedOrgs(t.db, [
    { slug: "internal", name: "Internal", members: [{ email: NICK, name: "Nick", role: "owner" }, { email: VIC, name: "Vic", role: "viewer" }] },
    { slug: "acme", name: "Acme", members: [{ email: "ada@acme.test", name: "Ada", role: "owner" }] },
  ])) as [SeededOrg, SeededOrg];
}, 120_000);

afterAll(async () => {
  await t.close();
});

describe("saveDraft", () => {
  it("saves with the current ETag and returns the new one", async () => {
    const { spec, etag } = await draft();
    const res = await saveDraft(owner(), deps, { ref: "inbox-triage", spec: relabel(spec, "Needs a reply (saved)"), etag });
    expect(res.status).toBe("saved");
    const after = await draft();
    expect(res.status === "saved" && res.etag).toBe(after.etag);
    expect(after.spec.stages[0]?.questions["needs_reply"]?.meta.label).toBe("Needs a reply (saved)");
  });

  it("answers a stale ETag with a conflict and the current ETag, and changes nothing", async () => {
    const before = await draft();
    const res = await saveDraft(owner(), deps, { ref: "inbox-triage", spec: relabel(before.spec, "Lost edit"), etag: "sha256:stale" });
    expect(res).toEqual({ status: "conflict", message: CONFLICT_MESSAGE, currentEtag: before.etag });
    expect((await draft()).etag).toBe(before.etag);
    // Saving over it on purpose uses the ETag the conflict returned.
    const again = await saveDraft(owner(), deps, { ref: "inbox-triage", spec: relabel(before.spec, "Kept edit"), etag: res.status === "conflict" ? (res.currentEtag ?? "") : "" });
    expect(again.status).toBe("saved");
  });

  it("reports a spec that fails the schema with details, not a generic error", async () => {
    const { etag } = await draft();
    const res = await saveDraft(owner(), deps, { ref: "inbox-triage", spec: { schemaVersion: 1, rollout: "full" }, etag });
    expect(res.status).toBe("invalid");
    expect(res.status === "invalid" && res.details.length).toBeGreaterThan(0);
  });

  it("refuses a viewer", async () => {
    const { spec, etag } = await draft();
    const res = await saveDraft(session(internal, VIC, "viewer"), deps, { ref: "inbox-triage", spec, etag });
    expect(res.status).toBe("error");
  });
});

describe("validateSpec", () => {
  it("lints an unsaved spec and writes nothing", async () => {
    const before = await draft();
    const broken = structuredClone(before.spec);
    const policy = broken.policies["needs_reply"];
    if (policy?.type !== "noul") throw new Error("fixture changed");
    policy.noul = { trueAt: 0.3, falseAt: 0.6, reviewMargin: 0.1 };
    const res = await validateSpec(owner(), deps, { ref: "inbox-triage", spec: broken });
    expect(res.status === "ok" && res.errors.map((e) => e.rule)).toContain("policy.noul_order");
    expect((await draft()).etag).toBe(before.etag);
  });

  it("reports a non-object spec as a lint error", async () => {
    const res = await validateSpec(owner(), deps, { ref: "inbox-triage", spec: [] });
    expect(res.status === "ok" && res.errors[0]?.message).toMatch(/JSON object/);
  });
});

describe("previewDraft", () => {
  const state = { text: "Can you send me the invoice by Friday?" };

  it("dry runs the draft: the payload, no run row", async () => {
    const before = await t.db.withTenant(owner(), (tx) => repos.runs.list(tx, { limit: 50, cursor: null }));
    const res = await previewDraft(owner(), "internal", { ref: "inbox-triage", state, dryRun: true }, runDeps());
    expect(res.status).toBe("dry");
    expect(res.status === "dry" && res.result.stages[0]?.batches.length).toBeGreaterThan(0);
    const after = await t.db.withTenant(owner(), (tx) => repos.runs.list(tx, { limit: 50, cursor: null }));
    expect(after.data.length).toBe(before.data.length);
  });

  it("runs the draft as shadow from the console and returns bands and actions", async () => {
    const res = await previewDraft(owner(), "internal", { ref: "inbox-triage", state, dryRun: false }, runDeps());
    if (res.status !== "ran") throw new Error(`expected a run, got ${res.status}`);
    expect(res.result.rollout).toBe("shadow");
    expect(Object.keys(res.result.decisions)).toContain("needs_reply");
    const row = await t.db.withTenant(owner(), (tx) => repos.runs.get(tx, res.result.runId));
    expect(row?.source).toBe("console");

    const sample = await runState(owner(), deps, { id: res.result.runId });
    expect(sample.status).toBe("ok");
  });

  it("refuses a state that fails input.schema with the reason", async () => {
    const res = await previewDraft(owner(), "internal", { ref: "inbox-triage", state: { nope: 1 }, dryRun: false }, runDeps());
    expect(res.status).toBe("refused");
  });

  it("refuses a version ref and any org but internal", async () => {
    expect((await previewDraft(owner(), "internal", { ref: "inbox-triage@1", state, dryRun: true }, runDeps())).status).toBe("refused");
    const ada = session(acme, "ada@acme.test", "owner");
    const res = await previewDraft(ada, "acme", { ref: "inbox-triage", state, dryRun: true }, runDeps());
    expect(res.status).toBe("refused");
  });

  it("keeps an unexpected failure generic", async () => {
    const logged: string[] = [];
    const broken = { ...runDeps(), db: { withTenant: () => Promise.reject(new Error("connection to secret-host failed")) } } as unknown as RunSetDeps;
    const res = await previewDraft(owner(), "internal", { ref: "inbox-triage", state, dryRun: false }, broken, (m) => logged.push(m));
    expect(res).toEqual({ status: "error", message: GENERIC_FAILURE });
    expect(logged).toEqual(["Error"]);
  });
});

describe("runState", () => {
  it("does not find another org's run", async () => {
    const ada = session(acme, "ada@acme.test", "owner");
    const res = await previewDraft(owner(), "internal", { ref: "inbox-triage", state: { text: "Lunch?" }, dryRun: false }, runDeps());
    if (res.status !== "ran") throw new Error("expected a run");
    expect((await runState(ada, deps, { id: res.result.runId })).status).toBe("error");
  });
});
