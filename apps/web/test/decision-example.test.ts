import { describe, expect, it } from "vitest";
import { decisions, policy, segments } from "~/lib/decision-example";

describe("the worked log-line pager example", () => {
  it("uses the template's policy", () => {
    expect(policy).toEqual({ trueAt: 0.8, falseAt: 0.2, reviewMargin: 0.1 });
  });

  it("shows one line per outcome: page, a person, log only", () => {
    expect(decisions.map((d) => [d.band, d.value, d.action])).toEqual([
      ["high", true, "auto"],
      ["medium", true, "review"],
      ["high", false, "auto"],
    ]);
  });

  it("splits the axis into five segments that cover 0 to 1", () => {
    const s = segments();
    expect(s.map((x) => x.band)).toEqual(["high", "medium", "low", "medium", "high"]);
    expect(s[0]?.from).toBe(0);
    expect(s.at(-1)?.to).toBe(1);
    for (let i = 1; i < s.length; i++) expect(s[i]?.from).toBeCloseTo(s[i - 1]?.to ?? -1, 9);
  });
});
