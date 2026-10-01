import type { Band } from "@bandwise/core";
import type { ReactNode } from "react";
import { segments } from "~/lib/decision-example";
import { CarryScene } from "./carry-scene";
import { UNLOADED_ANT_DARK, UNLOADED_ANT_LIGHT } from "./unloaded-ant-art";

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

/**
 * The carry: the supplied unloaded side-view ant (brand/unloaded, A, facing right), inlined so CSS
 * can swing its six leg groups, with the supplied B monogram (brand/marks) on its back. Nothing is
 * redrawn: the ant markup comes unchanged from the brand files (see lib/unloaded-ant.ts), and the B
 * is the file itself, only scaled and placed. Each theme has its own file; CSS shows the one in force.
 */
function Carry() {
  return (
    <div className="carry">
      <span className="carry-ant">
        <span className="carry-art carry-art-light" dangerouslySetInnerHTML={{ __html: UNLOADED_ANT_LIGHT }} />
        <span className="carry-art carry-art-dark" dangerouslySetInnerHTML={{ __html: UNLOADED_ANT_DARK }} />
      </span>
      <span className="carry-load">
        <picture className="carry-b">
          <source srcSet="/brand/bandwise-b-monogram-dark.svg" media="(prefers-color-scheme: dark)" />
          <img src="/brand/bandwise-b-monogram-light.svg" alt="" width={14} height={21} />
        </picture>
      </span>
    </div>
  );
}

/**
 * The confidence ruler: the noul axis from 0 (surely no) to 1 (surely yes), split into the
 * policy's bands. Thresholds come from the policy passed in, never from constants here.
 *
 * With `carry`, the signature motion plays once: the ant walks the ruler with the B on its back,
 * the band lights up, the B sets down at the score, then the readout fades in. The rest state is the end frame, and reduced
 * motion shows only that.
 */
export function ConfidenceRuler({
  policy,
  markers = [],
  label,
  caption,
  carry,
  readout,
  compact = false,
}: {
  policy: { trueAt: number; falseAt: number; reviewMargin: number };
  markers?: ReadonlyArray<{ value: number; n: number }>;
  label: string;
  caption?: ReactNode;
  carry?: { score: number };
  readout?: ReactNode;
  /** A small ruler for tight spots, such as under the hero's exhibit card. */
  compact?: boolean;
}) {
  const segs = segments(policy);
  const edges = [0, ...segs.map((s) => s.to)];
  const lit = carry ? segs.find((s) => carry.score >= s.from && carry.score < s.to) : undefined;

  const body = (
    <>
      {carry ? (
        <div className="carry-lane" aria-hidden="true">
          <div className="carry-track">
            <Carry />
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
    <figure
      className={`ruler${carry ? " ruler-carry" : ""}${compact ? " ruler-compact" : ""}`}
      style={carry ? ({ "--x": pct(carry.score) } as object) : undefined}
    >
      {caption ? <figcaption className="label ruler-caption">{caption}</figcaption> : null}
      {carry ? <CarryScene>{body}</CarryScene> : body}
    </figure>
  );
}
