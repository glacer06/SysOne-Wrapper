// Plain-text formatting for every console page. Pure, so it is unit tested.

import type { Action, ReviewItemReason, ReviewItemStatus, RunRecordSource, RunStatus } from "@bandwise/core";

/**
 * Integer micro-USD as dollars. Per-run System One costs are fractions of a cent, so small amounts
 * keep two significant digits instead of rounding to $0.00. Null is "Not priced".
 */
export function formatUsd(micro: number | null): string {
  if (micro === null) return "Not priced";
  const usd = micro / 1_000_000;
  const sign = usd < 0 ? "-" : "";
  const abs = Math.abs(usd);
  if (abs === 0) return "$0.00";
  if (abs >= 0.01) return `${sign}$${abs.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return `${sign}$${abs.toPrecision(2).replace(/0+$/, "")}`;
}

/** Dollars as the run envelope reports them, formatted like formatUsd. */
export function formatDollars(usd: number | null): string {
  return formatUsd(usd === null ? null : Math.round(usd * 1_000_000));
}

export function formatCount(n: number): string {
  return n.toLocaleString("en-US");
}

export function formatLatency(ms: number): string {
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(ms < 10_000 ? 2 : 1)} s`;
}

/** A share as a whole percent, or a dash when there is nothing to divide. */
export function formatShare(part: number, whole: number): string {
  return whole === 0 ? "-" : `${Math.round((part / whole) * 100)}%`;
}

/** "just now", "5 min ago", "3 h ago", then the UTC date and time. */
export function formatWhen(iso: string, now: Date): string {
  const t = new Date(iso).getTime();
  const s = Math.round((now.getTime() - t) / 1000);
  if (s < 0) return formatUtc(iso);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)} h ago`;
  return formatUtc(iso);
}

export function formatUtc(iso: string): string {
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
}

export const SOURCE_LABEL: Record<RunRecordSource, string> = {
  console: "Console",
  playground: "Playground",
  api: "API",
  embed: "Embed",
  extension: "Extension",
  mcp: "MCP",
  eval: "Eval",
  cli: "CLI",
  ingest: "Ingest",
};

export const STATUS_LABEL: Record<RunStatus, string> = {
  ok: "OK",
  error: "Error",
  rate_limited: "Rate limited",
  quota_exceeded: "Over quota",
};

export const ACTION_LABEL: Record<Action, string> = {
  auto: "Auto",
  review: "Review",
  fallback: "Fallback",
  escalate_to_llm: "Escalate to LLM",
};

export const REVIEW_STATUS_LABEL: Record<ReviewItemStatus, string> = {
  open: "Open",
  pending_confirmation: "Agent answered, needs you",
  resolved: "Resolved",
  dismissed: "Dismissed",
};

/** Why an item was picked, in words. */
export const REASON_LABEL: Record<ReviewItemReason, string> = {
  action: "The policy sent this band to review",
  audit: "Random audit sample",
  near_threshold: "Close to a threshold",
  challenger_diff: "Champion and challenger disagree",
  studio: "Studio labeling",
};

/** A decision value as people read it: Yes and No for noul, the key or number otherwise. */
export function formatValue(value: unknown): string {
  if (value === true) return "Yes";
  if (value === false) return "No";
  if (value === null || value === undefined) return "No answer";
  if (typeof value === "number") return Number.isInteger(value) ? String(value) : value.toFixed(3);
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}
