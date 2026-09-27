import { describe, expect, it } from "vitest";
import { percentile, reliability, wilson } from "./stats.js";

describe("wilson", () => {
  it("returns nulls with no data", () => {
    expect(wilson(0, 0)).toEqual({ value: null, lower95: null, upper95: null });
  });

  it("matches the textbook interval for 95 of 100", () => {
    const w = wilson(95, 100);
    expect(w.value).toBe(0.95);
    expect(w.lower95).toBeCloseTo(0.8882, 3);
    expect(w.upper95).toBeCloseTo(0.9785, 3);
  });

  it("stays inside [0, 1] at the edges", () => {
    expect(wilson(0, 10).lower95).toBe(0);
    expect(wilson(10, 10).upper95).toBeCloseTo(1, 12);
    expect(wilson(10, 10).lower95).toBeCloseTo(0.7225, 3);
  });

  it("the lower bound rises with more evidence at the same rate", () => {
    const small = wilson(19, 20).lower95 ?? 0;
    const large = wilson(190, 200).lower95 ?? 0;
    expect(large).toBeGreaterThan(small);
  });
});

describe("percentile", () => {
  it("uses the nearest rank", () => {
    const xs = [5, 1, 4, 2, 3, 10, 9, 8, 7, 6];
    expect(percentile(xs, 0.5)).toBe(5);
    expect(percentile(xs, 0.95)).toBe(10);
    expect(percentile([], 0.5)).toBeNull();
    expect(percentile([7], 0.95)).toBe(7);
  });
});

describe("reliability", () => {
  it("measures the gap between accuracy and confidence", () => {
    // 7 of 8 right at 0.85 confidence: gap 0.875 - 0.85.
    const points = Array.from({ length: 8 }, (_, i) => ({ confidence: 0.85, correct: i < 7 }));
    const r = reliability(points);
    expect(r.ece).toBeCloseTo(0.025, 6);
    expect(r.table[8]).toMatchObject({ lo: 0.8, hi: 0.9, n: 8, accuracy: 0.875 });
    expect(r.table[8]?.meanConfidence).toBeCloseTo(0.85, 12);
  });

  it("puts confidence 1 in the last bin and weights bins by size", () => {
    const r = reliability([
      { confidence: 1, correct: true },
      { confidence: 0.55, correct: false },
      { confidence: 0.55, correct: true },
    ]);
    expect(r.table[9]?.n).toBe(1);
    expect(r.ece).toBeCloseTo((1 / 3) * 0 + (2 / 3) * Math.abs(0.5 - 0.55), 9);
    expect(reliability([]).ece).toBeNull();
  });
});
