import { noulBand, thresholdBand } from "@bandwise/core";
import { describe, expect, it } from "vitest";

import { collectScores, scoresFor } from "./recent-scores";
import {
  bandRange,
  bandRows,
  formatDelta,
  formatShare,
  histogram,
  keyStep,
  moveHandle,
  nearestHandle,
  parseTyped,
  round2,
  valueAtPointer,
} from "./ruler-math";
import { noulSegments, thresholdSegments } from "./spec-edit";

// Thresholds in these tests are arbitrary on purpose. The ruler reads them from the draft.
const draft = { high: 0.7, medium: 0.35 };
const bandOf = (x: number) => thresholdBand(x, draft);

describe("handle positions", () => {
  it("maps a pointer to the track and clamps outside it", () => {
    expect(valueAtPointer(150, 100, 200)).toBe(0.25);
    expect(valueAtPointer(50, 100, 200)).toBe(0);
    expect(valueAtPointer(400, 100, 200)).toBe(1);
    expect(valueAtPointer(150, 100, 0)).toBe(0);
  });

  it("rounds to two decimals without float noise", () => {
    expect(round2(0.1 + 0.2)).toBe(0.3);
    expect(valueAtPointer(100 + 200 / 3, 100, 200)).toBe(0.33);
  });

  it("keeps the lower handle at or below the upper one", () => {
    expect(moveHandle({ lower: 0.3, upper: 0.6 }, "lower", 0.8)).toEqual({ lower: 0.6, upper: 0.6 });
    expect(moveHandle({ lower: 0.3, upper: 0.6 }, "upper", 0.1)).toEqual({ lower: 0.3, upper: 0.3 });
    expect(moveHandle({ lower: 0.3, upper: 0.6 }, "lower", 0.45)).toEqual({ lower: 0.45, upper: 0.6 });
  });

  it("keeps a gap when one is asked for, as the noul bars need", () => {
    expect(moveHandle({ lower: 0.2, upper: 0.8 }, "lower", 0.9, 0.01)).toEqual({ lower: 0.79, upper: 0.8 });
    expect(moveHandle({ lower: 0.2, upper: 0.8 }, "upper", 0, 0.01)).toEqual({ lower: 0.2, upper: 0.21 });
  });

  it("clamps a move to the scale", () => {
    expect(moveHandle({ lower: 0.2, upper: 0.8 }, "upper", 1.4)).toEqual({ lower: 0.2, upper: 1 });
    expect(moveHandle({ lower: 0.2, upper: 0.8 }, "lower", -1)).toEqual({ lower: 0, upper: 0.8 });
  });

  it("moves the nearer handle on a track click, and the one on the click's side on a tie", () => {
    expect(nearestHandle({ lower: 0.3, upper: 0.6 }, 0.35)).toBe("lower");
    expect(nearestHandle({ lower: 0.3, upper: 0.6 }, 0.58)).toBe("upper");
    expect(nearestHandle({ lower: 0.5, upper: 0.5 }, 0.2)).toBe("lower");
    expect(nearestHandle({ lower: 0.5, upper: 0.5 }, 0.8)).toBe("upper");
  });
});

describe("keyboard steps", () => {
  it("steps a hundredth with the arrows and a tenth with Shift or Page keys", () => {
    expect(keyStep(0.5, "ArrowRight")).toBe(0.51);
    expect(keyStep(0.5, "ArrowUp")).toBe(0.51);
    expect(keyStep(0.5, "ArrowLeft")).toBe(0.49);
    expect(keyStep(0.5, "ArrowDown", true)).toBe(0.4);
    expect(keyStep(0.5, "PageUp")).toBe(0.6);
    expect(keyStep(0.5, "PageDown")).toBe(0.4);
  });

  it("goes to the ends with Home and End and never leaves the scale", () => {
    expect(keyStep(0.42, "Home")).toBe(0);
    expect(keyStep(0.42, "End")).toBe(1);
    expect(keyStep(0.995, "ArrowUp")).toBe(1);
    expect(keyStep(0, "ArrowLeft")).toBe(0);
  });

  it("ignores other keys", () => {
    expect(keyStep(0.5, "a")).toBeNull();
    expect(keyStep(0.5, "Tab")).toBeNull();
  });
});

describe("typed values", () => {
  it("reads decimals with or without the leading zero, and percents", () => {
    expect(parseTyped("0.4")).toBe(0.4);
    expect(parseTyped(" .65 ")).toBe(0.65);
    expect(parseTyped("1")).toBe(1);
    expect(parseTyped("65%")).toBe(0.65);
    expect(parseTyped("0.333")).toBe(0.33);
  });

  it("refuses anything off the scale or not a number", () => {
    for (const bad of ["", "1.2", "-0.1", "abc", "0.4.1", "120%", "1e-1"]) expect(parseTyped(bad)).toBeNull();
  });
});

