// The standard run envelope: RunResult, Decision and RunCost.
// Source: references/savings-model.md (Standard run envelope, Money math), with
// references/confidence-policy.md (Escalation) and references/spec-schema.md (section 10).
//
// Money: the wire fields are USD numbers, exactly as savings-model.md defines them. Each one is
// derived from an integer micro-USD value (`micro / 1e6`), so the schema accepts only amounts that
// are whole micro-USD. Core does money math on integers; see usdFromMicro and microFromUsd.
//
// Object schemas here strip unknown keys instead of rejecting them, so an older reader of a newer
// envelope keeps working. Adding a field is still a contract change and needs an ADR.

import { z } from "zod";

import {
  Action,
  Band,
  Channel,
  DecisionId,
  ExperimentArm,
  ExperimentId,
  type MicroUsd,
  QuestionId,
  ReviewItemId,
  RolloutStage,
  RunId,
  SavingsKind,
  SetId,
  TokenCount,
  Value,
  VersionId,
} from "./common.js";
import { ErrorCode } from "./errors.js";
import { SystemOneAnswer } from "./system-one.js";

// ---------------------------------------------------------------------------
// Money on the wire

/** USD from integer micro-USD. Only the envelope builder calls this. */
export function usdFromMicro(micro: MicroUsd): number {
  return micro / 1e6;
}

/** Integer micro-USD from a wire USD amount. Never do money math on the USD value itself. */
export function microFromUsd(usd: number): MicroUsd {
  return Math.round(usd * 1e6);
}

function isWholeMicroUsd(usd: number): boolean {
  const micro = usd * 1e6;
  const rounded = Math.round(micro);
  return Number.isSafeInteger(rounded) && Math.abs(micro - rounded) < 1e-6;
}

/** A USD amount derived from integer micro-USD (`micro / 1e6`). May be negative. */
export const UsdAmount = z
  .number()
  .refine(Number.isFinite, "must be finite")
  .refine(isWholeMicroUsd, "must be a whole number of micro-USD");
export type UsdAmount = z.infer<typeof UsdAmount>;

const LatencyMs = z.number().int().nonnegative();

// ---------------------------------------------------------------------------
// RunCost

export const CounterfactualMode = z.enum(["one_call", "per_question"]);
export type CounterfactualMode = z.infer<typeof CounterfactualMode>;

export const SavingsSuppressed = z.enum(["shadow", "eval", "staging", "experiment"]);
export type SavingsSuppressed = z.infer<typeof SavingsSuppressed>;

export const RunCost = z.object({
  systemOneInputTokens: TokenCount,
  systemOneOutputTokens: TokenCount,
  /** Sum over all calls. Null when any call's model has no price row (BYO key mode). */
  systemOneCostUsd: UsdAmount.nullable(),
  counterfactualInputTokens: TokenCount,
  counterfactualOutputTokens: TokenCount,
  counterfactualLlmCostUsd: UsdAmount,
  comparatorModel: z.string().min(1),
  counterfactualMode: CounterfactualMode,
  /** 0 whenever savingsSuppressed is set. May be negative. */
  savingsUsd: UsdAmount,
  savingsKind: SavingsKind,
  savingsSuppressed: SavingsSuppressed.nullable(),
  llmCallsAvoided: TokenCount,
  contextTokensPruned: z.number().int().optional(),
  /** Actual LLM spend from escalate_to_llm. */
  escalationCostUsd: UsdAmount,
  llmCallsMade: TokenCount,
  estimated: z.literal(true),
  latencyMs: LatencyMs,
});
export type RunCost = z.infer<typeof RunCost>;

// ---------------------------------------------------------------------------
// Decision

export const DecisionKind = z.enum(["question", "composite"]);
export type DecisionKind = z.infer<typeof DecisionKind>;

/** Composite magnitude from levelThresholds. */
export const Level = z.enum(["high", "medium", "low"]);
export type Level = z.infer<typeof Level>;

export const EscalationStatus = z.enum(["ok", "failed"]);
export type EscalationStatus = z.infer<typeof EscalationStatus>;

/** The escalate_to_llm result. Decision.value keeps the System One answer. */
export const Escalation = z.object({
  model: z.string().min(1),
  value: Value,
  costUsd: UsdAmount,
  status: EscalationStatus,
  error: z.string().optional(),
});
export type Escalation = z.infer<typeof Escalation>;

export const Decision = z
  .object({
    kind: DecisionKind,
    /**
     * choice: option key; score: score; noul: true or false, null in the noul low band;
     * composite: its 0..1 value; null for a skipped question or a composite with no term left.
     */
    value: Value,
    /** Certainty. For a composite, the minimum band of its question terms. */
    band: Band,
    /** Composites only: magnitude from levelThresholds. Picks the action. */
    level: Level.optional(),
    relevant: z.boolean(),
    /** What the policy says. */
    action: Action,
    /** What the rollout stage allows. Callers act on this. */
    effectiveAction: Action,
    /** Whether it ran: handlers, the LLM call, the review item, the fallback. */
    executed: z.boolean(),
    escalation: Escalation.optional(),
    /**
     * Set only when the policy action is a `set` FallbackConfig and a linked run row was written
     * (spec-schema.md section 7). Points at that run, or at the failed run when the linked run
     * failed after its row was written. `value` never changes; callers read the linked result with
     * `GET /api/v1/runs/{fallbackRunId}`.
     */
    fallbackRunId: RunId.optional(),
  })
  .superRefine((d, ctx) => {
    if (d.kind === "question" && d.level !== undefined) {
      ctx.addIssue({ code: "custom", path: ["level"], message: "level is for composites only" });
    }
    if (!d.relevant && d.effectiveAction !== "fallback") {
      ctx.addIssue({
        code: "custom",
        path: ["effectiveAction"],
        message: "an irrelevant decision has effectiveAction fallback",
      });
    }
  });
