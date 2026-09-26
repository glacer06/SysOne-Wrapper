// The System One model registry contract: one ModelProfile per row of `system_one_models`.
// Sources: references/system-one-models.md (sections 3 to 5, 10 and 13), ADR-008 section 1 and 2.
//
// Model facts are data. Limits, question types and weaknesses come from these rows, never from
// constants in code. Prices are not part of a profile: they live in `price_books`, keyed by the
// exact versioned id (ADR-008 section 6), and reach core through the PriceBook port.

import { z } from "zod";

import { QuestionTypeId } from "./question-types.js";

const IsoDate = z.iso.date();

// ---------------------------------------------------------------------------
// Enums

/** Only `versioned` rows are pinned. Aliases, partial ids and unknown names are moving. */
export const ModelKind = z.enum(["versioned", "alias"]);
export type ModelKind = z.infer<typeof ModelKind>;

/** Registry lifecycle (system-one-models.md section 5). */
export const ModelStatus = z.enum(["unreviewed", "preview", "stable", "deprecated", "retired"]);
export type ModelStatus = z.infer<typeof ModelStatus>;

/**
 * Weakness ids documented for jev-1.13.0 (system-one-models.md section 10). A profile's
 * `weaknesses` is a plain string list, so a future model can carry an id that is not listed here.
 * Weakness lints fire only for ids the target profile lists.
 */
export const KNOWN_WEAKNESS_IDS = [
  "literal_reading",
  "counting",
  "arithmetic",
  "numeric_precision",
  "date_comparison",
  "indirection",
  "large_irrelevant_state",
  "adversarial_state",
  "contradictory_criteria",
  "inverted_noul",
  "structural_invariants",
  "generation",
] as const;

export const WeaknessId = z.enum(KNOWN_WEAKNESS_IDS);
export type WeaknessId = z.infer<typeof WeaknessId>;

// ---------------------------------------------------------------------------
// Limits

const PositiveInt = z.number().int().positive();

/** Published per-model limits. Rate limits can change without notice; treat them as of `lastReviewed`. */
export const ModelLimits = z
  .strictObject({
    /** State plus all questions. */
    requestTokens: PositiveInt,
    statePlusLongestQuestionTokens: PositiveInt,
    /** Published requests per minute per account. */
    rpm: PositiveInt,
    tokensPerSec: PositiveInt,
  })
  .refine((l) => l.statePlusLongestQuestionTokens <= l.requestTokens, {
    path: ["statePlusLongestQuestionTokens"],
    message: "must not exceed requestTokens",
  });
export type ModelLimits = z.infer<typeof ModelLimits>;

// ---------------------------------------------------------------------------
// ModelProfile

/**
 * One registry row. Strict: the platform admin writes these by hand, so a misspelled key fails.
 *
 * Rules checked here:
 * - `limits` is null only on an `unreviewed` row.
 * - `aliasTarget` is set only on alias rows (a versioned row never points elsewhere).
 * - `questionTypes` has no duplicates.
 */
const modelProfileShape = {
  /** "jev-1.13.0", "jev-latest". TypeSafe's name, kept as is. */
  id: z.string().min(1),
  /** "jev". */
  family: z.string().min(1),
  kind: ModelKind,
  /** Last observed versioned id, aliases only. Null until detection sees one. */
  aliasTarget: z.string().min(1).nullable(),
  status: ModelStatus,
  /** YYYY-MM-DD. */
  releaseDate: IsoDate.nullable(),
  /** YYYY-MM-DD. After this date the row is `retired`. */
  retireAt: IsoDate.nullable(),
  /** Subset of the closed v1 union. */
  questionTypes: z.array(QuestionTypeId),
  /** Null only while `unreviewed`. */
  limits: ModelLimits.nullable(),
  /** ["text"]. */
  inputModalities: z.array(z.string().min(1)),
  /** Weakness ids, see KNOWN_WEAKNESS_IDS. */
  weaknesses: z.array(z.string().min(1)),
  /**
   * Model or family ids this model can replace (system-one-models.md sections 3 and 11). Set by
   * the platform admin at review; [] for none. Required: without it a new family never shows up
   * as an upgrade. Rows written before this field are backfilled by the migration, not here.
   */
  supersedes: z.array(z.string().min(1)),
  docsUrl: z.url(),
  jaggednessUrl: z.url().nullable(),
  /** YYYY-MM-DD: the date a human checked the row against the docs. */
  lastReviewed: IsoDate,
};

/** The row rules listed above, shared by ModelProfile and ModelListItem. */
function checkModelProfile(
  p: z.output<z.ZodObject<typeof modelProfileShape>>,
  ctx: z.RefinementCtx,
): void {
  if (p.limits === null && p.status !== "unreviewed") {
    ctx.addIssue({
      code: "custom",
      path: ["limits"],
      message: `limits may be null only on an unreviewed row, not on a ${p.status} row`,
    });
  }
  if (p.kind === "versioned" && p.aliasTarget !== null) {
    ctx.addIssue({
      code: "custom",
      path: ["aliasTarget"],
      message: "a versioned row has no aliasTarget",
    });
  }
  if (new Set(p.questionTypes).size !== p.questionTypes.length) {
    ctx.addIssue({ code: "custom", path: ["questionTypes"], message: "must not repeat a question type" });
  }
}

export const ModelProfile = z.strictObject(modelProfileShape).superRefine(checkModelProfile);
export type ModelProfile = z.infer<typeof ModelProfile>;
export type ModelProfileInput = z.input<typeof ModelProfile>;

/**
 * One item of `model.list` (system-one-models.md section 14): a ModelProfile plus whether it is the
 * calling org's default model. Built from the shape, since zod v4 cannot extend a refined object.
 */
export const ModelListItem = z
  .strictObject({ ...modelProfileShape, isDefault: z.boolean() })
  .superRefine(checkModelProfile);
export type ModelListItem = z.infer<typeof ModelListItem>;

// ---------------------------------------------------------------------------
// Pinned or moving

export const ModelPinning = z.enum(["pinned", "moving"]);
export type ModelPinning = z.infer<typeof ModelPinning>;

/** True only for a registry row of kind `versioned`. A missing row is moving. */
export function isPinnedProfile(profile: Pick<ModelProfile, "kind"> | null | undefined): boolean {
  return profile?.kind === "versioned";
}

/**
 * Classify a model name against registry rows by exact id. Never inferred from the shape of the
 * name: `jev-1.13` or an unseen `foo-2.0.0` is moving because no versioned row has that id.
 */
export function classifyModelName(
  name: string,
  profiles: Iterable<Pick<ModelProfile, "id" | "kind">>,
): ModelPinning {
  for (const p of profiles) {
    if (p.id === name) return isPinnedProfile(p) ? "pinned" : "moving";
  }
  return "moving";
}