describe("histogram and band rows", () => {
  const scores = [0.05, 0.2, 0.4, 0.5, 0.69, 0.7, 0.9, 1];

  it("bins scores and colors each by the draft's band", () => {
    const bins = histogram(scores, bandOf, 10);
    expect(bins).toHaveLength(10);
    expect(bins.reduce((n, b) => n + b.total, 0)).toBe(scores.length);
    // 0.9 and 1 both land in the last bin: 1 does not fall off the end.
    expect(bins[9]?.counts.high).toBe(2);
    // A bin across the medium cut at 0.35 splits its scores by band.
    expect(histogram([0.31, 0.38], bandOf, 10)[3]?.counts).toEqual({ high: 0, medium: 1, low: 1 });
  });

  it("skips values off the scale", () => {
    expect(histogram([-0.1, 1.5, Number.NaN], bandOf, 5).every((b) => b.total === 0)).toBe(true);
  });

  it("counts each band with its share and the change from the published bands", () => {
    const published = (x: number) => thresholdBand(x, { high: 0.8, medium: 0.5 });
    const rows = bandRows(scores, bandOf, published);
    expect(rows.map((r) => r.band)).toEqual(["high", "medium", "low"]);
    expect(rows.map((r) => r.count)).toEqual([3, 3, 2]);
    expect(rows[0]?.share).toBeCloseTo(3 / 8);
    // Published: high 0.9 and 1 (2), medium 0.5, 0.69, 0.7 (3), low 0.05, 0.2, 0.4 (3).
    expect(rows.map((r) => r.delta)).toEqual([1, 0, -1]);
  });

  it("has no change column without a published version, and zero shares without scores", () => {
    expect(bandRows(scores, bandOf, null).every((r) => r.delta === null)).toBe(true);
    expect(bandRows([], bandOf, null).every((r) => r.share === 0 && r.count === 0)).toBe(true);
  });

  it("formats deltas with a true minus sign and shares as whole percents", () => {
    expect(formatDelta(6)).toBe("+6");
    expect(formatDelta(-9)).toBe("−9");
    expect(formatDelta(0)).toBe("0");
    expect(formatShare(0.52)).toBe("52%");
    expect(formatShare(0.004)).toBe("<1%");
    expect(formatShare(0)).toBe("0%");
  });

  it("names where each band sits, from the draft's own segments", () => {
    const segs = thresholdSegments(draft);
    expect(bandRange(segs, "high")).toBe("0.70 to 1");
    expect(bandRange(segs, "medium")).toBe("0.35 to 0.70");
    expect(bandRange(segs, "low")).toBe("0 to 0.35");
    const noul = { trueAt: 0.8, falseAt: 0.2, reviewMargin: 0.1 };
    expect(bandRange(noulSegments(noul), "high")).toBe("0 to 0.20 and 0.80 to 1");
    expect(noulBand(0.85, noul).band).toBe("high");
  });
});

describe("recent scores from run answers", () => {
  const questions = [
    { id: "done", question: { type: "noul" } },
    { id: "tier", question: { type: "choice" } },
    { id: "risk", question: { type: "score" } },
  ] as unknown as Parameters<typeof collectScores>[1];

  it("takes the noul for yes or no questions and the confidence for the rest", () => {
    const out = collectScores(
      [
        { done: { type: "noul", noul: 0.82 }, tier: { type: "choice", choice: "large", confidence: 0.64 }, risk: { type: "score", score: 3, confidence: 0.4 } },
        { done: { type: "noul", noul: 0.1 } },
      ],
      questions,
    );
    expect(out.done).toEqual([{ score: 0.82 }, { score: 0.1 }]);
    expect(out.tier).toEqual([{ score: 0.64, option: "large" }]);
    expect(out.risk).toEqual([{ score: 0.4 }]);
  });

  it("skips malformed answers and answers whose type changed since the run", () => {
    const out = collectScores([null, "x", { done: { type: "choice", confidence: 0.9 } }, { done: { type: "noul", noul: 2 } }, { tier: { type: "choice", confidence: "high" } }], questions);
    expect(out).toEqual({ done: [], tier: [], risk: [] });
  });

  it("splits a choice's scores between the shared bar and the options with their own bar", () => {
    const entries = [
      { score: 0.9, option: "small" },
      { score: 0.6, option: "large" },
      { score: 0.5 },
    ];
    expect(scoresFor(entries, null, ["large"])).toEqual([0.9, 0.5]);
    expect(scoresFor(entries, "large", ["large"])).toEqual([0.6]);
  });
});
