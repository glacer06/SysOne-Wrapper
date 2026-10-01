import type { Band } from "@bandwise/core";

import { BAND_WORD, BandBadge, cx, type RulerSegment } from "~/components/ui";

import { cutsOf, type RulerGroup, type RulerMarker } from "./ruler-math";
import styles from "./run-ruler.module.css";

const FILL: Record<Band, string> = { high: "bg-bw-high", medium: "bg-bw-medium", low: "bg-bw-low" };

function valueWord(v: boolean | null | undefined): string {
  return v === undefined ? "" : v === null ? "no answer" : v ? "yes" : "no";
}

function segmentText(s: RulerSegment): string {
  const v = valueWord(s.value);
  return `${BAND_WORD[s.band]}${v === "" ? "" : ` ${v}`}`;
}

/** The colored bar, with a hairline in the surface color between segments. */
function Bar({ segments, className }: { segments: readonly RulerSegment[]; className: string }) {
  return (
    <div className={cx("relative overflow-hidden", className)}>
      {segments.map((s, i) => (
        <div
          key={`${s.from}-${s.band}-${String(s.value)}`}
          className={cx("absolute inset-y-0", FILL[s.band], i < segments.length - 1 && "border-r-2 border-bw-surface")}
          style={{ left: `${s.from * 100}%`, width: `${(s.to - s.from) * 100}%` }}
        />
      ))}
    </div>
  );
}

/** Threshold numbers under the bar, skipping any that would crowd a neighbor or an end. */
export function visibleCuts(segments: readonly RulerSegment[], minGap = 0.08): number[] {
  const out: number[] = [];
  for (const c of cutsOf(segments)) {
    const last = out[out.length - 1];
    if (c >= 0.05 && c <= 0.95 && (last === undefined || c - last >= minGap)) out.push(c);
  }
  return out;
}

/**
 * Hide a band word when its segment is too narrow for it at the ruler's own width (container
 * queries), so neighbors never collide. The screen reader list still names every segment.
 */
function labelFit(w: number): string | false {
  if (w >= 0.3) return false;
  if (w >= 0.2) return "@max-md:hidden";
  if (w >= 0.1) return "@max-3xl:hidden";
  return "@max-5xl:hidden";
}

function markerTitle(m: RulerMarker): string {
  return `${m.id}: ${BAND_WORD[m.band]} ${m.at.toFixed(2)}${m.heavy ? ", sets the run band" : ""}`;
}

/**
 * RUNS-C: the run opens on a full-width ruler at the set's own lines. One thin marker per counted
 * decision, a heavier one for the decisions that set the run band. `walk` lets the heavy marker walk
 * in from 0 once; only the first ruler on a page walks, so one thing moves.
 */
export function RunRuler({ group, walk = false, title, showKey = true }: { group: RulerGroup; walk?: boolean; title?: string; showKey?: boolean }) {
  const cuts = visibleCuts(group.segments);
  const sorted = [...group.markers].sort((a, b) => Number(a.heavy) - Number(b.heavy));
  return (
    <figure className="@container m-0 flex flex-col gap-2">
      {title === undefined ? null : <figcaption className="bw-label">{title}</figcaption>}
      <div className="relative py-3" aria-hidden>
        <Bar segments={group.segments} className="h-4" />
        {sorted.map((m) => (
          <div
            key={m.id}
            title={markerTitle(m)}
            className={cx(
              "absolute",
              m.heavy ? "top-0 h-10 w-1 bg-bw-text shadow-[0_0_0_1px_var(--bw-surface)]" : "top-1.5 h-7 w-0.5 bg-bw-text-muted shadow-[0_0_0_1px_var(--bw-surface)]",
              m.heavy && walk && styles["walk"],
            )}
            style={{ left: `calc(${m.at * 100}% - ${m.heavy ? 2 : 1}px)` }}
          />
        ))}
      </div>
      <div className="relative h-4 text-xs text-bw-text-muted" aria-hidden>
        {group.segments.map((s) => {
          const w = s.to - s.from;
          if (w < 0.06) return null;
          return (
            <span
              key={`${s.from}-label`}
              className={cx("absolute top-0 -translate-x-1/2 whitespace-nowrap", labelFit(w))}
              style={{ left: `${((s.from + s.to) / 2) * 100}%` }}
            >
              {segmentText(s)}
            </span>
          );
        })}
      </div>
      <div className="relative h-4 font-mono text-xs tabular-nums text-bw-text-muted" aria-hidden>
        <span className="absolute left-0">0</span>
        {cuts.map((c) => (
          <span key={c} className="absolute -translate-x-1/2 text-bw-text" style={{ left: `${c * 100}%` }}>
            {c.toFixed(2)}
          </span>
        ))}
        <span className="absolute right-0">1</span>
      </div>
      <p className="font-mono text-xs text-bw-text-muted">{group.axis}</p>
      <ul className="sr-only">
        {group.segments.map((s) => (
          <li key={`${s.from}-sr`}>{`${segmentText(s)} from ${s.from.toFixed(2)} to ${s.to.toFixed(2)}`}</li>
        ))}
      </ul>
      {showKey ? (
      <ul className="mt-1 flex flex-wrap gap-x-5 gap-y-2" aria-label={`Decisions on the ${group.axis} ruler`}>
        {group.markers.map((m) => (
          <li key={m.id} className="flex flex-wrap items-center gap-2 text-sm">
            <span aria-hidden className={cx("inline-block bg-bw-text", m.heavy ? "h-4 w-1" : "h-3 w-0.5 bg-bw-text-muted")} />
            <span className="font-mono text-xs text-bw-text">{m.id}</span>
            <BandBadge band={m.band} score={m.at} />
            {m.heavy ? <span className="text-xs text-bw-text-muted">sets the run band</span> : null}
          </li>
        ))}
      </ul>
      ) : (
        <p className="sr-only">{group.markers.map((m) => `${m.id} at ${m.at.toFixed(2)}`).join(", ")}</p>
      )}
    </figure>
  );
}

/** The runs list's tiny ruler: the decision that set the run band, on its own lines. */
export function MiniRuler({ group, marker }: { group: RulerGroup; marker: RulerMarker }) {
  const cuts = cutsOf(group.segments).map((c) => c.toFixed(2)).join(" and ");
  return (
    <span className="inline-flex flex-col gap-1">
      <span className="relative block h-3.5 w-28 py-1" role="img" aria-label={`${marker.id} at ${marker.at.toFixed(2)} ${group.axis}, lines at ${cuts}`}>
        <Bar segments={group.segments} className="h-1.5" />
        <span
          aria-hidden
          className="absolute top-0 h-3.5 w-0.5 bg-bw-text shadow-[0_0_0_1px_var(--bw-surface)]"
          style={{ left: `calc(${marker.at * 100}% - 1px)` }}
        />
      </span>
    </span>
  );
}
