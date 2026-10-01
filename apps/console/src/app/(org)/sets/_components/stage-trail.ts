// The rollout trail (SETS-B, ROLL-A): the four stages a channel walks, as stops on a dotted
// trail. Stops behind the current one are filled, the current one is the one teal node, the rest
// are open. Pure, so the sets list, the Releases panel and tests share it.

import type { RolloutStage } from "@bandwise/core";

/** The stops in walking order. Paused is not a stop: it is the kill switch, off the trail. */
export const TRAIL: readonly Exclude<RolloutStage, "paused">[] = ["inactive", "shadow", "controlled", "full"];

export type StopState = "passed" | "current" | "ahead";

export interface TrailStop {
  stage: Exclude<RolloutStage, "paused">;
  state: StopState;
}

/**
 * The stops for a channel at `stage`. `null` (nothing published on the channel) and `paused`
 * have no current stop: every stop is open, and the caller says why next to the trail.
 */
export function trailStops(stage: RolloutStage | null): TrailStop[] {
  const at = stage === null || stage === "paused" ? -1 : TRAIL.indexOf(stage);
  return TRAIL.map((s, i) => ({ stage: s, state: at === -1 ? "ahead" : i < at ? "passed" : i === at ? "current" : "ahead" }));
}

/** How far along the trail a channel is, for sorting: -1 for paused or unpublished. */
export function trailRank(stage: RolloutStage | null): number {
  return stage === null || stage === "paused" ? -1 : TRAIL.indexOf(stage);
}
