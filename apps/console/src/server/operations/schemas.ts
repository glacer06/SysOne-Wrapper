// Schemas shared by several operations: path params, list params and list pages, risk helpers.
// Contract shapes come from @bandwise/core; nothing here redefines one.

import {
  ListParams,
  PointerChannel,
  pageOf,
  type RiskResource,
  type RolloutStage,
  type Scope,
  type StorageMode,
  isLessPrivateStorageMode,
} from "@bandwise/core";
import { z } from "zod";

import { markPlaceholder, type RiskLevel } from "./define";

/** `{ref}`: a set id or slug. Runs also accept slug@7 and slug@draft. */
export const SetRef = z.string().min(1);

/** `{n}` and ?version=: a published version number, sent as text in the path or query. */
export const VersionNumber = z.coerce.number().int().positive();

/** One side of a diff or compare: a version number, `draft`, or a channel name. */
export const VersionSide = z.union([z.literal("draft"), PointerChannel, VersionNumber]);

/** A registry model id, alias or unknown name, as TypeSafe names it. */
export const ModelName = z.string().min(1);

/** A reason recorded on the audit row, for example on a rollout change. */
export const Reason = z.string().min(1);

/** A list operation's input: its filters plus `limit` (default 50, max 200) and `cursor`. */
export function listInput<S extends z.core.$ZodShape>(filters: S) {
  return z.strictObject({ ...filters, ...ListParams.shape });
}

/** A list operation's output: `{ data, nextCursor }`. */
export function listOutput<T extends z.ZodType>(item: T) {
  return pageOf(item);
}

/** A list page whose items are still open. */
export function placeholderListOutput() {
  return markPlaceholder(pageOf(z.unknown()));
}

/** A download format for reports and exports. */
export const ReportFormat = z.enum(["json", "csv", "pdf"]);

// ---------------------------------------------------------------------------
// Risk helpers for the high* catalog rows (management-api.md, Catalog)

const LIVE_STAGES: readonly RolloutStage[] = ["controlled", "full"];

/** Production is live when its stage is controlled or full. */
export function productionIsLive(resource: RiskResource): boolean {
  const stage = resource.stages.production;
  return stage !== null && LIVE_STAGES.includes(stage);
}

/** A production publish or promote: high on a protected or live set, and always with skipExperiment. */
export function productionReleaseRisk(resource: RiskResource, skipExperiment: boolean): RiskLevel {
  if (skipExperiment) return "high";
  return resource.protected || productionIsLive(resource) ? "high" : "normal";
}

const STAGE_RANK: Record<Exclude<RolloutStage, "paused">, number> = {
  inactive: 0,
  shadow: 1,
  controlled: 2,
  full: 3,
};

/**
 * rollout.change: a move into controlled or full from a lower stage, or any move out of paused,
 * is high. `from` is the target channel's current stage, null when it has no pointer yet, which
 * counts as inactive.
 */
export function rolloutChangeRisk(from: RolloutStage | null, to: RolloutStage): RiskLevel {
  const current = from ?? "inactive";
  if (to === "paused") return "normal";
  if (current === "paused") return "high";
  if (to !== "controlled" && to !== "full") return "normal";
  return STAGE_RANK[to] > STAGE_RANK[current] ? "high" : "normal";
}

/** set.update: moving storageMode to a less private mode is a PII change (data-model.md). */
export function storageModeChangeRisk(from: StorageMode | null, to: StorageMode | undefined): RiskLevel {
  if (to === undefined) return "normal";
  // Unknown current mode: treat any change as a possible PII change.
  if (from === null) return "high";
  return isLessPrivateStorageMode(from, to) ? "high" : "normal";
}

/** Scopes that change org data or configuration. `run`, `evals:run` and the read scopes are not write scopes. */
export function isWriteScope(scope: Scope): boolean {
  return scope.endsWith(":write") || scope.startsWith("release:");
}
