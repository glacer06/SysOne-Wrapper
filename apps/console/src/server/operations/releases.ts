// Versions, releases, rollout and experiments (management-api.md, Versions and releases;
// Rollout; Experiments). Rows with scope release:<channel> pick the scope from the channel.

import {
  ExperimentId,
  ExperimentKind,
  PointerChannel,
  RolloutStage,
  SpecDiff,
  VersionId,
  type Scope,
} from "@sysone/core";
import { z } from "zod";

import { defineOperation, operationGroup, placeholderInput, placeholderOutput } from "./define";
import {
  Reason,
  SetRef,
  VersionNumber,
  VersionSide,
  listInput,
  placeholderListOutput,
  productionReleaseRisk,
  rolloutChangeRisk,
} from "./schemas";

const WithReason = z.strictObject({ reason: Reason });

function releaseScope(channel: PointerChannel): Scope {
  return `release:${channel}`;
}

/** The experiment's channel is read inside can() once experiments exist. Until then the stricter scope applies. */
function experimentScope(): Scope {
  return "release:production";
}

export const releaseOperations = operationGroup(
  // Versions and releases
  defineOperation("version.list", {
    summary: "List a set's versions.",
    input: listInput({ ref: SetRef }),
    // shape: Phase 3, owner Platform / Tenancy
    output: placeholderListOutput(),
  }),

  defineOperation("version.get", {
    summary: "Read one version: the full spec for sessions and agent tokens, the manifest for app tokens.",
    input: z.strictObject({ ref: SetRef, n: VersionNumber }),
    // shape: Phase 3, owner Platform / Tenancy
    output: placeholderOutput(),
  }),

  defineOperation("version.diff", {
    summary: "Diff two sides of a set: version numbers, draft or channel names.",
    input: z.strictObject({ ref: SetRef, from: VersionSide, to: VersionSide }),
    output: SpecDiff,
    mcp: "diff_versions",
  }),

  defineOperation("set.publish", {
    summary: "Freeze the draft into a new version and point a channel at it. Requires If-Match.",
    input: z.strictObject({
      ref: SetRef,
      channel: PointerChannel,
      changelog: z.string().min(1),
      requireEval: z.boolean().optional(),
      /** Phase 3b. Admin only; an agent also needs an approval. */
      skipExperiment: WithReason.optional(),
      /** The only way to clear the interface.breaking lint. */
      interfaceBump: WithReason.optional(),
    }),
    output: z.object({
      version: z.number().int().positive(),
      versionId: VersionId,
      experimentId: ExperimentId.optional(),
    }),
    scope: (input) => releaseScope(input.channel),
    risk: (_ctx, input, resource) =>
      input.channel === "production" || input.skipExperiment !== undefined
        ? productionReleaseRisk(resource, input.skipExperiment !== undefined)
        : "normal",
    ifMatch: "required",
    dryRun: true,
    mcp: "publish",
    emits: ["set.published", "interface.breaking_published", "experiment.started"],
  }),

  defineOperation("channel.rollback", {
    summary: "Point a channel back at an earlier version (default: the previous one).",
    input: z.strictObject({
      ref: SetRef,
      channel: PointerChannel,
      toVersion: z.number().int().positive().optional(),
    }),
    // shape: Phase 3, owner Platform / Tenancy
    output: placeholderOutput(),
    scope: (input) => releaseScope(input.channel),
    dryRun: true,
    mcp: "rollback",
    emits: ["release.rolled_back"],
  }),

  defineOperation("channel.promote", {
    summary: "Point production at the version staging serves, with the same lints and gates as a publish.",
    input: z.strictObject({
      ref: SetRef,
      channel: z.literal("production"),
      changelog: z.string().min(1).optional(),
      skipExperiment: WithReason.optional(),
    }),
    // shape: Phase 3, owner Platform / Tenancy
    output: placeholderOutput(),
    risk: (_ctx, input, resource) => productionReleaseRisk(resource, input.skipExperiment !== undefined),
    dryRun: true,
    mcp: "promote",
    emits: ["release.promoted", "experiment.started"],
  }),

  defineOperation("release.list", {
    summary: "List a set's release history.",
    input: listInput({ ref: SetRef }),
    // shape: Phase 3, owner Platform / Tenancy
    output: placeholderListOutput(),
  }),

  // Rollout
  defineOperation("rollout.get", {
    summary: "Read a channel's rollout stage, next-stage gates and auto-demote status.",
    input: z.strictObject({ ref: SetRef, channel: PointerChannel }),
    // shape: Phase 3, owner Platform / Tenancy
    output: placeholderOutput(),
    mcp: "get_rollout_gates",
  }),

  defineOperation("rollout.change", {
    summary: "Move a channel to another rollout stage. Pausing is never gated.",
    input: z.strictObject({ ref: SetRef, channel: PointerChannel, stage: RolloutStage, reason: Reason }),
    // shape: Phase 3, owner Platform / Tenancy
    output: placeholderOutput(),
    scope: (input) => releaseScope(input.channel),
    // The target channel's own current stage decides, so staging follows the same rule as production.
    risk: (_ctx, input, resource) => rolloutChangeRisk(resource.stages[input.channel], input.stage),
    dryRun: true,
    mcp: "change_rollout",
    emits: ["rollout.changed"],
  }),

  // Experiments (Phase 3b)
  defineOperation("experiment.start", {
    summary: "Start a champion/challenger experiment on a channel.",
    input: z.strictObject({
      ref: SetRef,
      channel: PointerChannel,
      challengerVersionId: VersionId,
      kind: ExperimentKind,
      samplePct: z.number().gt(0).max(1),
      minRuns: z.number().int().positive(),
      minLabeled: z.number().int().nonnegative(),
    }),
    // shape: Phase 3b, owner Platform / Tenancy
    output: placeholderOutput(),
    scope: (input) => releaseScope(input.channel),
    // effectiveness-loop.md section 9: a sample above 25 percent needs an approval for agents.
    risk: (_ctx, input) => (input.samplePct > 0.25 ? "high" : "normal"),
    mcp: "start_experiment",
    emits: ["experiment.started"],
  }),

  defineOperation("experiment.get", {
    summary: "Read an experiment and its current metrics.",
    input: z.strictObject({ id: ExperimentId }),
    // shape: Phase 3b, owner Platform / Tenancy
    output: placeholderOutput(),
    mcp: "get_experiment",
  }),

  defineOperation("experiment.promote", {
    summary: "Move the pointer to the challenger when the promotion rule holds.",
    // shape: Phase 3b, owner Platform / Tenancy
    input: placeholderInput({ id: ExperimentId }),
    // shape: Phase 3b, owner Platform / Tenancy
    output: placeholderOutput(),
    scope: experimentScope,
    mcp: "decide_experiment",
    emits: ["release.promoted", "experiment.decided"],
  }),

  defineOperation("experiment.stop", {
    summary: "Stop an experiment and keep the champion.",
    // shape: Phase 3b, owner Platform / Tenancy
    input: placeholderInput({ id: ExperimentId }),
    // shape: Phase 3b, owner Platform / Tenancy
    output: placeholderOutput(),
    scope: experimentScope,
    mcp: "decide_experiment",
    emits: ["experiment.decided"],
  }),
);
