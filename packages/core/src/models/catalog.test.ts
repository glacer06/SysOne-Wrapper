import { describe, expect, it } from "vitest";

import { KNOWN_WEAKNESS_IDS, ModelProfile, classifyModelName } from "../contracts/models.js";
import { ModelPrice } from "../contracts/ports.js";
import { SEED_MODEL_PROFILES, SEED_PLATFORM_DEFAULT_MODEL, SEED_SYSTEM_ONE_PRICES } from "./catalog.js";

function row(id: string): ModelProfile {
  const found = SEED_MODEL_PROFILES.find((p) => p.id === id);
  if (found === undefined) throw new Error(`missing seed row ${id}`);
  return found;
}

describe("seed catalog", () => {
  it("has exactly jev-1.13.0, jev-latest and jev-preview", () => {
    expect(SEED_MODEL_PROFILES.map((p) => p.id)).toEqual(["jev-1.13.0", "jev-latest", "jev-preview"]);
  });

  it.each(SEED_MODEL_PROFILES.map((p) => [p.id, p] as const))("%s parses as ModelProfile", (_id, profile) => {
    expect(ModelProfile.parse(profile)).toEqual(profile);
  });

  it("classifies jev-1.13.0 as pinned and the aliases as moving", () => {
    expect(classifyModelName("jev-1.13.0", SEED_MODEL_PROFILES)).toBe("pinned");
    expect(classifyModelName("jev-latest", SEED_MODEL_PROFILES)).toBe("moving");
    expect(classifyModelName("jev-preview", SEED_MODEL_PROFILES)).toBe("moving");
    // Partial ids are not seeded, so they stay moving.
    expect(classifyModelName("jev", SEED_MODEL_PROFILES)).toBe("moving");
    expect(classifyModelName("jev-1.13", SEED_MODEL_PROFILES)).toBe("moving");
  });

  it("matches the jev-1.13.0 seed table row", () => {
    const jev = row("jev-1.13.0");
    expect(jev).toMatchObject({
      family: "jev",
      kind: "versioned",
      status: "stable",
      aliasTarget: null,
      releaseDate: null,
      retireAt: null,
      questionTypes: ["noul", "choice", "score"],
      limits: { requestTokens: 64_000, statePlusLongestQuestionTokens: 32_000, rpm: 1_200, tokensPerSec: 250_000 },
      inputModalities: ["text"],
      supersedes: [],
      docsUrl: "https://docs.typesafe.ai/models.md",
      jaggednessUrl: "https://docs.typesafe.ai/model-jaggedness/jev-1.13.md",
      lastReviewed: "2026-09-26",
    });
    expect(jev.weaknesses).toEqual([...KNOWN_WEAKNESS_IDS]);
  });

  it("gives the aliases the documented status and target, copying the target's facts", () => {
    const jev = row("jev-1.13.0");
    for (const [id, status] of [
      ["jev-latest", "stable"],
      ["jev-preview", "preview"],
    ] as const) {
      const a = row(id);
      expect(a).toMatchObject({
        family: "jev",
        kind: "alias",
        status,
        aliasTarget: "jev-1.13.0",
        releaseDate: null,
        retireAt: null,
        jaggednessUrl: null,
        supersedes: [],
        docsUrl: "https://docs.typesafe.ai/models.md",
        lastReviewed: "2026-09-26",
      });
      expect(a.limits).toEqual(jev.limits);
      expect(a.questionTypes).toEqual(jev.questionTypes);
      expect(a.inputModalities).toEqual(jev.inputModalities);
      expect(a.weaknesses).toEqual(jev.weaknesses);
    }
  });

  it("points every alias at a versioned seed row", () => {
    for (const p of SEED_MODEL_PROFILES.filter((r) => r.kind === "alias")) {
      expect(p.aliasTarget).not.toBeNull();
      expect(classifyModelName(p.aliasTarget ?? "", SEED_MODEL_PROFILES)).toBe("pinned");
    }
  });

  it("seeds the platform default as a stable versioned row", () => {
    const d = row(SEED_PLATFORM_DEFAULT_MODEL);
    expect(d.kind).toBe("versioned");
    expect(d.status).toBe("stable");
  });
});

describe("seed prices", () => {
  it("prices jev-1.13.0 at $0.042 per million input tokens with free output", () => {
    expect(SEED_SYSTEM_ONE_PRICES).toEqual([
      { model: "jev-1.13.0", inputPerMtokMicroUsd: 42_000, outputPerMtokMicroUsd: 0 },
    ]);
  });

  it("keys every price row by a versioned id, never an alias", () => {
    for (const { model, ...price } of SEED_SYSTEM_ONE_PRICES) {
      expect(ModelPrice.safeParse(price).success).toBe(true);
      expect(classifyModelName(model, SEED_MODEL_PROFILES)).toBe("pinned");
    }
  });

  it("keeps prices out of the profiles", () => {
    for (const p of SEED_MODEL_PROFILES) {
      expect(Object.keys(p).some((k) => k.toLowerCase().includes("price"))).toBe(false);
    }
  });
});
