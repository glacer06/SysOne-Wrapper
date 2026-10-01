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

export interface PairDay {
  day: string;
  /** System One spend. */
  spend: number;
  /** What the same calls would have cost on the LLM. */
  llm: number;
}

export interface PairBars {
  day: string;
  spend: Bar;
  llm: Bar;
}

/**
 * Two bars per day on one axis, spend then the LLM estimate, so the gap between them reads at a
 * glance (SAVE-A). Both share `top`, never a second scale. `gap` is the space between days and
 * `inner` the hairline between a day's two bars.
 */
export function layoutPairs(days: readonly PairDay[], top: number, width: number, height: number, gap = 4, inner = 1, minHeight = 0): PairBars[] {
  if (days.length === 0) return [];
  const slot = width / days.length;
  const barWidth = Math.max(0.5, (slot - gap - inner) / 2);
  // A day with any spend keeps a sliver of bar, so a small number never reads as zero.
  const h = (v: number) => (top <= 0 || !(v > 0) ? 0 : Math.max(minHeight, Math.min(1, v / top) * height));
  return days.map((d, i) => {
    const left = i * slot + (slot - (barWidth * 2 + inner)) / 2;
    const hs = h(d.spend);
    const hl = h(d.llm);
    return {
      day: d.day,
      spend: { day: d.day, value: d.spend, x: left, y: height - hs, width: barWidth, height: hs },
      llm: { day: d.day, value: d.llm, x: left + barWidth + inner, y: height - hl, width: barWidth, height: hl },
    };
  });
}
