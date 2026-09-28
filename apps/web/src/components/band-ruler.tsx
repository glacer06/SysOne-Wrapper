import type { Band } from "@bandwise/core";
import { segments } from "~/lib/decision-example";

const pct = (x: number) => `${(x * 100).toFixed(2)}%`;

export const bandClass: Record<Band, string> = { high: "band-high", medium: "band-medium", low: "band-low" };

export function BandLegend() {
  return (
    <p className="ruler-legend">
      <span>
        <i className={`swatch band-high`} aria-hidden="true" /> High band: acts on its own
      </span>
      <span>
        <i className={`swatch band-medium`} aria-hidden="true" /> Medium band: a person checks
      </span>
      <span>
        <i className={`swatch band-low`} aria-hidden="true" /> Low band: a person decides
      </span>
    </p>
  );
}

/**
 * The noul axis from 0 (surely no) to 1 (surely yes), split into the policy's bands, with numbered
 * markers for example answers. The markers are described in the list next to the ruler.
 */
export function BandRuler({
  policy,
  markers = [],
  label,
  showReads = true,
}: {
  policy: { trueAt: number; falseAt: number; reviewMargin: number };
  markers?: ReadonlyArray<{ value: number; n: number }>;
  label: string;
  showReads?: boolean;
}) {
  const segs = segments(policy);
  const edges = [0, ...segs.map((s) => s.to)];
  return (
    <figure className="ruler">
      <div className="ruler-track" role="img" aria-label={label}>
        {segs.map((s) => (
          <div key={s.from} className={`ruler-seg ${bandClass[s.band]}`} style={{ flexBasis: pct(s.to - s.from) }} />
        ))}
      </div>
      {markers.map((m) => (
        <div key={m.n} className="ruler-marker" style={{ left: pct(m.value) }} aria-hidden="true">
          <span>{m.n}</span>
        </div>
      ))}
      {showReads ? (
        <div className="ruler-reads" aria-hidden="true">
          {segs.map((s) => (
            <span key={s.from} style={{ flexBasis: pct(s.to - s.from) }} title={s.reads}>
              {s.to - s.from >= 0.15 ? s.reads : ""}
            </span>
          ))}
        </div>
      ) : null}
      <div className="ruler-ticks" aria-hidden="true">
        {edges.map((e) => (
          <span key={e} className="ruler-tick" style={{ left: pct(e) }}>
            {e.toFixed(1).replace(/\.0$/, "")}
          </span>
        ))}
      </div>
    </figure>
  );
}
