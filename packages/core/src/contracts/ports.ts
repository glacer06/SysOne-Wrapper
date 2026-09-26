// The run ports: what runQuestionSet needs from the outside world.
// Source: references/architecture.md (Core contracts, Ports). ADR-008 adds ModelCatalog.
//
// Ports are TypeScript interfaces, not zod schemas. Their payloads are zod schemas here, so
// fixtures and mocks validate against them. Each port has an in-memory or fixture implementation
// for tests: most in core, FixtureTransport in system-one-client, the fixture LlmTransport in
// llm-client. Payload schemas are strict: these values never cross a version boundary.

import { z } from "zod";

import {
  Channel,
  DecisionId,
  type EpochMs,
  ExperimentArm,
  ExperimentId,
  KeyMode,
  MicroUsdPerMtok,
  type PiiMode,
  ReviewItemId,
  RolloutStage,
  RunId,
  TokenCount,
  VersionId,
} from "./common.js";
import { ModelProfile } from "./models.js";
import { RunResult } from "./run.js";
import { QuestionSetSpec, RunRequest } from "./spec.js";
import { type SystemOneRequest, SystemOneResponse } from "./system-one.js";
import type { TenantContext } from "./tenant.js";

// ---------------------------------------------------------------------------
// SystemOneTransport

/** Configures the SDK's own retries. It is not a second retry loop. */
export const RetryBudget = z.strictObject({
  maxRetries: z.number().int().nonnegative(),
  maxRetryAfterMs: z.number().int().nonnegative(),
});
export type RetryBudget = z.infer<typeof RetryBudget>;

export interface SystemOneCallOptions {
  apiKey: string;
  signal: AbortSignal;
  /** Per attempt. */
  timeoutMs: number;
  retry: RetryBudget;
}

export const SystemOneCallResult = z.strictObject({
  response: SystemOneResponse,
  /** The x-typesafe-request-id header. */
  requestId: z.string().nullable(),
});
export type SystemOneCallResult = z.infer<typeof SystemOneCallResult>;

/** One System One request. Throws a mapped system_one_* error (system-one-api-contract.md). */
export interface SystemOneTransport {
  call(req: SystemOneRequest, opts: SystemOneCallOptions): Promise<SystemOneCallResult>;
}

// ---------------------------------------------------------------------------
// ModelCatalog

export const EffectiveModel = z.strictObject({
  /** For a moving name, the profile of its last observed resolved model. */
  profile: ModelProfile.nullable(),
  /** True only for a registry row of kind "versioned". */
  pinned: z.boolean(),
  resolvedId: z.string().nullable(),
});
export type EffectiveModel = z.infer<typeof EffectiveModel>;

/** id to ModelProfile. Whether a name is pinned comes from the registry, never a pattern match. */
export interface ModelCatalog {
  get(id: string): Promise<ModelProfile | null>;
  effective(name: string): Promise<EffectiveModel>;
}

// ---------------------------------------------------------------------------
// KeyResolver

/** The org's TypeSafe key. Only tenancy decrypts it; it never leaves the server. */
export const ResolvedKey = z.strictObject({
  apiKey: z.string().min(1),
  mode: KeyMode,
});
export type ResolvedKey = z.infer<typeof ResolvedKey>;

export type KeyResolver = (ctx: TenantContext) => Promise<ResolvedKey>;

// ---------------------------------------------------------------------------
// RateLimiter and QuotaGuard

export const RateLimitBucket = z.enum(["run", "eval"]);
export type RateLimitBucket = z.infer<typeof RateLimitBucket>;

export const RateLimitReason = z.enum(["org", "key", "global", "eval"]);
export type RateLimitReason = z.infer<typeof RateLimitReason>;

export const RateLimitResult = z.discriminatedUnion("ok", [
  z.strictObject({ ok: z.literal(true) }),
  z.strictObject({
    ok: z.literal(false),
    retryAfterMs: z.number().int().nonnegative(),
    reason: RateLimitReason,
  }),
]);
export type RateLimitResult = z.infer<typeof RateLimitResult>;

/** Per-org, per-key and global limiters, keyed by model. */
export type RateLimiter = (
  ctx: TenantContext,
  model: string,
  estTokens: number,
  bucket: RateLimitBucket,
) => Promise<RateLimitResult>;

export const QuotaFailureCode = z.enum(["quota_exceeded", "token_budget_exceeded"]);
export type QuotaFailureCode = z.infer<typeof QuotaFailureCode>;

export const QuotaResult = z.discriminatedUnion("ok", [
  z.strictObject({ ok: z.literal(true) }),
  z.strictObject({ ok: z.literal(false), code: QuotaFailureCode }),
]);
export type QuotaResult = z.infer<typeof QuotaResult>;

/** Plan quota and the agent token's daily spend cap. */
export type QuotaGuard = (ctx: TenantContext, model: string, estTokens: number) => Promise<QuotaResult>;

// ---------------------------------------------------------------------------
// RunSink

