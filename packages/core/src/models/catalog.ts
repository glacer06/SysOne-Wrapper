// Seed rows for the System One model registry (`system_one_models`) and its price book row.
// Source: references/system-one-models.md section 13 (seed table), section 14 (default model) and
// references/system-one-api-contract.md (Limits, Pricing). Facts checked against docs.typesafe.ai
// and openapi.json 0.2.0 on 2026-09-26. The live docs win: when they change, update this file and
// the seed table in the same PR (system-one-models.md section 12).
//
// Tests and the table seed read these rows. Runtime code reads profiles through the ModelCatalog
// port, never from this file. Catalog data may say Jev; code identifiers stay neutral.

import { KNOWN_WEAKNESS_IDS, ModelProfile, type ModelProfileInput } from "../contracts/models.js";
import type { ModelPrice } from "../contracts/ports.js";

const DOCS_URL = "https://docs.typesafe.ai/models.md";
const LAST_REVIEWED = "2026-09-26";

/** jev-1.13.0: the only versioned row, so the only pinned one. */
const JEV_1_13_0: ModelProfileInput = {
  id: "jev-1.13.0",
  family: "jev",
  kind: "versioned",
  aliasTarget: null,
  status: "stable",
  // Stays null until the platform admin confirms it: GET /v1/models reports dates for aliases only.
  releaseDate: null,
  retireAt: null,
  questionTypes: ["noul", "choice", "score"],
  limits: {
    requestTokens: 64_000,
    statePlusLongestQuestionTokens: 32_000,
    rpm: 1_200,
    tokensPerSec: 250_000,
  },
  // English is the strongest language. Language strength is not a profile field; see the seed notes.
  inputModalities: ["text"],
  weaknesses: [...KNOWN_WEAKNESS_IDS],
  supersedes: [],
  docsUrl: DOCS_URL,
  jaggednessUrl: "https://docs.typesafe.ai/model-jaggedness/jev-1.13.md",
  lastReviewed: LAST_REVIEWED,
};

/**
 * Alias rows copy the target's limits, question types, input modalities and weaknesses only to stay
 * valid rows with non-null limits. ModelCatalog never uses them for a moving name; it uses the
 * profile of the observed target.
 */
function aliasOf(id: string, status: "stable" | "preview", target: ModelProfileInput): ModelProfileInput {
  return {
    id,
    family: target.family,
    kind: "alias",
    aliasTarget: target.id,
    status,
    releaseDate: null,
    retireAt: null,
    questionTypes: [...target.questionTypes],
    limits: target.limits === null ? null : { ...target.limits },
    inputModalities: [...target.inputModalities],
    weaknesses: [...target.weaknesses],
    supersedes: [],
    docsUrl: DOCS_URL,
    jaggednessUrl: null,
    lastReviewed: LAST_REVIEWED,
  };
}

const SEED_INPUT: readonly ModelProfileInput[] = [
  JEV_1_13_0,
  aliasOf("jev-latest", "stable", JEV_1_13_0),
  // TypeSafe says jev-preview moves ahead of jev-latest when a preview build exists. None exists today.
  aliasOf("jev-preview", "preview", JEV_1_13_0),
];

/** Seed ModelProfile rows, parsed at load so a bad edit fails loudly. */
export const SEED_MODEL_PROFILES: readonly ModelProfile[] = Object.freeze(
  SEED_INPUT.map((row) => ModelProfile.parse(row)),
);

/** Seed value of the platform setting `defaultModel`: a stable versioned id (section 14). */
export const SEED_PLATFORM_DEFAULT_MODEL = "jev-1.13.0";

/** A platform `price_books` row (org_id null) for a System One model, keyed by exact versioned id. */
export interface SeedModelPrice extends ModelPrice {
  model: string;
}

/**
 * Platform price rows. Prices are not part of a ModelProfile (ADR-008 section 6). jev-1.13.0 costs
 * $0.042 per million input tokens (42,000 micro-USD) and output is currently free; the zero is
 * data, not an assumption.
 */
export const SEED_SYSTEM_ONE_PRICES: readonly SeedModelPrice[] = Object.freeze([
  { model: "jev-1.13.0", inputPerMtokMicroUsd: 42_000, outputPerMtokMicroUsd: 0 },
]);
