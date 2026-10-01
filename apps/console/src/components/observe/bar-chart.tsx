import { layoutPairs, niceScale, type PairDay } from "./chart";

const W = 600;
const H = 180;

/**
 * SAVE-A: per day, the System One spend beside what the same calls would have cost on the LLM, on
 * one axis, so the gap is the read. Plain SVG that stretches to the width; the axis labels are HTML
 * beside it so they stay readable on a phone. Each day has a hit area the full height of its slot
 * and a title with both numbers; the table under the chart has the same numbers.
 */
export function PairedDailyBars({ days, label, format }: { days: readonly PairDay[]; label: string; format: (v: number) => string }) {
  const max = Math.max(0, ...days.map((d) => Math.max(d.spend, d.llm)));
  const { top, ticks } = niceScale(max);
  const pairs = layoutPairs(days, top, W, H, days.length > 45 ? 1 : 6, days.length > 45 ? 0 : 1, 2);
  const slot = days.length === 0 ? W : W / days.length;
  const first = days[0]?.day;
  const last = days.at(-1)?.day;

  return (
    <figure className="m-0">
      <ul className="mb-4 flex flex-wrap gap-x-5 gap-y-1 text-xs text-bw-text-muted" aria-label="Legend">
        <li className="flex items-center gap-2">
          <span aria-hidden className="inline-block h-2.5 w-2.5 bg-bw-brand" />
          System One spend
        </li>
        <li className="flex items-center gap-2">
          <span aria-hidden className="inline-block h-2.5 w-2.5 bg-bw-text-muted" />
          LLM estimate for the same calls
        </li>
      </ul>
      <div className="flex gap-2">
        <div className="relative w-16 shrink-0" style={{ height: H }} aria-hidden>
          {ticks.map((t) => (
            <span key={t} className="absolute right-0 -translate-y-1/2 font-mono text-[11px] tabular-nums text-bw-text-muted" style={{ top: `${(1 - t / top) * 100}%` }}>
              {format(t)}
            </span>
          ))}
        </div>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={label} className="block min-w-0 flex-1 overflow-visible" style={{ height: H }}>
          {ticks.map((t) => {
            const y = H - (t / top) * H;
            return <line key={t} x1={0} x2={W} y1={y} y2={y} stroke="var(--bw-border)" strokeWidth={1} vectorEffect="non-scaling-stroke" />;
          })}
          {pairs.map((p, i) => (
            <g key={p.day} className="group">
              <title>{`${p.day}: spent ${format(p.spend.value)}, LLM estimate ${format(p.llm.value)}`}</title>
              <rect x={i * slot} y={0} width={slot} height={H} fill="transparent" className="group-hover:fill-(--bw-surface-sunken)" />
              {p.spend.height > 0 ? <rect x={p.spend.x} y={p.spend.y} width={p.spend.width} height={p.spend.height} fill="var(--bw-brand)" /> : null}
              {p.llm.height > 0 ? <rect x={p.llm.x} y={p.llm.y} width={p.llm.width} height={p.llm.height} fill="var(--bw-text-muted)" /> : null}
            </g>
          ))}
          <line x1={0} x2={W} y1={H} y2={H} stroke="var(--bw-border-strong)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        </svg>
      </div>
      <div className="mt-1 flex justify-between pl-18 font-mono text-[11px] text-bw-text-muted" aria-hidden>
        <span>{first}</span>
        <span>{last}</span>
      </div>
      <figcaption className="sr-only">{label}. The table below lists each day.</figcaption>
    </figure>
  );
}
