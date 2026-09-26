// The System One wire contract: the request body we send and the response we parse.
// Sources: references/system-one-api-contract.md (request, response, API-wide limits) and
// references/spec-schema.md (section 9). Response schemas are loose (passthrough) so fields a newer
// API adds are kept. Runs store the raw answer JSON.

import { z } from "zod";
import { QuestionId, Structured, TokenCount } from "./common.js";
import { QuestionTypeId, isQuestionTypeId } from "./question-types.js";

// ---------------------------------------------------------------------------
// API-wide rules. They hold for every model; per-model limits live in ModelProfile.

export const SYSTEM_ONE_LIMITS = {
  /** Options per choice, at most. */
  maxChoiceOptions: 255,
  /** Score levels, at least. */
  minScoreLevels: 2,
  /** Score levels, at most. */
  maxScoreLevels: 10,
} as const;

// ---------------------------------------------------------------------------
// Request

/** One entry of `SystemOneRequest.questions`: the API question body a QuestionTypeModule compiles. */
export const SystemOneQuestion = z.strictObject({
  type: QuestionTypeId,
  instructions: Structured,
  /** Noul: `{ true, false }`. Choice: option map. Score: ordered level array. */
  criteria: Structured.optional(),
});
export type SystemOneQuestion = z.infer<typeof SystemOneQuestion>;

/** The body of `POST /v1/systemone`. `state` is a string, a JSON object or an array. */
export const SystemOneRequest = z.strictObject({
  state: z.unknown(),
  model: z.string().min(1),
  questions: z
    .record(QuestionId, SystemOneQuestion)
    .refine((q) => Object.keys(q).length > 0, "questions needs at least one entry"),
});
export type SystemOneRequest = z.infer<typeof SystemOneRequest>;

// ---------------------------------------------------------------------------
// Answers

export const NoulAnswer = z.looseObject({
  type: z.literal("noul"),
  /** Probability of yes, 0 to 1. Near 0.5 means equally likely, not medium intensity. */
  noul: z.number(),
});
export type NoulAnswer = z.infer<typeof NoulAnswer>;

export const ChoiceAnswer = z.looseObject({
  type: z.literal("choice"),
  choice: z.string(),
  probabilities: z.record(z.string(), z.number()),
  confidence: z.number(),
});
export type ChoiceAnswer = z.infer<typeof ChoiceAnswer>;

export const ScoreAnswer = z.looseObject({
  type: z.literal("score"),
  /** Probability weighted; can land between levels. */
  score: z.number(),
  legend: z.record(z.string(), Structured),
  probabilities: z.record(z.string(), z.number()),
  confidence: z.number(),
});
export type ScoreAnswer = z.infer<typeof ScoreAnswer>;

/**
 * An answer whose `type` no question-type module knows. Every other field is kept as sent. The refine
 * matters: a known type that fails its own variant stays a parse error instead of passing as unknown.
 */
export const UnknownAnswer = z.looseObject({
  type: z.string().refine((t) => !isQuestionTypeId(t), "a known answer type must match its own variant"),
});
export type UnknownAnswer = z.infer<typeof UnknownAnswer>;

export const KnownAnswer = z.discriminatedUnion("type", [NoulAnswer, ChoiceAnswer, ScoreAnswer]);
export type KnownAnswer = z.infer<typeof KnownAnswer>;

/** A union with a fallthrough branch, so a new answer type is stored raw instead of failing the run. */
export const SystemOneAnswer = z.union([KnownAnswer, UnknownAnswer]);
export type SystemOneAnswer = z.infer<typeof SystemOneAnswer>;

/** True when core has a module for this answer's type. */
export function isKnownAnswer(answer: SystemOneAnswer): answer is KnownAnswer {
  return isQuestionTypeId(answer.type);
}

// ---------------------------------------------------------------------------
// Response

export const SystemOneUsage = z.looseObject({
  input_tokens: TokenCount,
  output_tokens: TokenCount,
});
export type SystemOneUsage = z.infer<typeof SystemOneUsage>;

export const SystemOneResponse = z.looseObject({
  /** The versioned id that answered, even when the request sent an alias. Stored as model_resolved. */
  model: z.string().min(1),
  answers: z.record(z.string(), SystemOneAnswer),
  usage: SystemOneUsage,
});
export type SystemOneResponse = z.infer<typeof SystemOneResponse>;
