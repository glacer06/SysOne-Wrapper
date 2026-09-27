// pnpm smoke and pnpm fixtures:record, offline: the SDK transport is swapped for fixtures, so no
// test makes a network call (golden rule 7).

import { SEED_MODEL_PROFILES, SEED_MODEL_ROUTES, type SystemOneTransport } from "@sysone/core";
import { FixtureTransport, type Fixture, fixtureKey, loadBundledFixtures } from "@sysone/system-one-client/fixture";
import { describe, expect, it } from "vitest";
import { offlineTransport } from "../ports.js";
import { recordMain, smokeMain } from "./cli.js";
import { planRecording, scrubFixture } from "./record.js";
import { smokeList, versionedResolved } from "./smoke.js";

function io(env: Record<string, string | undefined>, extra: Record<string, unknown> = {}) {
  const out: string[] = [];
  const err: string[] = [];
  return { out, err, io: { out: (l: string) => out.push(l), err: (l: string) => err.push(l), env, ...extra } };
}

describe("pnpm smoke", () => {
  it("skips with exit 0 and a clear message when the key is missing", async () => {
    const ts = io({});
    expect(await smokeMain([], ts.io)).toBe(0);
    expect(ts.out[0]).toBe("smoke skipped: TYPESAFE_API_KEY is not set, so no live typesafe call was made. Set it to run the live smoke test.");
    const or = io({ TYPESAFE_API_KEY: "sk" });
    expect(await smokeMain(["--provider", "openrouter"], or.io)).toBe(0);
    expect(or.out[0]).toContain("OPENROUTER_API_KEY is not set");
  });

  it("rejects a bad provider or flag", async () => {
    expect(await smokeMain(["--provider", "vercel"], io({}).io)).toBe(2);
    expect(await smokeMain(["--fast"], io({}).io)).toBe(2);
  });

  it("builds the smoke list from the registry", () => {
    expect(smokeList("typesafe", SEED_MODEL_PROFILES, SEED_MODEL_ROUTES).map((t) => t.model)).toEqual(["jev-preview", "jev-latest", "jev-1.13.0"]);
    expect(smokeList("openrouter", SEED_MODEL_PROFILES, SEED_MODEL_ROUTES)).toEqual([
      { model: "jev-preview", sendAs: null },
      { model: "jev-latest", sendAs: "~typesafe/jev-latest" },
      { model: "jev-1.13.0", sendAs: "typesafe/jev-1.13" },
    ]);
    expect(smokeList("typesafe", SEED_MODEL_PROFILES, SEED_MODEL_ROUTES, { model: "jev-1.13.0", pinnedInUse: ["x"] })).toEqual([{ model: "jev-1.13.0", sendAs: "jev-1.13.0" }]);
    expect(smokeList("typesafe", SEED_MODEL_PROFILES, SEED_MODEL_ROUTES, { pinnedInUse: ["jev-1.12.0"] }).map((t) => t.model)).toContain("jev-1.12.0");
  });

  it("passes every model on typesafe with a key", async () => {
    const t = io({ TYPESAFE_API_KEY: "sk-test" }, { transport: offlineTransport() });
    expect(await smokeMain([], t.io)).toBe(0);
    const lines = t.out.join("\n");
    expect(lines).toContain("ok   jev-latest noul.versioned_model: answered by jev-1.13.0");
    expect(lines).toContain("ok   jev-1.13.0 two_stage.run: status ok, calls per stage 1+1");
    expect(lines).toMatch(/ok {3}jev-1\.13\.0 cost: \$0\.0000\d\d/);
    expect(lines).toContain("smoke passed");
  });

  it("runs the openrouter route rows and skips models without one", async () => {
    const t = io({ OPENROUTER_API_KEY: "or-test" }, { transport: offlineTransport() });
    expect(await smokeMain(["--provider", "openrouter"], t.io)).toBe(0);
    const lines = t.out.join("\n");
    expect(lines).toContain("SKIP jev-preview route: skipped: no openrouter route row for jev-preview");
    expect(lines).toContain("ok   jev-1.13.0 choice.versioned_model: answered by typesafe/jev-1.13-20260917 (jev-1.13.0)");
    expect(lines).toContain("ok   jev-latest score.shape");
  });

  it("fails when an alias answers as itself, or the call fails", async () => {
    const aliasEcho: SystemOneTransport = new FixtureTransport([], { synthesize: true });
    const t = io({ TYPESAFE_API_KEY: "sk-test" }, { transport: aliasEcho });
    expect(await smokeMain(["--model", "jev-latest"], t.io)).toBe(1);
    expect(t.out.join("\n")).toContain("FAIL jev-latest noul.versioned_model: response model jev-latest is not a versioned registry id");

    const down: SystemOneTransport = new FixtureTransport([]);
    const d = io({ TYPESAFE_API_KEY: "sk-test" }, { transport: down });
    expect(await smokeMain(["--model", "jev-1.13.0"], d.io)).toBe(1);
    expect(d.out.join("\n")).toContain("FAIL jev-1.13.0 noul.call: system_one_invalid_request");
  });

  it("maps response models to versioned registry ids through the routes", () => {
    expect(versionedResolved("typesafe", "jev-1.13.0", SEED_MODEL_PROFILES, SEED_MODEL_ROUTES)).toBe("jev-1.13.0");
    expect(versionedResolved("typesafe", "jev-latest", SEED_MODEL_PROFILES, SEED_MODEL_ROUTES)).toBeNull();
    expect(versionedResolved("openrouter", "typesafe/jev-1.13-20260917", SEED_MODEL_PROFILES, SEED_MODEL_ROUTES)).toBe("jev-1.13.0");
    expect(versionedResolved("openrouter", "typesafe/jev-1.14-20261101", SEED_MODEL_PROFILES, SEED_MODEL_ROUTES)).toBeNull();
  });
});

