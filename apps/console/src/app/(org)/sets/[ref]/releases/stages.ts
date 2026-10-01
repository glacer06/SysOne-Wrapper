// What each rollout stage means in plain words, and what a move between two stages changes.
// The source is confidence-policy.md (Rollout stages, Effective action by rollout stage).
// Pure, so client components, the Approvals page and tests share it.

import type { RolloutStage } from "@bandwise/core";

export const STAGE_ORDER: readonly RolloutStage[] = ["inactive", "shadow", "controlled", "full", "paused"];

export const STAGE_LABEL: Record<RolloutStage, string> = {
  inactive: "Inactive",
  shadow: "Shadow",
  controlled: "Controlled",
  full: "Full",
  paused: "Paused",
};

/** One line per stage: what runs on the channel do. */
export const STAGE_MEANING: Record<RolloutStage, string> = {
  inactive: "The channel serves no runs. Callers get 409 set_not_live.",
  shadow: "Runs are logged but never act. Callers keep their existing path.",
  controlled: "High band decisions act by policy. Medium and low go to review when gating, otherwise to fallback.",
  full: "Every decision acts by policy, in every band.",
  paused: "Kill switch. Runs are logged, every decision falls back, nothing acts.",
};

/** The default reason recorded when a person leaves the reason empty. */
export const DEFAULT_STAGE_REASON = "Changed from the console.";
export const PAUSE_REASON = "Paused from the console.";

const RANK: Record<Exclude<RolloutStage, "paused">, number> = { inactive: 0, shadow: 1, controlled: 2, full: 3 };

/** A move that lets decisions act where they did not before: into controlled or full from below, or out of a pause. */
export function widensActing(from: RolloutStage, to: RolloutStage): boolean {
  if (from === to || to === "paused") return false;
  if (from === "paused") return to === "controlled" || to === "full";
  if (to !== "controlled" && to !== "full") return false;
  return RANK[to] > RANK[from];
}

/** The console asks before these moves: into controlled or full, and out of a pause. */
export function needsConfirm(from: RolloutStage, to: RolloutStage): boolean {
  return from !== to && (widensActing(from, to) || from === "paused");
}

/** The sentences a confirm dialog shows for a stage move on one channel. */
export function describeMove(channel: string, from: RolloutStage, to: RolloutStage): string[] {
  const lines = [`${channel} moves from ${STAGE_LABEL[from]} to ${STAGE_LABEL[to]}.`, `Now: ${STAGE_MEANING[from]}`, `After: ${STAGE_MEANING[to]}`];
  if (to === "controlled" || to === "full") lines.push("The version must use a pinned model. A moving model such as jev-latest is refused.");
  if (to === "full") lines.push("Entering full needs the admin role.");
  if (widensActing(from, to)) lines.push("Callers start acting on these decisions on their next run. Pause or roll back at any time.");
  return lines;
}

/** "2026-10-01 07:05 UTC": one format on the server and in the browser, so hydration agrees. */
export function formatTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : `${d.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}
