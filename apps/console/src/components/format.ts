// Plain-text formatting for every console page. Pure, so it is unit tested.

import type { Action, Band, ReviewItemReason, ReviewItemStatus, RolloutStage, RunRecordSource, RunStatus } from "@bandwise/core";

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

/**
 * A run's state in one sentence, the first line of the four-part answer (BRAND-VOICE.md). The
 * overall action is what the policy's thresholds say; shadow, inactive and paused never act on it.
 */
export function runStateLine(action: Action, rollout: RolloutStage): string {
  const said: Record<Action, string> = {
    auto: "Strong trail. The policy says ship it.",
    review: "Not done yet. The policy asks a person to look.",
    fallback: "Faint trail. The policy sends it to the fallback.",
    escalate_to_llm: "Faint trail. The policy sends it to an LLM.",
  };
  if (rollout === "shadow") return `${said[action]} Shadow logged it and nothing acted.`;
  if (rollout === "inactive") return `${said[action]} The channel is inactive, so nothing acted.`;
  if (rollout === "paused") return `${said[action]} The set is paused, so nothing acted.`;
  return said[action];
}

/** A review item's state in one sentence. */
export function reviewStateLine(status: ReviewItemStatus): string {
  switch (status) {
    case "open":
      return "Waiting on you. Is this answer right?";
    case "pending_confirmation":
      return "An agent answered. A person should confirm it.";
    case "resolved":
      return "Resolved. This answer is now a labeled decision.";
    case "dismissed":
      return "Dismissed. It left the queue without an answer.";
  }
}

/** How many decisions landed in each band, as one fact: "2 decisions: 1 high, 1 medium". */
export function bandCountLine(bands: readonly Band[]): string {
  if (bands.length === 0) return "No decisions were stored.";
  const parts = (["high", "medium", "low"] as const).map((b) => [b, bands.filter((x) => x === b).length] as const).filter(([, n]) => n > 0);
  return `${bands.length} ${bands.length === 1 ? "decision" : "decisions"}: ${parts.map(([b, n]) => `${n} ${b}`).join(", ")}`;
}
