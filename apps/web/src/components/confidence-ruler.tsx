import type { Band } from "@bandwise/core";
import type { ReactNode } from "react";
import { segments } from "~/lib/decision-example";
import { CarryScene } from "./carry-scene";

const pct = (x: number) => `${(x * 100).toFixed(2)}%`;

export const bandWord: Record<Band, string> = { high: "High", medium: "Medium", low: "Low" };

/** Band badge: the band word and, when given, the number. Color is never the only signal. */
export function BandBadge({ band, score }: { band: Band; score?: number }) {
  return (
    <span className={`badge badge-${band}`}>
      {bandWord[band]}
      {score !== undefined ? <span className="badge-score">{score.toFixed(2)}</span> : null}
    </span>
  );
}

export function BandLegend() {
  return (
    <ul className="ruler-legend" aria-label="What each band does in this template">
      <li>
        <BandBadge band="high" /> acts on its own
      </li>
      <li>
        <BandBadge band="medium" /> a person checks
      </li>
      <li>
        <BandBadge band="low" /> a person decides
      </li>
    </ul>
  );
}

/** The supplied Scout art (brand/marks/bandwise-mark-C-*), split into the ant and its load as in the motion demo. */
function Layer({ part }: { part: "ant" | "load" }) {
  return (
    <picture className={`carry-${part}`}>
      <source srcSet={`/brand/scout-${part}-dark.svg`} media="(prefers-color-scheme: dark)" />
      <img src={`/brand/scout-${part}-light.svg`} alt="" width={72} height={110} />
    </picture>
  );
}

/**
 * The confidence ruler: the noul axis from 0 (surely no) to 1 (surely yes), split into the
 * policy's bands. Thresholds come from the policy passed in, never from constants here.
 *
 * With `carry`, the signature motion plays once: the ant walks to the score, the band lights up,
 * the load sets down, then the readout fades in. The rest state is the end frame, and reduced
 * motion shows only that.
 */
export function ConfidenceRuler({
  policy,
  markers = [],
  label,
  caption,
  carry,
  readout,
}: {
  policy: { trueAt: number; falseAt: number; reviewMargin: number };
  markers?: ReadonlyArray<{ value: number; n: number }>;
  label: string;
  caption?: ReactNode;
  carry?: { score: number };
  readout?: ReactNode;
}) {
  const segs = segments(policy);
  const edges = [0, ...segs.map((s) => s.to)];
  const lit = carry ? segs.find((s) => carry.score >= s.from && carry.score < s.to) : undefined;

  const body = (
    <>
      {carry ? (
        <div className="carry-lane" aria-hidden="true">
          <div className="carry-track">
            <div className="carry">
              <Layer part="ant" />
              <Layer part="load" />
            </div>
          </div>
        </div>
      ) : null}
      <div className="ruler-scale">
        <div className="ruler-track" role="img" aria-label={label}>
          {segs.map((s) => (
            <div
              key={s.from}
              className={`ruler-seg seg-${s.band}${s === lit ? " is-lit" : ""}`}
              style={{ flexBasis: pct(s.to - s.from) }}
            />
          ))}
        </div>
        {carry ? <div className="ruler-marker ruler-marker-carry" aria-hidden="true" /> : null}
        {markers.map((m) => (
          <div key={m.n} className="ruler-marker" style={{ left: pct(m.value) }} aria-hidden="true">
            <span>{m.n}</span>
          </div>
        ))}
      </div>
      <div className="ruler-reads" aria-hidden="true">
        {segs.map((s) => (
          <span key={s.from} style={{ flexBasis: pct(s.to - s.from) }}>
            {s.to - s.from >= 0.15 ? `${bandWord[s.band]}, ${s.reads}` : ""}
          </span>
        ))}
      </div>
      <div className="ruler-ticks" aria-hidden="true">
        {edges.map((e) => (
          <span key={e} className="ruler-tick" style={{ left: pct(e) }}>
            {e.toFixed(1)}
          </span>
        ))}
      </div>
      {readout ? <div className="ruler-readout">{readout}</div> : null}
    </>
  );

  return (
    <figure className={`ruler${carry ? " ruler-carry" : ""}`} style={carry ? ({ "--x": pct(carry.score) } as object) : undefined}>
      {caption ? <figcaption className="label ruler-caption">{caption}</figcaption> : null}
      {carry ? <CarryScene>{body}</CarryScene> : body}
    </figure>
  );
}
