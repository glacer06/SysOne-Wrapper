import { cx } from "~/components/ui";

import type { BandSegment } from "./spec-edit";

const FILL = { high: "bg-signal", medium: "band-medium text-ink-3 bg-paper-sunk", low: "band-low text-ink-3 bg-paper-sunk" } as const;
const BAND = { high: "High", medium: "Medium", low: "Low" } as const;

function segmentLabel(s: BandSegment): string {
  const value = s.value === undefined ? "" : s.value === null ? ", no answer" : s.value ? ", yes" : ", no";
  return `${BAND[s.band]}${value} from ${s.from.toFixed(2)} to ${s.to.toFixed(2)}`;
}

/**
 * Which band each value from 0 to 1 lands in under the current sliders, drawn with core's own
 * band rule. `marker` is where the last preview's answer sits. The list under it says the same
 * in words for screen readers.
 */
export function BandBar({ segments, axis, marker }: { segments: readonly BandSegment[]; axis: string; marker?: number | null }) {
  return (
    <figure className="flex flex-col gap-1">
      <div className="relative h-5 overflow-hidden rounded-sm border border-edge" aria-hidden>
        {segments.map((s) => (
          <div
            key={`${s.from}-${s.band}-${String(s.value)}`}
            className={cx("absolute inset-y-0 border-r border-paper-raised last:border-r-0", FILL[s.band])}
            style={{ left: `${s.from * 100}%`, width: `${Math.max(0.5, (s.to - s.from) * 100)}%` }}
          >
            {s.value === undefined || s.to - s.from < 0.08 ? null : (
              <span className={cx("absolute inset-0 flex items-center justify-center text-[10px] font-medium", s.band === "high" ? "text-on-signal" : "text-ink-2")}>
                {s.value === null ? "?" : s.value ? "yes" : "no"}
              </span>
            )}
          </div>
        ))}
        {marker === undefined || marker === null ? null : (
          <div className="absolute inset-y-0 w-0.5 bg-ink" style={{ left: `calc(${marker * 100}% - 1px)` }} />
        )}
      </div>
      <figcaption className="flex justify-between text-[11px] text-ink-3">
        <span>0</span>
        <span>{axis}</span>
        <span>1</span>
      </figcaption>
      <ul className="sr-only">
        {segments.map((s) => (
          <li key={`${s.from}-${s.band}`}>{segmentLabel(s)}</li>
        ))}
        {marker === undefined || marker === null ? null : <li>Last preview answer at {marker.toFixed(2)}</li>}
      </ul>
    </figure>
  );
}
