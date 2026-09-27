// Eval metrics (testing.md, Evals). Pure: scored RunResults and labels in, numbers out.
//
// - Per question: accuracy, MAE (score and composite values), Brier score (noul), confusion matrix.
// - Per band: precision with its 95 percent Wilson lower bound, coverage (share whose policy action
//   is auto), review load, ECE and a reliability table.
// - Cost, p50 and p95 latency.
//
// A labeled decision counts only when it is relevant: an irrelevant decision is left out of
// calibration metrics, as the router tests require. Coverage and review load read the policy
// `action`, not `effectiveAction`, so they can be measured whatever the rollout stage.

import {
  type Band,
  type Decision,
  type QuestionSetSpec,
  type RunResult,
  type SystemOneAnswer,
  microFromUsd,
} from "@bandwise/core";
import { type CalibrationPoint, type ReliabilityBin, mean, percentile, reliability, share, wilson } from "./stats.js";

export const BANDS: readonly Band[] = ["high", "medium", "low"];

/** One scored case. `result` is null when the run was refused before it had a run id. */
export interface CaseOutcome {
  caseId: string;
  expected: Record<string, unknown>;
  result: RunResult | null;
  /** Error code when the run failed or was refused. */
  error: string | null;
}

export type DecisionType = "noul" | "choice" | "score" | "composite" | "unknown";

export interface BandMetrics {
  /** Relevant decisions in this band (labeled or not). */
  decisions: number;
  /** Labeled relevant decisions in this band. */
  labeled: number;
  correct: number;
  precision: number | null;
  /** 95 percent Wilson lower bound. Gates use this. */
  lower95: number | null;
  /** Share of this band's decisions whose policy action is auto. */
  coverage: number | null;
  /** Share of this band's decisions whose policy action is review. */
  reviewLoad: number | null;
  ece: number | null;
  reliability: ReliabilityBin[];
}

export interface Confusion {
  /** Row and column labels. Rows are expected values, columns predicted ones. */
  labels: string[];
  matrix: number[][];
}

export interface QuestionMetrics {
  decisionId: string;
  type: DecisionType;
  gating: boolean;
  /** Relevant decisions with a label. */
  labeled: number;
  /** Labels whose decision was missing or irrelevant in that run. */
  unscored: number;
  accuracy: number | null;
  /** Score and composite values: mean absolute error against the expected number. */
  mae: number | null;
  /** Noul only: mean squared error of the yes probability against the label. */
  brier: number | null;
  confusion: Confusion;
  coverage: number | null;
  reviewLoad: number | null;
  ece: number | null;
  reliability: ReliabilityBin[];
  bands: Record<Band, BandMetrics>;
}

export interface CostMetrics {
  runs: number;
  calls: number;
  inputTokens: number;
  /** Sum of priced runs, integer micro-USD. */
  systemOneCostMicroUsd: number;
  systemOneCostUsd: number;
  /** Runs whose cost was null (unpriced model in BYO key mode). */
  unpricedRuns: number;
  meanCostPerRunUsd: number | null;
  latencyP50Ms: number | null;
  latencyP95Ms: number | null;
}

export interface EvalMetrics {
  cases: number;
  okRuns: number;
  failedRuns: number;
  errors: Record<string, number>;
  /** Over gating questions. */
  coverage: number | null;
  reviewLoad: number | null;
  ece: number | null;
  reliability: ReliabilityBin[];
  /** Over gating questions. */
  bands: Record<Band, BandMetrics>;
  questions: Record<string, QuestionMetrics>;
  cost: CostMetrics;
  /** Share of repeated cases whose values and bands held across repeats; null without --repeats. */
  stability: number | null;
}

// ---------------------------------------------------------------------------
// Scoring one decision

/** What one labeled decision contributes. */
export interface ScoredDecision {
  correct: boolean;
  /** Confidence of the predicted outcome, for calibration; null when the answer has none. */
  confidence: number | null;
  /** Row and column for the confusion matrix. */
  expectedLabel: string;
  predictedLabel: string;
  absError: number | null;
  brier: number | null;
}

function label(v: unknown): string {
  return v === null || v === undefined ? "null" : typeof v === "string" ? v : JSON.stringify(v);
}

