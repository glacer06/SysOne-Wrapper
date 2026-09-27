// Pinned-classification table (testing.md, Model registry tests; system-one-models.md section 4).
// A name is pinned only when the registry marks it `kind: "versioned"`, and off TypeSafe only when
// its route row is also pinned. Never inferred from the shape of the name.

import {
  type ModelProfile,
  type ModelRoute,
  SEED_MODEL_PROFILES,
  SEED_MODEL_ROUTES,
  type SystemOneProvider,
  classifyModelName,
  createMemoryModelCatalog,
  resolveRoute,
} from "@sysone/core";
import { describe, expect, it } from "vitest";
import { loadRecording, replayFetch } from "~/test/replay-http";
import { createMemoryRegistryStore, createRecorder, registrySync } from "./index";

/** What the registry says for a name on a provider: the route decides off TypeSafe. */
function classify(name: string, provider: SystemOneProvider, profiles: readonly ModelProfile[], routes: readonly ModelRoute[]): "pinned" | "moving" {
  if (provider === "typesafe") return classifyModelName(name, profiles);
  const profile = profiles.find((p) => p.id === name);
  const route = profile === undefined ? null : resolveRoute(profile, provider, routes);
  return route?.pinned === true ? "pinned" : "moving";
}

// testing.md table. On OpenRouter every seed route is unpinned (typesafe/jev-1.13 answers with dated
// builds), so the pinned TypeSafe id is moving there; jev-preview has no route at all.
const TABLE: Array<{ name: string; typesafe: "pinned" | "moving"; openrouter: "pinned" | "moving" }> = [
  { name: "jev-latest", typesafe: "moving", openrouter: "moving" },
  { name: "jev-preview", typesafe: "moving", openrouter: "moving" },
  { name: "jev", typesafe: "moving", openrouter: "moving" },
  { name: "jev-1.13", typesafe: "moving", openrouter: "moving" },
  { name: "jev-1.13.0", typesafe: "pinned", openrouter: "moving" },
  { name: "foo-2.0.0", typesafe: "moving", openrouter: "moving" },
];

describe("pinned classification (registry kind only)", () => {
  it.each(TABLE)("$name: typesafe $typesafe, openrouter $openrouter", async ({ name, typesafe, openrouter }) => {
    expect(classify(name, "typesafe", SEED_MODEL_PROFILES, SEED_MODEL_ROUTES)).toBe(typesafe);
    expect(classify(name, "openrouter", SEED_MODEL_PROFILES, SEED_MODEL_ROUTES)).toBe(openrouter);
    // The run engine's catalog agrees, so preflight, lints and runs see the same answer.
    const catalog = createMemoryModelCatalog(SEED_MODEL_PROFILES, SEED_MODEL_ROUTES);
    expect((await catalog.effective(name, "typesafe")).pinned).toBe(typesafe === "pinned");
    expect((await catalog.effective(name, "openrouter")).pinned).toBe(openrouter === "pinned");
  });

  it("foo-2.0.0 (unseen) is inserted by the registry sync as unreviewed and stays moving", async () => {
    const store = createMemoryRegistryStore({ profiles: SEED_MODEL_PROFILES, routes: SEED_MODEL_ROUTES });
    const recorder = createRecorder();
    const fetch = replayFetch([loadRecording(new URL("./__fixtures__/http/", import.meta.url), "typesafe-models-new-name.json")]);
    await registrySync({ store, events: recorder, alerts: recorder, fetch }, { orgId: "00000000-0000-7000-8000-00000000000a", provider: "typesafe", apiKey: "k", now: new Date("2026-09-27T00:00:00Z") });
    const profiles = await store.profiles();
    expect(profiles.find((p) => p.id === "foo-2.0.0")).toMatchObject({ kind: "alias", status: "unreviewed" });
    expect(classify("foo-2.0.0", "typesafe", profiles, SEED_MODEL_ROUTES)).toBe("moving");
  });

  it("follows the registry row, not the shape of the name", () => {
    const base = SEED_MODEL_PROFILES.find((p) => p.id === "jev-1.13.0");
    if (base === undefined) throw new Error("seed has no jev-1.13.0");
    // A versioned-looking id kept as an alias row is moving; an odd name with a versioned row is pinned.
    const profiles: ModelProfile[] = [
      { ...base, id: "jev-2.0.0", kind: "alias", aliasTarget: null },
      { ...base, id: "banana", kind: "versioned", aliasTarget: null },
    ];
    expect(classify("jev-2.0.0", "typesafe", profiles, [])).toBe("moving");
    expect(classify("banana", "typesafe", profiles, [])).toBe("pinned");
  });

  it("off TypeSafe, a pinned route pins only a versioned profile", () => {
    const route = SEED_MODEL_ROUTES.find((r) => r.modelId === "jev-1.13.0");
    const aliasRoute = SEED_MODEL_ROUTES.find((r) => r.modelId === "jev-latest");
    if (route === undefined || aliasRoute === undefined) throw new Error("seed routes missing");
    // What confirming a dated OpenRouter id would change (ADR-011, open question 1).
    const pinnedRoutes: ModelRoute[] = [
      { ...route, providerModelId: "typesafe/jev-1.13-20260917", pinned: true },
      { ...aliasRoute, pinned: true },
    ];
    expect(classify("jev-1.13.0", "openrouter", SEED_MODEL_PROFILES, pinnedRoutes)).toBe("pinned");
    expect(classify("jev-latest", "openrouter", SEED_MODEL_PROFILES, pinnedRoutes)).toBe("moving");
    expect(classify("jev-preview", "openrouter", SEED_MODEL_PROFILES, pinnedRoutes)).toBe("moving");
  });
});
