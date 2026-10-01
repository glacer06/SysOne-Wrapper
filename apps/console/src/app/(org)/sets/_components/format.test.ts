import { describe, expect, it } from "vitest";

import { money, timeAgo } from "./format";

const NOW = new Date("2026-10-01T07:00:00Z");
const ago = (seconds: number) => new Date(NOW.getTime() - seconds * 1000).toISOString();

describe("timeAgo", () => {
  it("reads in the largest whole unit", () => {
    expect(timeAgo(ago(10), NOW)).toBe("just now");
    expect(timeAgo(ago(60), NOW)).toBe("1 minute ago");
    expect(timeAgo(ago(5 * 60 + 30), NOW)).toBe("5 minutes ago");
    expect(timeAgo(ago(3 * 3600), NOW)).toBe("3 hours ago");
    expect(timeAgo(ago(86_400), NOW)).toBe("1 day ago");
    expect(timeAgo(ago(400 * 86_400), NOW)).toBe("1 year ago");
  });

  it("reads a future or broken date as just now", () => {
    expect(timeAgo(ago(-600), NOW)).toBe("just now");
    expect(timeAgo("not a date", NOW)).toBe("just now");
  });
});

describe("money", () => {
  it("keeps fractions of a cent visible", () => {
    expect(money(0.000123)).toBe("$0.00012");
    expect(money(1.5)).toBe("$1.50");
    expect(money(0)).toBe("$0.00");
    expect(money(null)).toBe("n/a");
  });
});