function numberOrNull(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** Score one relevant decision against its label. Exposed for tests. */
export function scoreDecision(type: DecisionType, decision: Decision, answer: SystemOneAnswer | undefined, expected: unknown): ScoredDecision {
  if (type === "noul") {
    const p = answer !== undefined && answer.type === "noul" ? numberOrNull((answer as { noul?: unknown }).noul) : null;
    // A noul in the low band has value null: the prediction falls back to the side of 0.5.
    const predicted = typeof decision.value === "boolean" ? decision.value : p === null ? null : p >= 0.5;
    const y = expected === true ? 1 : expected === false ? 0 : null;
    const confidence = p === null || predicted === null ? null : predicted ? p : 1 - p;
    return {
      correct: decision.value === expected,
      confidence,
      expectedLabel: label(expected),
      predictedLabel: label(decision.value),
      absError: null,
      brier: p === null || y === null ? null : (p - y) ** 2,
    };
  }
  if (type === "choice") {
    const probs = answer !== undefined && answer.type === "choice" ? (answer as { probabilities?: Record<string, number> }).probabilities : undefined;
    const confidence = typeof decision.value === "string" ? numberOrNull(probs?.[decision.value]) : null;
    return {
      correct: decision.value === expected,
      confidence,
      expectedLabel: label(expected),
      predictedLabel: label(decision.value),
      absError: null,
      brier: null,
    };
  }
  if (type === "score") {
    const value = numberOrNull(decision.value);
    const level = value === null ? null : Math.round(value);
    const want = numberOrNull(expected);
    const probs = answer !== undefined && answer.type === "score" ? (answer as { probabilities?: Record<string, number> }).probabilities : undefined;
    return {
      correct: level !== null && want !== null && level === want,
      confidence: level === null ? null : numberOrNull(probs?.[String(level)]),
      expectedLabel: label(expected),
      predictedLabel: label(level),
      absError: value === null || want === null ? null : Math.abs(value - want),
      brier: null,
    };
  }
  if (type === "composite") {
    // A composite label is a level ("high", "medium", "low") or a 0..1 value.
    const value = numberOrNull(decision.value);
    const want = numberOrNull(expected);
    const byLevel = typeof expected === "string";
    return {
      correct: byLevel ? decision.level === expected : value !== null && want !== null && Math.abs(value - want) < 1e-9,
      confidence: null,
      expectedLabel: label(expected),
      predictedLabel: byLevel ? label(decision.level) : label(value),
      absError: !byLevel && value !== null && want !== null ? Math.abs(value - want) : null,
      brier: null,
    };
  }
  return {
    correct: JSON.stringify(decision.value) === JSON.stringify(expected),
    confidence: null,
    expectedLabel: label(expected),
    predictedLabel: label(decision.value),
    absError: null,
    brier: null,
  };
}

// ---------------------------------------------------------------------------
// Aggregation

/** Question type per decision id, from the spec. Composites are "composite". */
export function decisionTypes(spec: QuestionSetSpec): Map<string, { type: DecisionType; gating: boolean }> {
  const out = new Map<string, { type: DecisionType; gating: boolean }>();
  for (const stage of spec.stages) {
    for (const [qid, q] of Object.entries(stage.questions)) {
      out.set(qid, { type: q.type, gating: spec.policies[qid]?.gating ?? false });
    }
  }
  for (const c of spec.composites ?? []) out.set(c.id, { type: "composite", gating: spec.policies[c.id]?.gating ?? false });
  return out;
}

interface BandAcc {
  decisions: number;
  auto: number;
  review: number;
  labeled: number;
  correct: number;
  points: CalibrationPoint[];
}

const emptyBand = (): BandAcc => ({ decisions: 0, auto: 0, review: 0, labeled: 0, correct: 0, points: [] });

function finishBand(b: BandAcc): BandMetrics {
  const w = wilson(b.correct, b.labeled);
  const r = reliability(b.points);
  return {
    decisions: b.decisions,
    labeled: b.labeled,
    correct: b.correct,
    precision: w.value,
    lower95: w.lower95,
    coverage: share(b.auto, b.decisions),
    reviewLoad: share(b.review, b.decisions),
    ece: r.ece,
    reliability: r.table,
  };
}

interface QuestionAcc {
  bands: Record<Band, BandAcc>;
  unscored: number;
  absErrors: number[];
  briers: number[];
  confusion: Map<string, Map<string, number>>;
}

function bandsOf(): Record<Band, BandAcc> {
  return { high: emptyBand(), medium: emptyBand(), low: emptyBand() };
}

function sumBands(bands: Record<Band, BandAcc>): BandAcc {
  const all = emptyBand();
  for (const b of BANDS) {
    const x = bands[b];
    all.decisions += x.decisions;
    all.auto += x.auto;
    all.review += x.review;
    all.labeled += x.labeled;
    all.correct += x.correct;
    all.points.push(...x.points);
  }
  return all;
}

function confusionOf(m: Map<string, Map<string, number>>): Confusion {
  const labels = new Set<string>();
  for (const [e, row] of m) {
    labels.add(e);
    for (const p of row.keys()) labels.add(p);
  }
  const sorted = [...labels].sort();
  return { labels: sorted, matrix: sorted.map((e) => sorted.map((p) => m.get(e)?.get(p) ?? 0)) };
}

/** Aggregate scored cases into eval metrics. `stability` comes from the repeat pass, if any. */
export function computeMetrics(spec: QuestionSetSpec, outcomes: readonly CaseOutcome[], stability: number | null = null): EvalMetrics {
  const types = decisionTypes(spec);
  const perQuestion = new Map<string, QuestionAcc>();
  const accFor = (id: string): QuestionAcc => {
    let a = perQuestion.get(id);
    if (a === undefined) {
      a = { bands: bandsOf(), unscored: 0, absErrors: [], briers: [], confusion: new Map() };
      perQuestion.set(id, a);
    }
    return a;
  };
  for (const id of types.keys()) accFor(id);

  const errors: Record<string, number> = {};
  const latencies: number[] = [];
  let okRuns = 0;
  let calls = 0;
  let inputTokens = 0;
  let costMicro = 0;
  let unpriced = 0;
  let priced = 0;

  for (const o of outcomes) {
    const r = o.result;
    if (r === null || r.status !== "ok") {
      const code = o.error ?? r?.error?.code ?? "unknown";
      errors[code] = (errors[code] ?? 0) + 1;
    } else {
      okRuns += 1;
    }
    if (r === null) {
      for (const id of Object.keys(o.expected)) accFor(id).unscored += 1;
      continue;
    }
    latencies.push(r.cost.latencyMs);
    calls += r.stages.reduce((n, s) => n + s.calls.length, 0);
    inputTokens += r.cost.systemOneInputTokens;
    if (r.cost.systemOneCostUsd === null) unpriced += 1;
    else {
      priced += 1;
      costMicro += microFromUsd(r.cost.systemOneCostUsd);
    }
    if (r.status !== "ok") {
      for (const id of Object.keys(o.expected)) accFor(id).unscored += 1;
      continue;
    }

    for (const [id, d] of Object.entries(r.decisions)) {
      const info = types.get(id);
      if (info === undefined) continue; // checks are decisions too, but not labeled questions
      const a = accFor(id);
      const hasLabel = Object.hasOwn(o.expected, id);
      if (!d.relevant) {
        if (hasLabel) a.unscored += 1;
        continue;
      }
      const band = a.bands[d.band];
      band.decisions += 1;
      if (d.action === "auto") band.auto += 1;
      if (d.action === "review") band.review += 1;
      if (!hasLabel) continue;
      const s = scoreDecision(info.type, d, r.answers[id], o.expected[id]);
      band.labeled += 1;
      if (s.correct) band.correct += 1;
      if (s.confidence !== null) band.points.push({ confidence: s.confidence, correct: s.correct });
      if (s.absError !== null) a.absErrors.push(s.absError);
      if (s.brier !== null) a.briers.push(s.brier);
      const row = a.confusion.get(s.expectedLabel) ?? new Map<string, number>();
      row.set(s.predictedLabel, (row.get(s.predictedLabel) ?? 0) + 1);
      a.confusion.set(s.expectedLabel, row);
    }
    for (const id of Object.keys(o.expected)) {
      if (!Object.hasOwn(r.decisions, id)) accFor(id).unscored += 1;
    }
  }

  const questions: Record<string, QuestionMetrics> = {};
  const gatingBands = bandsOf();
  for (const [id, a] of [...perQuestion].sort(([x], [y]) => (x < y ? -1 : 1))) {
    const info = types.get(id) ?? { type: "unknown" as const, gating: false };
    const all = sumBands(a.bands);
    const rel = reliability(all.points);
    questions[id] = {
      decisionId: id,
      type: info.type,
      gating: info.gating,
      labeled: all.labeled,
      unscored: a.unscored,
      accuracy: share(all.correct, all.labeled),
      mae: mean(a.absErrors),
      brier: mean(a.briers),
      confusion: confusionOf(a.confusion),
      coverage: share(all.auto, all.decisions),
      reviewLoad: share(all.review, all.decisions),
      ece: rel.ece,
      reliability: rel.table,
      bands: { high: finishBand(a.bands.high), medium: finishBand(a.bands.medium), low: finishBand(a.bands.low) },
    };
    if (info.gating) {
      for (const b of BANDS) {
        const g = gatingBands[b];
        const x = a.bands[b];
        g.decisions += x.decisions;
        g.auto += x.auto;
        g.review += x.review;
        g.labeled += x.labeled;
        g.correct += x.correct;
        g.points.push(...x.points);
      }
    }
  }

  const allGating = sumBands(gatingBands);
  const rel = reliability(allGating.points);
  return {
    cases: outcomes.length,
    okRuns,
    failedRuns: outcomes.length - okRuns,
    errors,
    coverage: share(allGating.auto, allGating.decisions),
    reviewLoad: share(allGating.review, allGating.decisions),
    ece: rel.ece,
    reliability: rel.table,
    bands: { high: finishBand(gatingBands.high), medium: finishBand(gatingBands.medium), low: finishBand(gatingBands.low) },
    questions,
    cost: {
      runs: outcomes.filter((o) => o.result !== null).length,
      calls,
      inputTokens,
      systemOneCostMicroUsd: costMicro,
      systemOneCostUsd: costMicro / 1e6,
      unpricedRuns: unpriced,
      meanCostPerRunUsd: priced === 0 ? null : costMicro / priced / 1e6,
      latencyP50Ms: percentile(latencies, 0.5),
      latencyP95Ms: percentile(latencies, 0.95),
    },
    stability,
  };
}
