// Pure math behind the threshold ruler (EDIT-A): handle positions, keyboard steps, typed values,
// the histogram of recent scores and the band rows under it. No thresholds live here. Every band
// comes from a function the caller builds from the draft spec with core's own band rule.

import type { Band } from "@bandwise/core";

/** The smallest move a handle makes: one hundredth, the precision the spec is edited at. */
export const STEP = 0.01;
/** Page Up, Page Down and Shift with an arrow move ten steps. */
export const BIG_STEP = 0.1;

const BANDS: readonly Band[] = ["high", "medium", "low"];

/** Round to two decimals without float noise (0.1 + 0.2 reads 0.3). */
export function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

export function clamp(v: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, v));
}

/** The value under a pointer at `clientX` on a track that starts at `left` and is `width` wide. */
export function valueAtPointer(clientX: number, left: number, width: number): number {
  if (!(width > 0)) return 0;
  return round2(clamp((clientX - left) / width));
}

/**
 * The value a key moves a handle to, or null when the key is not a slider key. Arrows step one
 * hundredth (ten with Shift), Page Up and Down ten, Home and End go to the ends.
 */
export function keyStep(value: number, key: string, shift = false): number | null {
  const step = shift ? BIG_STEP : STEP;
  switch (key) {
    case "ArrowRight":
    case "ArrowUp":
      return round2(clamp(value + step));
    case "ArrowLeft":
    case "ArrowDown":
      return round2(clamp(value - step));
    case "PageUp":
      return round2(clamp(value + BIG_STEP));
    case "PageDown":
      return round2(clamp(value - BIG_STEP));
    case "Home":
      return 0;
    case "End":
      return 1;
    default:
      return null;
  }
}

/**
 * A typed threshold: a number from 0 to 1, with or without the leading zero, or a percent such
 * as "65%". Rounded to two decimals. Null when it is not one.
 */
export function parseTyped(text: string): number | null {
  const t = text.trim();
  if (t === "") return null;
  const pct = t.endsWith("%");
  const body = pct ? t.slice(0, -1).trim() : t;
  if (!/^(\d+(\.\d*)?|\.\d+)$/.test(body)) return null;
  const n = Number(body) / (pct ? 100 : 1);
  if (!Number.isFinite(n) || n < 0 || n > 1) return null;
  return round2(n);
}

/**
 * Two handles on one ruler, lower and upper. A move of one handle stops at the other, so the
 * lower never passes the upper. `gap` is the least distance they keep: 0 for choice and score
 * thresholds (medium may equal high), one step for the noul bars (false must sit below true).
 */
export function moveHandle(pair: { lower: number; upper: number }, which: "lower" | "upper", next: number, gap = 0): { lower: number; upper: number } {
  const v = round2(clamp(next));
  if (which === "lower") return { lower: round2(Math.min(v, pair.upper - gap)), upper: pair.upper };
  return { lower: pair.lower, upper: round2(Math.max(v, pair.lower + gap)) };
}

/** The handle a click on the track moves: the nearer one, and on a tie the one on the click's side. */
export function nearestHandle(pair: { lower: number; upper: number }, v: number): "lower" | "upper" {
  const dl = Math.abs(v - pair.lower);
  const du = Math.abs(v - pair.upper);
  if (dl !== du) return dl < du ? "lower" : "upper";
  return v < pair.lower ? "lower" : "upper";
}

export interface HistogramBin {
  from: number;
  to: number;
  /** Scores in [from, to), split by the band each lands in under the draft. The last bin includes 1. */
  counts: Record<Band, number>;
  total: number;
}

/**
 * Recent scores in `bins` equal bins from 0 to 1. A bin that straddles a threshold is split by the
 * band of each score in it, so the colors match what the draft would do with those runs.
 */
export function histogram(scores: readonly number[], bandOf: (x: number) => Band, bins = 25): HistogramBin[] {
  const out: HistogramBin[] = Array.from({ length: bins }, (_, i) => ({
    from: round2(i / bins),
    to: round2((i + 1) / bins),
    counts: { high: 0, medium: 0, low: 0 },
    total: 0,
  }));
  for (const s of scores) {
    if (!(s >= 0 && s <= 1)) continue;
    const bin = out[Math.min(bins - 1, Math.floor(s * bins))];
    if (bin === undefined) continue;
    bin.counts[bandOf(s)] += 1;
    bin.total += 1;
  }
  return out;
}

export interface BandRow {
  band: Band;
  count: number;
  /** Share of all counted scores, 0 to 1. Zero when there are none. */
  share: number;
  /** Change in count from the published version's bands on the same scores. Null when nothing is published. */
  delta: number | null;
}

/** Count, share and change from published for each band, high first. */
export function bandRows(scores: readonly number[], bandOf: (x: number) => Band, publishedBandOf: ((x: number) => Band) | null): BandRow[] {
  const valid = scores.filter((s) => s >= 0 && s <= 1);
  const count = (f: (x: number) => Band, band: Band) => valid.filter((s) => f(s) === band).length;
  return BANDS.map((band) => {
    const c = count(bandOf, band);
    return {
      band,
      count: c,
      share: valid.length === 0 ? 0 : c / valid.length,
      delta: publishedBandOf === null ? null : c - count(publishedBandOf, band),
    };
  });
}

/** "+6", "−9" (a true minus sign) or "0". */
export function formatDelta(d: number): string {
  if (d === 0) return "0";
  return d > 0 ? `+${d}` : `−${Math.abs(d)}`;
}

/** "52%". Whole percents; a share under one percent that is not zero reads "<1%". */
export function formatShare(share: number): string {
  if (share === 0) return "0%";
  const pct = Math.round(share * 100);
  return pct === 0 ? "<1%" : `${pct}%`;
}

/**
 * Where a band sits on the scale, in words: "0.65 to 1", "0 to 0.30 and 0.70 to 1". Built from
 * the band segments, so it is right for noul, whose high band sits at both ends.
 */
export function bandRange(segments: readonly { from: number; to: number; band: Band }[], band: Band): string {
  // A segment ends where the next begins: the sampled `to` sits a sample short of the cut.
  const parts = segments.flatMap((s, i) => (s.band === band ? [`${fmt(s.from)} to ${fmt(segments[i + 1]?.from ?? s.to)}`] : []));
  return parts.length === 0 ? "none" : parts.join(" and ");
}

function fmt(v: number): string {
  return v === 0 ? "0" : v === 1 ? "1" : v.toFixed(2);
}
