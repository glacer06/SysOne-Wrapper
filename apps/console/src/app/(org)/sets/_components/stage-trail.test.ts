import { describe, expect, it } from "vitest";

import { nextMove, otherStages, widensActing } from "../[ref]/releases/stages";
import { chipCounts, healthOf, matches, parseFilter, type SetRow, stateLine } from "./sets-summary";
import { trailRank, trailStops } from "./stage-trail";

describe("the rollout trail", () => {
  it("fills the stops behind the stage and makes the stage the one current node", () => {
    expect(trailStops("controlled").map((s) => s.state)).toEqual(["passed", "passed", "current", "ahead"]);
    expect(trailStops("inactive").map((s) => s.state)).toEqual(["current", "ahead", "ahead", "ahead"]);
    expect(trailStops("full").map((s) => s.state)).toEqual(["passed", "passed", "passed", "current"]);
  });

  it("has exactly one current node on a live channel, and none when paused or unpublished", () => {
    for (const stage of ["inactive", "shadow", "controlled", "full"] as const) {
      expect(trailStops(stage).filter((s) => s.state === "current")).toHaveLength(1);
    }
    expect(trailStops("paused").every((s) => s.state === "ahead")).toBe(true);
    expect(trailStops(null).every((s) => s.state === "ahead")).toBe(true);
  });

  it("keeps paused off the trail", () => {
    expect(trailStops("shadow").map((s) => s.stage)).toEqual(["inactive", "shadow", "controlled", "full"]);
    expect(trailRank("paused")).toBe(-1);
    expect(trailRank("full")).toBe(3);
  });
});

describe("the next move", () => {
  it("is the next stop, or back to shadow from a pause, and nothing at full", () => {
    expect(nextMove("inactive")?.to).toBe("shadow");
    expect(nextMove("shadow")?.to).toBe("controlled");
    expect(nextMove("controlled")?.to).toBe("full");
    expect(nextMove("paused")?.to).toBe("shadow");
    expect(nextMove("full")).toBeNull();
  });

  it("writes the gate: no approval for shadow, a pinned model and an agent approval for acting stages", () => {
    expect(nextMove("inactive")?.gate).toMatch(/No approval needed/);
    expect(nextMove("shadow")?.gate).toMatch(/pinned model/);
    expect(nextMove("controlled")?.gate).toMatch(/admin role/);
    for (const stage of ["shadow", "controlled"] as const) {
      const move = nextMove(stage);
      expect(move === null ? false : widensActing(stage, move.to)).toBe(true);
      expect(move?.gate).toMatch(/approve/);
    }
  });

  it("offers every other stage but paused and the next move", () => {
    expect(otherStages("shadow")).toEqual(["inactive", "full"]);
    expect(otherStages("full")).toEqual(["inactive", "shadow", "controlled"]);
    expect(otherStages("paused")).toEqual(["inactive", "controlled", "full"]);
  });
});

function row(over: Partial<SetRow>): SetRow {
  return {
    slug: "s",
    name: "S",
    production: { version: 1, stage: "shadow" },
    staging: null,
    draft: null,
    openReviews: 0,
    spend24hMicroUsd: 0,
    runs24h: 0,
    lastRun: null,
    ...over,
  };
}

describe("the sets state line and chips", () => {
  const now = new Date("2026-10-01T12:00:00Z");

  it("leads with the count, what needs review and the last run", () => {
    const rows = [row({ slug: "a", openReviews: 2, lastRun: { at: "2026-10-01T11:57:00Z", band: "high" } }), row({ slug: "b" }), row({ slug: "c" }), row({ slug: "d" })];
    expect(stateLine(rows, now)).toBe("4 sets. 1 needs review. Last run 3 min ago.");
  });

  it("says when nothing needs review or nothing has run", () => {
    expect(stateLine([row({})], now)).toBe("1 set. None need review. No runs yet.");
  });

  it("puts a paused production channel ahead of review counts", () => {
    const paused = row({ production: { version: 2, stage: "paused" }, openReviews: 3 });
    expect(healthOf(paused)).toBe("paused");
    expect(stateLine([paused, row({ openReviews: 1 }), row({ openReviews: 1 })], now)).toBe("3 sets. 1 paused. 2 need review. No runs yet.");
  });

  it("counts chips and filters on them, with paused sets under needs review", () => {
    const rows = [row({ openReviews: 1 }), row({ production: { version: 1, stage: "paused" } }), row({}), row({ production: null })];
    expect(chipCounts(rows)).toEqual({ all: 4, review: 2, clear: 2 });
    expect(rows.filter((r) => matches(r, "clear"))).toHaveLength(2);
    expect(parseFilter("review")).toBe("review");
    expect(parseFilter(["review"])).toBe("all");
    expect(parseFilter("nope")).toBe("all");
  });
});