/** runs.stages as the sink receives it: one row per spec stage, totals over its calls. */
export const RunSinkStage = z.strictObject({
  id: z.string().min(1),
  skipped: z.boolean(),
  inputTokens: TokenCount,
  outputTokens: TokenCount,
  latencyMs: z.number().int().nonnegative(),
  typesafeRequestId: z.string().nullable(),
});
export type RunSinkStage = z.infer<typeof RunSinkStage>;

export const RunSinkRecord = z.strictObject({
  result: RunResult,
  /** externalRef, source, metadata. */
  request: RunRequest,
  /** As stored: redacted per pii_mode, null for hash-only sets. */
  state: z.unknown(),
  stateHash: z.string().min(1),
  stages: z.array(RunSinkStage),
});
export type RunSinkRecord = z.infer<typeof RunSinkRecord>;

export const RunSinkResult = z.strictObject({
  reviewItemIds: z.array(ReviewItemId),
  labelItemIds: z.array(ReviewItemId),
});
export type RunSinkResult = z.infer<typeof RunSinkResult>;

/**
 * One transaction: the run row, action review items, label items, usage events and the
 * model_alias_observations update. The implementation picks label items itself by calling
 * core/learning selectForLabeling with its day counters and an injected rand.
 */
export interface RunSink {
  persist(ctx: TenantContext, record: RunSinkRecord): Promise<RunSinkResult>;
}

// ---------------------------------------------------------------------------
// ActionRegistry

export const ActionJob = z.strictObject({
  runId: RunId,
  decisionId: DecisionId,
  handlerId: z.string().min(1),
  config: z.unknown(),
});
export type ActionJob = z.infer<typeof ActionJob>;

/** Plugin action handlers. */
export interface ActionRegistry {
  isEnabled(orgId: string, handlerId: string): Promise<boolean>;
  /** Idempotent by runId:decisionId; dispatched after commit. */
  enqueue(job: ActionJob): Promise<void>;
}

// ---------------------------------------------------------------------------
// PriceBook

/** Integer micro-USD per million tokens. */
export const ModelPrice = z.strictObject({
  inputPerMtokMicroUsd: MicroUsdPerMtok,
  outputPerMtokMicroUsd: MicroUsdPerMtok,
});
export type ModelPrice = z.infer<typeof ModelPrice>;

/**
 * System One and comparator prices by exact model id. The org row first, then the platform
 * default. System One runs are priced by model_resolved, one call at a time.
 */
export interface PriceBook {
  get(orgId: string, modelId: string): Promise<ModelPrice | null>;
}

// ---------------------------------------------------------------------------
// LlmTransport

export const LlmCompletionRequest = z.strictObject({
  model: z.string().min(1),
  system: z.string(),
  prompt: z.string(),
  maxOutputTokens: z.number().int().positive(),
});
export type LlmCompletionRequest = z.infer<typeof LlmCompletionRequest>;

export const LlmCompletion = z.strictObject({
  text: z.string(),
  model: z.string().min(1),
  inputTokens: TokenCount,
  outputTokens: TokenCount,
});
export type LlmCompletion = z.infer<typeof LlmCompletion>;

/** Used by escalate_to_llm, Studio drafting, improve mode and opportunity drafting. */
export interface LlmTransport {
  complete(req: LlmCompletionRequest & { signal: AbortSignal }): Promise<LlmCompletion>;
}

// ---------------------------------------------------------------------------
// Redactor

/** Pure: returns a redacted copy of state. */
export type Redactor = (state: unknown, paths: string[], piiMode: PiiMode) => unknown;

// ---------------------------------------------------------------------------
// RunPorts and runQuestionSet

/** Epoch ms. latencyMs and timestamps come from here, never Date.now(). */
export type Clock = () => EpochMs;

/** uuidv7 for runId. Tests inject a fixed sequence. */
export type IdSource = () => string;

export interface RunPorts {
  /** One System One request. */
  systemOne: SystemOneTransport;
  /** id to ModelProfile; resolves a moving name to its last observed versioned model. */
  models: ModelCatalog;
  /** The org's TypeSafe key and key mode. */
  keys: KeyResolver;
  /** Per-org, per-key and global limiters, keyed by model. */
  limiter: RateLimiter;
  /** Plan quota and the agent token's daily spend cap. */
  quota: QuotaGuard;
  /** Persist run, review items, label items, usage events in one transaction. */
  runs: RunSink;
  /** Plugin action handlers. */
  actions: ActionRegistry;
  /** System One and comparator prices by exact model id. */
  prices: PriceBook;
  clock: Clock;
  newId: IdSource;
  /** escalate_to_llm. */
  llm?: LlmTransport;
  redactor?: Redactor;
}

/** What the pointer resolver hands to runQuestionSet. */
export const ResolvedRun = z.strictObject({
  spec: QuestionSetSpec,
  versionId: VersionId,
  channel: Channel,
  rollout: RolloutStage,
  experiment: z.strictObject({ id: ExperimentId, arm: ExperimentArm }).optional(),
});
export type ResolvedRun = z.infer<typeof ResolvedRun>;

export type RunQuestionSet = (
  ctx: TenantContext,
  req: RunRequest,
  resolved: ResolvedRun,
  ports: RunPorts,
) => Promise<RunResult>;
