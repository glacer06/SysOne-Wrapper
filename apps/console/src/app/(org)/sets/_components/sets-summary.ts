// The sets list in one sentence and three chips (SETS-B). Pure, so it is unit tested and the
// page only gathers data.

import type { Band, RolloutStage } from "@bandwise/core";

import { formatWhen } from "~/components/format";

export interface SetRow {
  slug: string;
  name: string;
  /** The production channel: its version and stage, or null when nothing is published there. */
  production: { version: number; stage: RolloutStage } | null;
  staging: { version: number; stage: RolloutStage } | null;
  draft: number | null;
  /** Open review items for this set. */
  openReviews: number;
  /** System One spend over the last 24 hours, micro-USD. */
  spend24hMicroUsd: number;
  runs24h: number;
  lastRun: { at: string; band: Band } | null;
}

/**
 * What needs a person, from data the console has today: a paused production channel first, then
 * open review items. Precision and drift join this when the effectiveness loop ships health.get.
 */
export type Health = "paused" | "review" | "clear";

export function healthOf(row: SetRow): Health {
  if (row.production?.stage === "paused") return "paused";
  return row.openReviews > 0 ? "review" : "clear";
}

export type SetsFilter = "all" | "review" | "clear";

export function parseFilter(v: string | string[] | undefined): SetsFilter {
  return v === "review" || v === "clear" ? v : "all";
}

/** Needs review covers paused sets too: both want a person now. */
export function matches(row: SetRow, filter: SetsFilter): boolean {
  if (filter === "all") return true;
  const h = healthOf(row);
  return filter === "clear" ? h === "clear" : h !== "clear";
}

export function chipCounts(rows: readonly SetRow[]): Record<SetsFilter, number> {
  return { all: rows.length, review: rows.filter((r) => matches(r, "review")).length, clear: rows.filter((r) => matches(r, "clear")).length };
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "4 sets. 1 needs review. Last run 3 min ago." */
export function stateLine(rows: readonly SetRow[], now: Date): string {
  const parts = [`${plural(rows.length, "set", "sets")}.`];
  const paused = rows.filter((r) => healthOf(r) === "paused").length;
  const review = rows.filter((r) => healthOf(r) === "review").length;
  if (paused > 0) parts.push(`${paused} paused.`);
  parts.push(review === 0 ? (paused === 0 ? "None need review." : "") : `${review} ${review === 1 ? "needs" : "need"} review.`);
  const last = rows.reduce<string | null>((acc, r) => (r.lastRun !== null && (acc === null || r.lastRun.at > acc) ? r.lastRun.at : acc), null);
  parts.push(last === null ? "No runs yet." : `Last run ${formatWhen(last, now)}.`);
  return parts.filter((p) => p !== "").join(" ");
}
