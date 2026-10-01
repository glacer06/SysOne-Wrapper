import type { QuestionSetSpec } from "@bandwise/core";
import { describe, expect, it } from "vitest";

import { layoutPairs } from "./chart";
import type { DecisionLike } from "./decisions";
import { decidingMarker, decisionRuler, policySegments, runRulers, segmentsFrom } from "./ruler-math";
import { visibleCuts } from "./run-ruler";

const actions = { high: "auto", medium: "review", low: "review" } as never;
const noul = { type: "noul", gating: true, noul: { trueAt: 0.75, falseAt: 0.2, reviewMargin: 0.1 }, actions } as const;
const choice = { type: "choice", gating: true, thresholds: { high: 0.7, medium: 0.4 }, perOption: { block: { high: 0.9, medium: 0.6 } }, actions } as const;

const spec = {
  policies: { risky: noul, kind: choice, other: noul },
  composites: [{ id: "combo", kind: "weighted", terms: [] }],
} as unknown as QuestionSetSpec;

const d = (band: DecisionLike["band"], value: unknown, relevant = true): DecisionLike => ({ value, band, relevant, action: "auto", effectiveAction: relevant ? "auto" : "fallback", executed: false });

describe("policy segments", () => {
  it("cuts a noul ruler at the spec's own numbers, high at both ends", () => {
    const s = policySegments(noul)?.segments ?? [];
    expect(s.map((x) => [x.from, x.to, x.band, x.value])).toEqual([
      [0, 0.2, "high", false],
      [0.2, 0.3, "medium", false],
      [0.3, 0.65, "low", null],
      [0.65, 0.75, "medium", true],
      [0.75, 1, "high", true],
    ]);
  });

  it("uses a choice option's stricter bars when the spec has them", () => {
    expect(policySegments(choice, "allow")?.segments.map((x) => x.from)).toEqual([0, 0.4, 0.7]);
    expect(policySegments(choice, "block")?.segments.map((x) => x.from)).toEqual([0, 0.6, 0.9]);
  });

  it("keeps a degenerate policy to one segment and skips composites", () => {
    expect(segmentsFrom([0, 0], () => ({ band: "high" }))).toEqual([{ from: 0, to: 1, band: "high" }]);
    expect(policySegments({ type: "composite", gating: true, levelThresholds: { high: 0.7, medium: 0.4 }, actions } as never)).toBeNull();
  });
});

describe("run rulers", () => {
  const answers = { risky: { type: "noul", noul: 0.5 }, other: { type: "noul", noul: 0.9 }, kind: { type: "choice", confidence: 0.65 } };
  const decisions: [string, DecisionLike][] = [
    ["risky", d("low", null)],
    ["other", d("high", true)],
    ["kind", d("medium", "block")],
    ["combo", d("medium", 0.4)],
    ["skipped", d("high", null, false)],
  ];

  it("groups decisions that share lines, puts the run band's ruler first and marks what set it", () => {
    const r = runRulers(spec, decisions, answers, "low");
    expect(r.groups).toHaveLength(2);
    expect(r.groups[0]?.axis).toBe("P(yes)");
    expect(r.groups[0]?.markers.map((m) => [m.id, m.at, m.heavy])).toEqual([
      ["risky", 0.5, true],
      ["other", 0.9, false],
    ]);
    expect(r.groups[1]?.segments.map((s) => s.from)).toEqual([0, 0.6, 0.9]);
    expect(r.unplaced.map((u) => u.id)).toEqual(["combo", "skipped"]);
  });

  it("picks the weakest decision for a list row, and one decision for the review pane", () => {
    expect(decidingMarker(runRulers(spec, decisions, answers, "low"))?.marker.id).toBe("risky");
    expect(decidingMarker({ groups: [], unplaced: [] })).toBeNull();
    const one = decisionRuler(spec, decisions, answers, "kind");
    expect(one?.markers).toEqual([{ id: "kind", at: 0.65, band: "medium", heavy: true }]);
    expect(decisionRuler(spec, decisions, answers, "missing")).toBeNull();
  });

  it("leaves out a decision with no stored score", () => {
    const r = runRulers(spec, [["risky", d("low", null)]], {}, "low");
    expect(r.groups).toHaveLength(0);
    expect(r.unplaced[0]?.why).toContain("no score");
  });
});

describe("ruler labels", () => {
  it("skips threshold numbers that would crowd a neighbor or an end", () => {
    const segs = segmentsFrom([0.02, 0.4, 0.45, 0.7], (x) => ({ band: x < 0.4 ? "low" : x < 0.7 ? "medium" : "high", value: x < 0.45 ? null : true }));
    expect(visibleCuts(segs)).toEqual([0.4, 0.7]);
  });
});

describe("paired bars", () => {
  it("draws spend and the LLM estimate side by side on one scale", () => {
    const [p] = layoutPairs([{ day: "a", spend: 1, llm: 4 }], 4, 100, 40, 4, 1);
    expect(p?.spend.height).toBe(10);
    expect(p?.llm.height).toBe(40);
    expect(p?.llm.x).toBeCloseTo((p?.spend.x ?? 0) + (p?.spend.width ?? 0) + 1);
    expect(layoutPairs([], 1, 100, 40)).toEqual([]);
  });
});
