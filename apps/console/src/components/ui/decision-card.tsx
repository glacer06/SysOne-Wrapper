import type { Band } from "@bandwise/core";
import type { ReactNode } from "react";

import { BandBadge } from "./badge";
import { cx } from "./cx";

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] items-baseline gap-3 border-t border-bw-border pt-3 text-sm">
      <dt className="bw-label">{label}</dt>
      <dd className="min-w-0 break-words text-bw-text">{children}</dd>
    </div>
  );
}

/**
 * The four-part answer (BRAND-VOICE.md): the state in one sentence, then BAND, WHY and COST, in
 * that fixed order and separated by hairlines. Chamfered, so it is the one cut element in its
 * region.
 */
export function DecisionCard({ state, band, score, bandNote, why, cost, aside, className }: {
  /** What happened, in one sentence. */
  state: ReactNode;
  band: Band;
  /** The number beside the band word, when the decision has one. */
  score?: number | null;
  /** A short note after the badge, for example "P(yes) 0.62". */
  bandNote?: ReactNode;
  why: ReactNode;
  cost: ReactNode;
  /** Status chips beside the state, for example the review item's status. */
  aside?: ReactNode;
  className?: string;
}) {
  return (
    <section className={cx("bw-decision-wrap", className)}>
      <div className="bw-decision-card bg-bw-surface px-5 py-4 sm:px-6 sm:py-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="text-lg leading-snug font-semibold text-bw-text">{state}</p>
        {aside === undefined ? null : <div className="flex shrink-0 flex-wrap gap-2">{aside}</div>}
      </div>
      <dl className="mt-3 grid gap-3">
        <Row label="Band">
          <span className="flex flex-wrap items-center gap-2">
            <BandBadge band={band} score={score ?? null} />
            {bandNote === undefined ? null : <span className="font-mono text-xs text-bw-text-muted">{bandNote}</span>}
          </span>
        </Row>
        <Row label="Why">{why}</Row>
        <Row label="Cost">
          <span className="font-mono tabular-nums">{cost}</span>
        </Row>
      </dl>
      </div>
    </section>
  );
}
