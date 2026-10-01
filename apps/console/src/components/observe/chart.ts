// Geometry for the savings bar chart: one bar per UTC day, a zero baseline and a few round ticks.
// Pure, so it is unit tested; the SVG component only draws what this returns.

export interface DayValue {
  day: string;
  value: number;
}

/** Every UTC day from `from` to `to`, inclusive, with zero for days that had no runs. */
export function fillDays(from: Date, to: Date, values: readonly DayValue[], maxDays = 120): DayValue[] {
  const byDay = new Map(values.map((v) => [v.day, v.value]));
  const start = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  const end = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());
  const out: DayValue[] = [];
  for (let t = Math.max(start, end - (maxDays - 1) * 86_400_000); t <= end; t += 86_400_000) {
    const day = new Date(t).toISOString().slice(0, 10);
    out.push({ day, value: byDay.get(day) ?? 0 });
  }
  return out;
}

/** A round top for the axis (1, 2 or 5 times a power of ten) and its ticks from zero. */
export function niceScale(max: number, tickCount = 4): { top: number; ticks: number[] } {
  if (!(max > 0)) return { top: 1, ticks: [0, 1] };
  const rough = max / tickCount;
  const pow = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 5, 10].map((m) => m * pow).find((s) => s >= rough) ?? 10 * pow;
  const top = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= top + step / 2; v += step) ticks.push(Number(v.toPrecision(12)));
  return { top, ticks };
}

export interface Bar {
  day: string;
  value: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Bars in a plot of `width` by `height`, with `gap` between neighbors. Zero days get no bar. */
export function layoutBars(days: readonly DayValue[], top: number, width: number, height: number, gap = 2): Bar[] {
  if (days.length === 0) return [];
  const slot = width / days.length;
  const barWidth = Math.max(1, slot - gap);
  return days.map((d, i) => {
    const h = top <= 0 ? 0 : Math.max(0, (d.value / top) * height);
    return { day: d.day, value: d.value, x: i * slot + (slot - barWidth) / 2, y: height - h, width: barWidth, height: h };
  });
}
