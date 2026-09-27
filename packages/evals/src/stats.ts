// Small statistics helpers the eval metrics use. Deterministic and free of I/O.

/** z for a two-sided 95 percent interval. */
export const Z_95 = 1.959963984540054;

/**
 * Wilson score interval for a binomial proportion. Returns nulls when n is 0. Gates use `lower95`,
 * never the point estimate (effectiveness-loop.md section 2).
 */
export function wilson(successes: number, n: number, z = Z_95): { value: number | null; lower95: number | null; upper95: number | null } {
  if (n <= 0) return { value: null, lower95: null, upper95: null };
  const p = successes / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const centre = p + z2 / (2 * n);
  const margin = z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n));
  const clamp = (x: number): number => Math.min(1, Math.max(0, x));
  return { value: p, lower95: clamp((centre - margin) / denom), upper95: clamp((centre + margin) / denom) };
}

/** Nearest-rank percentile of a list (0 < q <= 1). Null for an empty list. */
export function percentile(values: readonly number[], q: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.max(1, Math.ceil(q * sorted.length));
  return sorted[rank - 1] ?? null;
}

export function mean(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** A share, or null when the denominator is 0. */
export function share(part: number, whole: number): number | null {
  return whole === 0 ? null : part / whole;
}

/** One row of a reliability table: predictions whose confidence fell in [lo, hi). */
export interface ReliabilityBin {
  lo: number;
  hi: number;
  n: number;
  meanConfidence: number | null;
  accuracy: number | null;
}

/** A point for calibration: the confidence of the predicted outcome and whether it was right. */
export interface CalibrationPoint {
  confidence: number;
  correct: boolean;
}

/**
 * Reliability table with `bins` equal-width bins over [0, 1], and the expected calibration error:
 * the n-weighted mean gap between accuracy and mean confidence. ECE is null with no points.
 */
export function reliability(points: readonly CalibrationPoint[], bins = 10): { ece: number | null; table: ReliabilityBin[] } {
  const rows = Array.from({ length: bins }, (_, i) => ({ lo: i / bins, hi: (i + 1) / bins, n: 0, conf: 0, right: 0 }));
  for (const p of points) {
    const c = Math.min(1, Math.max(0, p.confidence));
    const idx = Math.min(bins - 1, Math.floor(c * bins));
    const row = rows[idx];
    if (row === undefined) continue;
    row.n += 1;
    row.conf += c;
    if (p.correct) row.right += 1;
  }
  const total = points.length;
  let ece = 0;
  const table = rows.map((r) => {
    const meanConfidence = r.n === 0 ? null : r.conf / r.n;
    const accuracy = r.n === 0 ? null : r.right / r.n;
    if (meanConfidence !== null && accuracy !== null) ece += (r.n / total) * Math.abs(accuracy - meanConfidence);
    return { lo: r.lo, hi: r.hi, n: r.n, meanConfidence, accuracy };
  });
  return { ece: total === 0 ? null : ece, table };
}
