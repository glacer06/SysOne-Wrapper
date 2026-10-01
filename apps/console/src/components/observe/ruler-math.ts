// Geometry for the run rulers (RUNS-C): which band each stretch of 0 to 1 lands in under a set's own
// thresholds, and where each decision of a run sits on it. Pure, so it is unit tested. Nothing here
// knows a cutoff: every line comes from the spec of the version the run used, through core's own
// band rules, so the picture matches what the run decided.

import { type Band, type ConfidencePolicy, noulBand, type QuestionSetSpec, thresholdBand, type Thresholds } from "@bandwise/core";

import type { RulerSegment } from "~/components/ui";

import { type DecisionLike, scoreOf } from "./decisions";

const round = (x: number) => Math.round(x * 1e9) / 1e9;

/**
 * Segments from exact cut points: each stretch between two cuts takes the band the engine's own rule
 * gives its midpoint, and neighbors with the same band and value merge. The cuts are the spec's
 * numbers, so the labels under the ruler read exactly what the spec says.
 */
export function segmentsFrom(cuts: readonly number[], at: (x: number) => { band: Band; value?: boolean | null }): RulerSegment[] {
  const points = [...new Set([0, 1, ...cuts.map(round).filter((c) => c > 0 && c < 1)])].sort((x, y) => x - y);
  const out: RulerSegment[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const from = points[i] as number;
    const to = points[i + 1] as number;
    const r = at((from + to) / 2);
    const last = out[out.length - 1];
    if (last !== undefined && last.band === r.band && last.value === r.value) last.to = to;
    else out.push({ from, to, ...r });
  }
  return out;
}

/** The thresholds a choice answer is judged by: the option's own stricter bars when the spec has them. */
function choiceThresholds(policy: Extract<ConfidencePolicy, { type: "choice" }>, option: unknown): Thresholds {
  if (typeof option === "string" && policy.perOption?.[option] !== undefined) return policy.perOption[option];
  return policy.thresholds;
}

/**
 * The ruler for one question's policy. Noul draws P(yes), where both ends are high; choice and score
 * draw confidence. Composites return null: their policy sets a level, not a band.
 */
export function policySegments(policy: ConfidencePolicy, value?: unknown): { axis: string; segments: RulerSegment[] } | null {
  switch (policy.type) {
    case "noul": {
      const t = policy.noul;
      return {
        axis: "P(yes)",
        segments: segmentsFrom([t.falseAt, t.falseAt + t.reviewMargin, t.trueAt - t.reviewMargin, t.trueAt], (x) => {
          const r = noulBand(x, t);
          return { band: r.band, value: r.value as boolean | null };
        }),
      };
    }
    case "choice": {
      const t = choiceThresholds(policy, value);
      return { axis: "Confidence", segments: segmentsFrom([t.medium, t.high], (x) => ({ band: thresholdBand(x, t) })) };
    }
    case "score":
      return { axis: "Confidence", segments: segmentsFrom([policy.thresholds.medium, policy.thresholds.high], (x) => ({ band: thresholdBand(x, policy.thresholds) })) };
    default:
      return null;
  }
}

/** The cut points between segments, for labels: where one band hands over to the next. */
export function cutsOf(segments: readonly RulerSegment[]): number[] {
  return segments.slice(1).map((s) => s.from);
}

export interface RulerMarker {
  /** The decision id. */
  id: string;
  at: number;
  band: Band;
  /** True for the decisions whose band is the run band: they set it. */
  heavy: boolean;
}

export interface RulerGroup {
  key: string;
  axis: string;
  segments: RulerSegment[];
  markers: RulerMarker[];
}

export interface RunRulers {
  groups: RulerGroup[];
  /** Decisions that cannot sit on a confidence ruler, and why. */
  unplaced: { id: string; why: string }[];
}

const BAND_RANK: Record<Band, number> = { low: 0, medium: 1, high: 2 };

/**
 * The run's decisions on the set's own rulers. Questions that share the same lines share one ruler,
 * so a set with one policy shape draws a single full-width ruler; a set that mixes noul and choice
 * draws one per shape, each named by its axis. Only counted (relevant) decisions get a marker, the
 * same ones the run band is taken from.
 */
export function runRulers(spec: QuestionSetSpec, decisions: readonly [string, DecisionLike][], answers: unknown, runBand: Band): RunRulers {
  const byId = (typeof answers === "object" && answers !== null ? answers : {}) as Record<string, unknown>;
  const groups = new Map<string, RulerGroup>();
  const unplaced: { id: string; why: string }[] = [];
  for (const [id, d] of decisions) {
    if (!d.relevant) {
      unplaced.push({ id, why: "not relevant to this run, so not counted" });
      continue;
    }
    const policy = spec.policies[id];
    if (policy === undefined) {
      const composite = spec.composites?.some((c) => c.id === id) === true;
      unplaced.push({ id, why: composite ? "a composite, which has a level, not a confidence" : "no policy in this version's spec" });
      continue;
    }
    const drawn = policySegments(policy, d.value);
    const at = scoreOf(byId[id]);
    if (drawn === null || at === null) {
      unplaced.push({ id, why: "no score was stored for it" });
      continue;
    }
    const key = `${drawn.axis}:${drawn.segments.map((s) => `${s.from}-${s.band}-${String(s.value)}`).join("|")}`;
    let g = groups.get(key);
    if (g === undefined) {
      g = { key, axis: drawn.axis, segments: drawn.segments, markers: [] };
      groups.set(key, g);
    }
    g.markers.push({ id, at: Math.min(1, Math.max(0, at)), band: d.band, heavy: d.band === runBand });
  }
  // The ruler that holds the run band comes first: it is the one the page opens on.
  const ordered = [...groups.values()].sort((a, b) => Number(b.markers.some((m) => m.heavy)) - Number(a.markers.some((m) => m.heavy)));
  return { groups: ordered, unplaced };
}

/**
 * The one decision a list row draws: the counted decision with the weakest band, and among equals the
 * one nearest a line. That is the decision that set the run band.
 */
export function decidingMarker(rulers: RunRulers): { group: RulerGroup; marker: RulerMarker } | null {
  let best: { group: RulerGroup; marker: RulerMarker; gap: number } | null = null;
  for (const group of rulers.groups) {
    const cuts = cutsOf(group.segments);
    for (const marker of group.markers) {
      const gap = cuts.length === 0 ? 1 : Math.min(...cuts.map((c) => Math.abs(c - marker.at)));
      if (best === null || BAND_RANK[marker.band] < BAND_RANK[best.marker.band] || (marker.band === best.marker.band && gap < best.gap)) {
        best = { group, marker, gap };
      }
    }
  }
  return best === null ? null : { group: best.group, marker: best.marker };
}

/** One decision on its own ruler, for the review queue: the same lines, one heavy marker. */
export function decisionRuler(spec: QuestionSetSpec, decisions: readonly [string, DecisionLike][], answers: unknown, decisionId: string): RulerGroup | null {
  const one = decisions.filter(([id]) => id === decisionId);
  const d = one[0]?.[1];
  if (d === undefined) return null;
  // Placed as if it set the band, so its marker is the heavy one; relevance does not hide it here.
  const rulers = runRulers(spec, [[decisionId, { ...d, relevant: true }]], answers, d.band);
  return rulers.groups[0] ?? null;
}