describe("pnpm fixtures:record", () => {
  const bundled = loadBundledFixtures();

  it("skips with exit 0 and writes nothing when the key is missing", async () => {
    const writes: string[] = [];
    const t = io({}, { write: (p: string) => writes.push(p) });
    expect(await recordMain([], t.io)).toBe(0);
    expect(t.out[0]).toContain("fixtures:record skipped: TYPESAFE_API_KEY is not set");
    const o = io({}, { write: (p: string) => writes.push(p) });
    expect(await recordMain(["--provider", "openrouter"], o.io)).toBe(0);
    expect(o.out[0]).toContain("OPENROUTER_API_KEY is not set");
    expect(writes).toEqual([]);
  });

  it("re-records every success fixture in place, scrubbed, with the live openapi version", async () => {
    for (const provider of ["typesafe", "openrouter"] as const) {
      const written = new Map<string, Fixture>();
      const t = io(
        { TYPESAFE_API_KEY: "sk", OPENROUTER_API_KEY: "or" },
        { transport: new FixtureTransport(bundled), fetchOpenapiVersion: async () => "0.2.0", write: (p: string, f: Fixture) => written.set(p, f) },
      );
      expect(await recordMain(["--provider", provider], t.io)).toBe(0);
      const expected = bundled.filter((f) => f.provider === provider && "response" in f);
      expect(written.size).toBe(expected.length);
      for (const f of expected) {
        const w = written.get(`${provider}/${f.name}.json`);
        expect(w, f.name).toBeDefined();
        expect(fixtureKey(provider, w?.request ?? f.request)).toBe(fixtureKey(provider, f.request));
        expect(w?.openapiVersion).toBe("0.2.0");
        if (w !== undefined && "response" in w && w.response.id !== undefined) expect(w.response.id).toBe(`gen-dec-fx-${f.name}`);
      }
      expect(t.out.at(-1)).toContain(`recorded ${expected.length} of ${expected.length} fixtures on ${provider}`);
    }
  });

  it("records a new model into its own folder, through the route off TypeSafe", async () => {
    const plan = planRecording(bundled, "openrouter", SEED_MODEL_PROFILES, SEED_MODEL_ROUTES, "jev-latest");
    expect(plan.length).toBeGreaterThan(0);
    expect(plan.every((t) => t.path.startsWith("openrouter/jev-latest/") && t.request.model === "~typesafe/jev-latest")).toBe(true);

    const written: string[] = [];
    const t = io({ TYPESAFE_API_KEY: "sk" }, { transport: offlineTransport(), fetchOpenapiVersion: async () => "0.2.0", write: (p: string) => written.push(p) });
    expect(await recordMain(["--model", "jev-preview"], t.io)).toBe(0);
    expect(written.every((p) => p.startsWith("typesafe/jev-preview/"))).toBe(true);
    expect(written).not.toContain("typesafe/jev-preview/alias-resolved.json");

    const noRoute = io({ OPENROUTER_API_KEY: "or" });
    expect(await recordMain(["--provider", "openrouter", "--model", "jev-preview"], noRoute.io)).toBe(2);
    expect(noRoute.err[0]).toContain("no openrouter route row");
  });

  it("reports a failed call and exits 1", async () => {
    const t = io({ TYPESAFE_API_KEY: "sk" }, { transport: new FixtureTransport([]), fetchOpenapiVersion: async () => "0.2.0", write: () => undefined });
    expect(await recordMain(["--model", "jev-1.13.0"], t.io)).toBe(1);
    expect(t.err[0]).toMatch(/^failed .*system_one_invalid_request/);
  });

  it("scrubs ids only on success fixtures", () => {
    const err = bundled.find((f) => "error" in f);
    expect(err !== undefined && scrubFixture(err)).toBe(err);
  });
});
