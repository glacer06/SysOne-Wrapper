import type { Band } from "@bandwise/core";

import { BAND_WORD } from "./badge";
import { cx } from "./cx";

/** One stretch of the 0 to 1 scale and the band it lands in, drawn from a set's own thresholds. */
export interface RulerSegment {
  from: number;
  to: number;
  band: Band;
  /** noul: the value the stretch gives (true, false or null). */
  value?: boolean | null;
}

const FILL: Record<Band, string> = { high: "bg-bw-high", medium: "bg-bw-medium", low: "bg-bw-low" };

function valueWord(v: boolean | null | undefined): string {
  return v === undefined ? "" : v === null ? "no answer" : v ? "yes" : "no";
}

function segmentLabel(s: RulerSegment): string {
  const v = valueWord(s.value);
  return `${BAND_WORD[s.band]}${v === "" ? "" : `, ${v}`} from ${s.from.toFixed(2)} to ${s.to.toFixed(2)}`;
}

/**
 * The confidence ruler (DESIGN.md): a 0 to 1 scale in low, medium and high segments, with a 2px
 * marker at the score. Segments come from the caller, computed from the set's thresholds with
 * core's band rule, so nothing here knows a cutoff. When a new score arrives the marker walks to
 * it once; reduced motion shows the end state. A list repeats the picture in words for screen
 * readers, and every segment is named in text under the bar, so color is never the only signal.
 */
export function ConfidenceRuler({ segments, marker, axis, markerLabel = "Score" }: {
  segments: readonly RulerSegment[];
  marker?: number | null;
  /** What the scale measures, for example "P(yes)" or "Confidence". */
  axis: string;
  markerLabel?: string;
}) {
  // Threshold numbers under the bar, skipping any that would crowd a neighbor or an end. The
  // screen reader list still names every segment.
  const cuts: number[] = [];
  for (const s of segments.slice(1)) {
    const last = cuts[cuts.length - 1];
    if (s.from >= 0.1 && s.from <= 0.9 && (last === undefined || s.from - last >= 0.12)) cuts.push(s.from);
  }
  const hasMarker = marker !== undefined && marker !== null;
  return (
    <figure className="flex flex-col gap-1.5">
      <div className="relative pt-1.5 pb-1.5" aria-hidden>
        <div className="relative h-3 overflow-hidden">
          {segments.map((s) => (
            <div
              key={`${s.from}-${s.band}-${String(s.value)}`}
              className={cx("absolute inset-y-0 border-r-2 border-bw-surface last:border-r-0", FILL[s.band])}
              style={{ left: `${s.from * 100}%`, width: `${Math.max(0.5, (s.to - s.from) * 100)}%` }}
            />
          ))}
        </div>
        {hasMarker ? (
          <div
            className="absolute top-0 h-6 w-0.5 bg-bw-text transition-[left] duration-(--bw-dur-walk) ease-(--bw-ease-walk)"
            style={{ left: `calc(${marker * 100}% - 1px)` }}
          />
        ) : null}
      </div>
      <div className="relative h-4 text-xs text-bw-text-muted" aria-hidden>
        {segments.map((s) =>
          s.to - s.from < 0.1 ? null : (
            <span
              key={`${s.from}-${s.band}-label`}
              className="absolute top-0 -translate-x-1/2 whitespace-nowrap"
              style={{ left: `${((s.from + s.to) / 2) * 100}%` }}
            >
              {BAND_WORD[s.band]}
              {s.value === undefined || s.to - s.from < 0.15 ? "" : ` ${valueWord(s.value)}`}
            </span>
          ),
        )}
      </div>
      <div className="relative h-4 font-mono text-xs tabular-nums text-bw-text-muted" aria-hidden>
        <span className="absolute left-0">0</span>
        {cuts.map((c) => (
          <span key={c} className="absolute -translate-x-1/2" style={{ left: `${c * 100}%` }}>
            {c.toFixed(2)}
          </span>
        ))}
        <span className="absolute right-0">1</span>
      </div>
      <figcaption className="font-mono text-xs text-bw-text-muted">
        {axis}
        {hasMarker ? <span className="text-bw-text">{`, ${markerLabel.toLowerCase()} ${marker.toFixed(2)}`}</span> : null}
      </figcaption>
      <ul className="sr-only">
        {segments.map((s) => (
          <li key={`${s.from}-${s.band}-sr`}>{segmentLabel(s)}</li>
        ))}
      </ul>
    </figure>
  );
}
