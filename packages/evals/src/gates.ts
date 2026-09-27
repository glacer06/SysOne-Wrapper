// Eval gates (testing.md, Evals, Gates; confidence-policy.md, Quality targets).

import type { QualityTarget } from "@sysone/core";
import type { EvalMetrics } from "./metrics.js";

export type GateStatus = "pass" | "fail" | "insufficient_data";

export interface GateResult {
  gate: "high_precision" | "regression";
  status: GateStatus;
  reasons: string[];
}

/** Default regression margins (data-model.md, gate_margins). */
export const DEFAULT_GATE_MARGINS = { coverageDrop: 0.02, reviewLoadRise: 0.1 } as const;
export interface GateMargins {
  coverageDrop: number;
  reviewLoadRise: number;
}

const pct = (x: number | null): string => (x === null ? "n/a" : `${(x * 100).toFixed(1)}%`);

/**
 * High-band precision gate: the 95 percent lower bound must reach `highPrecision`. Below
 * `minLabeledHigh` labeled high-band decisions the gate returns insufficient_data.
 */
export function highPrecisionGate(metrics: EvalMetrics, target: QualityTarget): GateResult {
  const high = metrics.bands.high;
  if (high.labeled < target.minLabeledHigh) {
    return {
      gate: "high_precision",
      status: "insufficient_data",
      reasons: [`${high.labeled} labeled high-band decisions, ${target.minLabeledHigh} needed`],
    };
  }
  const ok = high.lower95 !== null && high.lower95 >= target.highPrecision;
  return {
    gate: "high_precision",
    status: ok ? "pass" : "fail",
    reasons: [`high-band precision lower bound ${pct(high.lower95)} against target ${pct(target.highPrecision)}`],
  };
}

/**
 * Regression gate: champion and candidate scored on the same snapshot. The candidate's high-band
 * lower bound is not below the champion's, its coverage does not drop by more than
 * `coverageDrop`, and its review load does not rise by more than `reviewLoadRise`.
 */
export function regressionGate(champion: EvalMetrics, candidate: EvalMetrics, margins: GateMargins = DEFAULT_GATE_MARGINS): GateResult {
  const reasons: string[] = [];
  const cl = champion.bands.high.lower95;
  const nl = candidate.bands.high.lower95;
  if (cl === null || nl === null) {
    return { gate: "regression", status: "insufficient_data", reasons: ["no labeled high-band decisions on one side"] };
  }
  if (nl < cl) reasons.push(`high-band lower bound fell from ${pct(cl)} to ${pct(nl)}`);
  const cc = champion.coverage ?? 0;
  const nc = candidate.coverage ?? 0;
  if (nc < cc - margins.coverageDrop - 1e-12) reasons.push(`coverage fell from ${pct(cc)} to ${pct(nc)}`);
  const cr = champion.reviewLoad ?? 0;
  const nr = candidate.reviewLoad ?? 0;
  if (nr > cr + margins.reviewLoadRise + 1e-12) reasons.push(`review load rose from ${pct(cr)} to ${pct(nr)}`);
  return { gate: "regression", status: reasons.length === 0 ? "pass" : "fail", reasons };
}