export type Decision = z.infer<typeof Decision>;

// ---------------------------------------------------------------------------
// Stages and calls

export const RunCall = z.object({
  /** Prices use it, per call. */
  modelResolved: z.string().min(1),
  typesafeRequestId: z.string().nullable(),
  inputTokens: TokenCount,
  outputTokens: TokenCount,
  latencyMs: LatencyMs,
});
export type RunCall = z.infer<typeof RunCall>;

/** One entry per spec stage, in spec order. */
export const RunStage = z.object({
  id: z.string().min(1),
  /** Its `when` was false on input and checks. */
  skipped: z.boolean(),
  /** One per System One request; preflight batch splits add calls. */
  calls: z.array(RunCall),
});
export type RunStage = z.infer<typeof RunStage>;

// ---------------------------------------------------------------------------
// RunResult

export const RunStatus = z.enum(["ok", "error", "rate_limited", "quota_exceeded"]);
export type RunStatus = z.infer<typeof RunStatus>;

export const RunExperiment = z.object({ id: ExperimentId, arm: ExperimentArm });
export type RunExperiment = z.infer<typeof RunExperiment>;

/**
 * Why a run did not finish with status "ok". `code` is the api.md code the error envelope carries
 * for the persisted failed run (`runs.error_code`), for example `system_one_unavailable` when the
 * latency budget ran out.
 */
export const RunError = z.object({
  code: ErrorCode,
  message: z.string(),
});
export type RunError = z.infer<typeof RunError>;

/** The RunResult object without its cross-field checks, for callers that need `.shape`. */
export const RunResultObject = z.object({
  runId: RunId,
  setId: SetId,
  version: z.number().int().positive(),
  versionId: VersionId,
  interfaceMajor: z.number().int().nonnegative(),
  interfaceHash: z.string().min(1),
  channel: Channel,
  /** From the channel pointer, never the spec. "shadow" for slug@draft; the caller channel's stage for pinned runs. */
  rollout: RolloutStage,
  experiment: RunExperiment.optional(),
  status: RunStatus,
  /** Present exactly when status is not "ok". */
  error: RunError.optional(),
  modelRequested: z.string().min(1),
  /** The first call's versioned id. Null only when no call was made. */
  modelResolved: z.string().min(1).nullable(),
  /** The first call's x-typesafe-request-id header. */
  typesafeRequestId: z.string().nullable(),
  stages: z.array(RunStage),
  /** spec.checks results by check id, evaluated before any call. */
  checks: z.record(DecisionId, z.boolean()),
  /** Raw typed answers. A question in a skipped spec stage has no entry. */
  answers: z.record(QuestionId, SystemOneAnswer),
  decisions: z.record(DecisionId, Decision),
  runBand: Band,
  /** The most conservative effectiveAction among relevant decisions. */
  overallAction: Action,
  route: z.string().nullable(),
  cost: RunCost,
  /** Review items of kind "action" this run created. */
  reviewItemIds: z.array(ReviewItemId).optional(),
  /** For example "unknown_answer_type", "model_unpriced", "model_resolved_mixed". */
  warnings: z.array(z.string()),
});

export const RunResult = RunResultObject.superRefine((r, ctx) => {
  if ((r.status === "ok") !== (r.error === undefined)) {
    ctx.addIssue({
      code: "custom",
      path: ["error"],
      message: r.status === "ok" ? "an ok run has no error" : "a failed run carries its error code",
    });
  }
  const calls = r.stages.flatMap((s) => s.calls);
  const first = calls[0];
  if (first === undefined) {
    if (r.modelResolved !== null) {
      ctx.addIssue({ code: "custom", path: ["modelResolved"], message: "must be null when no call was made" });
    }
  } else if (r.modelResolved !== first.modelResolved) {
    ctx.addIssue({ code: "custom", path: ["modelResolved"], message: "must equal the first call's modelResolved" });
  }
  for (const [i, s] of r.stages.entries()) {
    if (s.skipped && s.calls.length > 0) {
      ctx.addIssue({ code: "custom", path: ["stages", i, "calls"], message: "a skipped stage makes no call" });
    }
  }
  const inputTokens = calls.reduce((n, c) => n + c.inputTokens, 0);
  const outputTokens = calls.reduce((n, c) => n + c.outputTokens, 0);
  if (r.cost.systemOneInputTokens !== inputTokens) {
    ctx.addIssue({
      code: "custom",
      path: ["cost", "systemOneInputTokens"],
      message: "must be the sum of inputTokens over all calls",
    });
  }
  if (r.cost.systemOneOutputTokens !== outputTokens) {
    ctx.addIssue({
      code: "custom",
      path: ["cost", "systemOneOutputTokens"],
      message: "must be the sum of outputTokens over all calls",
    });
  }
  if (r.cost.savingsSuppressed !== null && r.cost.savingsUsd !== 0) {
    ctx.addIssue({ code: "custom", path: ["cost", "savingsUsd"], message: "must be 0 when savingsSuppressed is set" });
  }
});
export type RunResult = z.infer<typeof RunResult>;
