import type { Band, RolloutStage } from "@bandwise/core";
import type { ReactNode } from "react";

import { cx } from "./cx";

type Tone = "neutral" | "brand" | "good" | "danger" | "info";

// Status chips are flat. The chamfer is kept for the band badge, the product's core component.
const TONES: Record<Tone, string> = {
  neutral: "border-bw-border-strong bg-bw-surface-sunken text-bw-text-muted",
  brand: "border-bw-brand bg-bw-high-bg text-bw-high-text",
  good: "border-transparent bg-bw-high-bg text-bw-high-text",
  danger: "border-transparent bg-bw-low-bg text-bw-low-text",
  info: "border-transparent bg-bw-medium-bg text-bw-medium-text",
};

export function Badge({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cx("inline-flex h-6 items-center gap-1.5 rounded-sm border px-2 text-xs font-medium whitespace-nowrap", TONES[tone], className)}>
      {children}
    </span>
  );
}

const STAGE: Record<RolloutStage, { tone: Tone; label: string; hint: string }> = {
  inactive: { tone: "neutral", label: "Inactive", hint: "Serves no runs" },
  shadow: { tone: "info", label: "Shadow", hint: "Logs, never acts" },
  controlled: { tone: "brand", label: "Controlled", hint: "Only the high band acts" },
  full: { tone: "good", label: "Full", hint: "Every band acts by policy" },
  paused: { tone: "danger", label: "Paused", hint: "Kill switch on" },
};

/** A rollout stage, with its meaning as the title for pointer users and screen readers. */
export function RolloutBadge({ stage }: { stage: RolloutStage }) {
  const s = STAGE[stage];
  return (
    <Badge tone={s.tone}>
      <span title={s.hint}>{s.label}</span>
      <span className="sr-only">: {s.hint}</span>
    </Badge>
  );
}

export const BAND_WORD: Record<Band, string> = { high: "High", medium: "Medium", low: "Low" };

const BAND_TONE: Record<Band, string> = {
  high: "bg-bw-high-bg text-bw-high-text",
  medium: "bg-bw-medium-bg text-bw-medium-text",
  low: "bg-bw-low-bg text-bw-low-text",
};

/**
 * A confidence band: chamfered, mono caps, a square dot, the word, and the number when there is
 * one. Color is never the only signal (DESIGN.md hard rule 4).
 */
export function BandBadge({ band, score, className }: { band: Band; score?: number | null; className?: string }) {
  return (
    <span
      className={cx(
        "bw-chamfer-sm inline-flex h-6 items-center gap-1.5 px-2.5 font-mono text-[0.6875rem] leading-none font-semibold tracking-[0.08em] whitespace-nowrap uppercase",
        BAND_TONE[band],
        className,
      )}
    >
      <span aria-hidden className="h-1.5 w-1.5 shrink-0 bg-current" />
      {BAND_WORD[band]}
      {score === undefined || score === null ? null : <span className="tabular-nums">{score.toFixed(2)}</span>}
    </span>
  );
}
