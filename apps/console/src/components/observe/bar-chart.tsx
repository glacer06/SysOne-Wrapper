import { type DayValue, layoutBars, niceScale } from "./chart";

const W = 600;
const H = 160;

/**
 * One series of daily bars in plain SVG. The SVG stretches to the width, so the axis labels are
 * HTML beside it and stay readable on a phone. Each bar has a title for hover and a hit area the
 * full height of its day; the table under the chart has the same numbers.
 */
export function DailyBars({ days, label, format }: { days: readonly DayValue[]; label: string; format: (v: number) => string }) {
  const max = Math.max(0, ...days.map((d) => d.value));
  const { top, ticks } = niceScale(max);
  const bars = layoutBars(days, top, W, H, days.length > 60 ? 1 : 2);
  const slot = days.length === 0 ? W : W / days.length;
  const first = days[0]?.day;
  const last = days.at(-1)?.day;

  return (
    <figure className="m-0">
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
          {bars.map((b, i) => (
            <g key={b.day} className="group">
              <title>{`${b.day}: ${format(b.value)}`}</title>
              <rect x={i * slot} y={0} width={slot} height={H} fill="transparent" />
              {b.height > 0 ? <rect x={b.x} y={b.y} width={b.width} height={b.height} fill="var(--bw-brand)" className="group-hover:brightness-90" /> : null}
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
