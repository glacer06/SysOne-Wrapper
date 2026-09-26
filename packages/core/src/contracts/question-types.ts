// Question types: the closed v1 union, one QuestionDef variant per type, and the QuestionTypeModule
// interface every per-type module in packages/core/src/question-types implements.
// Sources: references/spec-schema.md (section 9), references/architecture.md (QuestionSetSpec),
// references/system-one-api-contract.md (question types), ADR-008 section 5.

import { z } from "zod";
import { type Band, JsonValue, type QuestionId, Structured, type Value } from "./common.js";
import type { ChoicePolicy, NoulPolicy, ScorePolicy } from "./policy.js";
import type { LintResult, QuestionCompositeTerm } from "./spec.js";
import type {
  ChoiceAnswer,
  NoulAnswer,
  ScoreAnswer,
  SystemOneQuestion,
} from "./system-one.js";

// ---------------------------------------------------------------------------
// Type ids

/** The v1 question types. Closed by design: a new type is an ADR, one module and one React renderer. */
export const QUESTION_TYPE_IDS = ["noul", "choice", "score"] as const;

export const QuestionTypeId = z.enum(QUESTION_TYPE_IDS);
export type QuestionTypeId = z.infer<typeof QuestionTypeId>;

/** True when `type` names a question type core has a module for. */
export function isQuestionTypeId(type: string): type is QuestionTypeId {
  return (QUESTION_TYPE_IDS as readonly string[]).includes(type);
}

/** Which React renderer draws a question type. */
export const UiKind = z.enum(["boolean", "options", "scale"]);
export type UiKind = z.infer<typeof UiKind>;

// ---------------------------------------------------------------------------
// QuestionDef (architecture.md QuestionSetSpec, system-one-api-contract.md question types)

/** Display metadata. Free-form: keys beyond these are kept. */
export const QuestionMeta = z.looseObject({
  label: z.string().min(1),
  description: z.string().optional(),
  templateId: z.string().optional(),
});
export type QuestionMeta = z.infer<typeof QuestionMeta>;

/** Noul criteria: what true and what false mean. Other keys are kept as JSON. */
export const NoulCriteria = z
  .object({
    true: Structured.optional(),
    false: Structured.optional(),
  })
  .catchall(JsonValue);
export type NoulCriteria = z.infer<typeof NoulCriteria>;

/** Choice criteria: option key to description, or null for no description. At least one option. */
export const ChoiceCriteria = z
  .record(z.string().min(1), Structured.nullable())
  .refine((c) => Object.keys(c).length > 0, "a choice needs at least one option");
export type ChoiceCriteria = z.infer<typeof ChoiceCriteria>;

/** Score criteria: ordered levels, lowest first. The 2 to 10 range is lint `score.levels_range`. */
export const ScoreCriteria = z.array(Structured);
export type ScoreCriteria = z.infer<typeof ScoreCriteria>;

export const NoulQuestion = z.strictObject({
  type: z.literal("noul"),
  instructions: Structured,
  criteria: NoulCriteria.optional(),
  meta: QuestionMeta,
});
export type NoulQuestion = z.infer<typeof NoulQuestion>;

export const ChoiceQuestion = z.strictObject({
  type: z.literal("choice"),
  instructions: Structured,
  criteria: ChoiceCriteria,
  meta: QuestionMeta,
});
export type ChoiceQuestion = z.infer<typeof ChoiceQuestion>;

export const ScoreQuestion = z.strictObject({
  type: z.literal("score"),
  instructions: Structured,
  criteria: ScoreCriteria,
  meta: QuestionMeta,
});
export type ScoreQuestion = z.infer<typeof ScoreQuestion>;

/** One question in a spec stage. The id is its key in `stages[].questions`. */
export const QuestionDef = z.discriminatedUnion("type", [NoulQuestion, ChoiceQuestion, ScoreQuestion]);
export type QuestionDef = z.infer<typeof QuestionDef>;

// ---------------------------------------------------------------------------
// QuestionTypeModule (spec-schema.md section 9)

/** What a type contributes to the manifest for the embed and codegen. The manifest adds the question id. */
export interface ManifestQuestion {
  type: QuestionTypeId;
  label: string;
  description?: string;
  /** Choice option keys, in spec order. */
  options?: string[];
  /** Score level count. */
  levels?: number;
}

/** A type-specific lint. `path` is the JSON Pointer of the question in the spec. */
export type QuestionTypeLint<Q extends QuestionDef = QuestionDef> = (
  question: Q,
  at: { questionId: QuestionId; path: string },
) => LintResult[];

/**
 * All per-type logic. The router, compiler, composites, manifest, editor and Studio iterate the
 * module map instead of switching on the type string.
 */
export interface QuestionTypeModule<
  Q extends QuestionDef = QuestionDef,
  A = unknown,
  P = unknown,
> {
  id: Q["type"];
  /** This type's QuestionDef variant. */
  questionSchema: z.ZodType<Q>;
  /** This type's SystemOneAnswer variant (passthrough). */
  answerSchema: z.ZodType<A>;
  /** The API question body. */
  compile(question: Q): SystemOneQuestion;
  /** Value and band, by the rules in confidence-policy.md. */
  band(answer: A, policy: P): { value: Value; band: Band };
  /** 0 to 1 composite term value. */
  compositeValue?(answer: A, term: QuestionCompositeTerm): number;
  lints: QuestionTypeLint<Q>[];
  manifestHint(question: Q): ManifestQuestion;
  uiKind: UiKind;
}

export type NoulTypeModule = QuestionTypeModule<NoulQuestion, NoulAnswer, NoulPolicy>;
export type ChoiceTypeModule = QuestionTypeModule<ChoiceQuestion, ChoiceAnswer, ChoicePolicy>;
export type ScoreTypeModule = QuestionTypeModule<ScoreQuestion, ScoreAnswer, ScorePolicy>;

/** The shape of `questionTypes` in packages/core/src/question-types/index.ts. */
export interface QuestionTypeModules {
  noul: NoulTypeModule;
  choice: ChoiceTypeModule;
  score: ScoreTypeModule;
}
