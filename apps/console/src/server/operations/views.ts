// Response shapes of the operations D2c serves (management-api.md). They live in the console,
// not in core contracts: each one replaced a "shape: Phase 3" placeholder of the registry.

import {
  Action,
  Band,
  Channel,
  GateResult,
  GoalId,
  IsoTimestamp,
  JsonValue,
  Manifest,
  MicroUsd,
  PointerChannel,
  ProjectId,
  QuestionSetSpec,
  ReviewItemKind,
  ReviewItemReason,
  ReviewItemStatus,
  RolloutStage,
  RunId,
  RunRecordSource,
  RunStage,
  RunStatus,
  SetId,
  StorageMode,
  TokenCount,
  TokenId,
  UserId,
  VersionId,
  VersionSource,
  VersionStatus,
} from "@bandwise/core";
import { z } from "zod";

const VersionNo = z.number().int().positive();
const Major = z.number().int().nonnegative();

/** One release pointer: the version a channel serves and its rollout stage. */
export const ChannelView = z.object({
  channel: PointerChannel,
  version: VersionNo,
  versionId: VersionId,
  stage: RolloutStage,
  interfaceMajor: Major,
  updatedAt: IsoTimestamp,
});
export type ChannelView = z.infer<typeof ChannelView>;

/** set.list items, set.get and set.create. */
export const SetView = z.object({
  id: SetId,
  slug: z.string().min(1),
  name: z.string().min(1),
  description: z.string().nullable(),
  projectId: ProjectId,
  goalId: GoalId,
  protected: z.boolean(),
  storageMode: StorageMode,
  createdAt: IsoTimestamp,
  /** The open draft: its reserved version number and its ETag. */
  draft: z.object({ version: VersionNo, versionId: VersionId, etag: z.string().min(1) }).nullable(),
  channels: z.array(ChannelView),
});
export type SetView = z.infer<typeof SetView>;

/** version.list items. */
export const VersionSummary = z.object({
  id: VersionId,
  version: VersionNo,
  status: VersionStatus,
  specHash: z.string().min(1),
  interfaceMajor: Major,
  interfaceHash: z.string().min(1),
  model: z.string().min(1),
  changelog: z.string().nullable(),
  source: VersionSource,
  publishedAt: IsoTimestamp.nullable(),
  publishedBy: z.object({ userId: UserId.nullable(), tokenId: TokenId.nullable() }),
  createdAt: IsoTimestamp,
});
export type VersionSummary = z.infer<typeof VersionSummary>;

/** version.get for sessions and agent tokens. App tokens get the Manifest. */
export const VersionDetail = VersionSummary.extend({ spec: QuestionSetSpec });
export type VersionDetail = z.infer<typeof VersionDetail>;

export const VersionGetOutput = z.union([VersionDetail, Manifest]);

export const RolloutView = z.object({
  channel: PointerChannel,
  stage: RolloutStage,
  version: VersionNo,
  versionId: VersionId,
  /** Gates for the next stage. Empty until the effectiveness loop lands (Phase 3). */
  gates: z.array(GateResult),
  warnings: z.array(z.string()),
});

export const RolloutChangeOutput = z.object({
  channel: PointerChannel,
  from: RolloutStage,
  to: RolloutStage,
  version: VersionNo,
});

export const RollbackOutput = z.object({
  channel: PointerChannel,
  fromVersion: VersionNo,
  toVersion: VersionNo,
  stage: RolloutStage,
});

/** run.list items: a run without its state, answers or stage payloads. */
export const RunSummary = z.object({
  id: RunId,
  setId: SetId,
  versionId: VersionId,
  channel: Channel,
  rollout: RolloutStage,
  source: RunRecordSource,
  status: RunStatus,
  runBand: Band,
  overallAction: Action,
  route: z.string().nullable(),
  modelRequested: z.string().min(1),
  modelResolved: z.string().nullable(),
  latencyMs: z.number().int().nonnegative(),
  inputTokens: TokenCount,
  outputTokens: TokenCount,
  systemOneCostMicroUsd: MicroUsd.nullable(),
  counterfactualMicroUsd: MicroUsd,
  savingsMicroUsd: MicroUsd,
  errorCode: z.string().nullable(),
  createdAt: IsoTimestamp,
});
export type RunSummary = z.infer<typeof RunSummary>;

export const RunReviewItem = z.object({
  id: z.uuid(),
  decisionId: z.string(),
  kind: ReviewItemKind,
  reason: ReviewItemReason,
  band: Band,
  status: ReviewItemStatus,
  resolution: JsonValue.nullable(),
  resolvedAt: IsoTimestamp.nullable(),
});

/** run.get: the summary plus stage payloads, answers, decisions and review items. */
export const RunDetail = RunSummary.extend({
  stages: z.array(RunStage),
  checks: z.record(z.string(), z.boolean()),
  answers: JsonValue.nullable(),
  decisions: JsonValue.nullable(),
  warnings: z.array(z.string()),
  /** Null when the set's storage mode did not keep it, or after retention. */
  state: JsonValue.nullable(),
  reviewItems: z.array(RunReviewItem),
});
export type RunDetail = z.infer<typeof RunDetail>;

const Totals = z.object({
  runs: TokenCount,
  bandHigh: TokenCount,
  bandMedium: TokenCount,
  bandLow: TokenCount,
  errors: TokenCount,
  inputTokens: TokenCount,
  outputTokens: TokenCount,
  systemOneCostMicroUsd: MicroUsd,
  counterfactualMicroUsd: MicroUsd,
  savingsMicroUsd: MicroUsd,
  llmCallsAvoided: TokenCount,
});

/** One UTC day of totals in usage.get, for the savings chart. Days without runs are left out. */
export const UsageDay = z.object({
  day: z.iso.date(),
  runs: TokenCount,
  errors: TokenCount,
  systemOneCostMicroUsd: MicroUsd,
  counterfactualMicroUsd: MicroUsd,
  savingsMicroUsd: MicroUsd,
  llmCallsAvoided: TokenCount,
});
export type UsageDay = z.infer<typeof UsageDay>;

/** usage.get: run totals per set over [from, to], and totals per UTC day. */
export const UsageView = z.object({
  from: IsoTimestamp,
  to: IsoTimestamp,
  sets: z.array(Totals.extend({ setId: SetId, slug: z.string() })),
  totals: Totals,
  days: z.array(UsageDay),
});
export type UsageView = z.infer<typeof UsageView>;

/** review.list items, and what review.resolve, review.dismiss and review.confirm return. */
export const ReviewItemView = z.object({
  id: z.uuid(),
  /** Null for Studio items. */
  runId: RunId.nullable(),
  setId: SetId,
  decisionId: z.string(),
  kind: ReviewItemKind,
  /** Why the item was picked. */
  reason: ReviewItemReason,
  /** Set when the random audit picked it. */
  sampleRate: z.number().nullable(),
  band: Band,
  /** What the run decided: `{ value }`. */
  suggested: JsonValue.nullable(),
  status: ReviewItemStatus,
  assigneeId: UserId.nullable(),
  resolution: JsonValue.nullable(),
  resolvedBy: z.object({ userId: UserId.nullable(), tokenId: TokenId.nullable() }),
  resolvedAt: IsoTimestamp.nullable(),
  addToDataset: z.boolean(),
  createdAt: IsoTimestamp,
});
export type ReviewItemView = z.infer<typeof ReviewItemView>;
