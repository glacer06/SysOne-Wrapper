import type { Band, RolloutStage } from "@bandwise/core";
import type { ReactNode } from "react";

import { cx } from "./cx";

type Tone = "neutral" | "signal" | "good" | "danger" | "info";

const TONES: Record<Tone, string> = {
  neutral: "border-edge text-ink-2 bg-paper-sunk",
  signal: "border-transparent bg-signal text-on-signal",
  good: "border-transparent bg-good-wash text-good",
  danger: "border-transparent bg-danger-wash text-danger",
  info: "border-transparent bg-info-wash text-info",
};

export function Badge({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-1.5 rounded-sm border px-2 py-0.5 text-xs font-medium whitespace-nowrap", TONES[tone], className)}>
      {children}
    </span>
  );
}

const STAGE: Record<RolloutStage, { tone: Tone; label: string; hint: string }> = {
  inactive: { tone: "neutral", label: "Inactive", hint: "Serves no runs" },
  shadow: { tone: "info", label: "Shadow", hint: "Logs, never acts" },
  controlled: { tone: "signal", label: "Controlled", hint: "Only the high band acts" },
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

/** A confidence band. Solid, hatched and dotted swatches tell them apart without color. */
export function BandBadge({ band }: { band: Band }) {
  const swatch = band === "high" ? "bg-signal" : band === "medium" ? "band-medium text-ink-2" : "band-low text-ink-2";
  return (
    <Badge>
      <span aria-hidden className={cx("inline-block h-2.5 w-2.5 rounded-[1px] border border-edge", swatch)} />
      {band === "high" ? "High" : band === "medium" ? "Medium" : "Low"}
    </Badge>
  );
}
