import { describe, expect, it } from "vitest";

import { fillDays, layoutBars, niceScale } from "./chart";
import { hrefWith, reviewListInput, runListInput } from "./filters";
import { formatLatency, formatShare, formatUsd, formatValue, formatWhen } from "./format";

const NOW = new Date("2026-10-01T12:00:00.000Z");

describe("format", () => {
  it("keeps fractions of a cent readable", () => {
    expect(formatUsd(null)).toBe("Not priced");
    expect(formatUsd(0)).toBe("$0.00");
    expect(formatUsd(42)).toBe("$0.000042");
    expect(formatUsd(1)).toBe("$0.000001");
    expect(formatUsd(1234)).toBe("$0.0012");
    expect(formatUsd(12_345_678)).toBe("$12.35");
    expect(formatUsd(-5_000_000)).toBe("-$5.00");
  });

  it("formats latency, shares, values and times", () => {
    expect(formatLatency(840)).toBe("840 ms");
    expect(formatLatency(1530)).toBe("1.53 s");
    expect(formatShare(1, 3)).toBe("33%");
    expect(formatShare(1, 0)).toBe("-");
    expect(formatValue(true)).toBe("Yes");
    expect(formatValue(null)).toBe("No answer");
    expect(formatValue("urgent")).toBe("urgent");
    expect(formatWhen("2026-10-01T11:58:00.000Z", NOW)).toBe("2 min ago");
    expect(formatWhen("2026-09-28T09:05:00.000Z", NOW)).toBe("2026-09-28 09:05 UTC");
  });
});

describe("filters", () => {
  it("builds run.list input from the URL and drops bad values", () => {
    expect(runListInput({ set: "done-check", band: "low", status: "nope", range: "24h" }, NOW)).toEqual({
      limit: "50",
      set: "done-check",
      band: "low",
      from: "2026-09-30T12:00:00.000Z",
    });
    expect(runListInput({ range: "all", set: "bad slug!" }, NOW)).toEqual({ limit: "50" });
    expect(runListInput({}, NOW)["from"]).toBe("2026-09-24T12:00:00.000Z");
  });

  it("opens the review queue on open items, and shows every status on request", () => {
    expect(reviewListInput({})).toEqual({ limit: "50", status: "open" });
    expect(reviewListInput({ status: "any", kind: "label" })).toEqual({ limit: "50", kind: "label" });
  });

  it("changes one param and drops the cursor", () => {
    expect(hrefWith("/runs", { band: "low", cursor: "x", set: "a" }, { band: undefined, status: "error" })).toBe("/runs?set=a&status=error");
    expect(hrefWith("/runs", {}, {})).toBe("/runs");
  });
});

describe("chart", () => {
  it("fills missing days with zero, inclusive of both ends", () => {
    const days = fillDays(new Date("2026-09-28T15:00:00Z"), new Date("2026-10-01T01:00:00Z"), [{ day: "2026-09-29", value: 5 }]);
    expect(days).toEqual([
      { day: "2026-09-28", value: 0 },
      { day: "2026-09-29", value: 5 },
      { day: "2026-09-30", value: 0 },
      { day: "2026-10-01", value: 0 },
    ]);
  });

  it("picks a round top and ticks from zero", () => {
    expect(niceScale(0)).toEqual({ top: 1, ticks: [0, 1] });
    expect(niceScale(7)).toEqual({ top: 8, ticks: [0, 2, 4, 6, 8] });
    expect(niceScale(0.034)).toEqual({ top: 0.04, ticks: [0, 0.01, 0.02, 0.03, 0.04] });
  });

  it("lays bars on the baseline with a gap", () => {
    const bars = layoutBars([{ day: "a", value: 2 }, { day: "b", value: 0 }], 4, 100, 50);
    expect(bars[0]).toEqual({ day: "a", value: 2, x: 1, y: 25, width: 48, height: 25 });
    expect(bars[1]?.height).toBe(0);
  });
});
