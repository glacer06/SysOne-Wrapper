// Small formatters the set pages share. Pure, so they are tested without a browser.

const DAY = 86_400;
const STEPS: Array<[below: number, size: number, unit: string]> = [
  [3600, 60, "minute"],
  [DAY, 3600, "hour"],
  [30 * DAY, DAY, "day"],
  [365 * DAY, 30 * DAY, "month"],
  [Infinity, 365 * DAY, "year"],
];

/** "just now", "5 minutes ago", "3 days ago". A future date reads as just now. */
export function timeAgo(iso: string, now: Date = new Date()): string {
  const s = (now.getTime() - new Date(iso).getTime()) / 1000;
  if (!Number.isFinite(s) || s < 60) return "just now";
  for (const [below, size, unit] of STEPS) {
    if (s < below) {
      const n = Math.floor(s / size);
      return `${n} ${unit}${n === 1 ? "" : "s"} ago`;
    }
  }
  return "long ago";
}

/** Dollars, with enough places to show a fraction of a cent. Null reads as n/a (no price known). */
export function money(dollars: number | null): string {
  if (dollars === null) return "n/a";
  return dollars !== 0 && Math.abs(dollars) < 0.01 ? `$${dollars.toFixed(5)}` : `$${dollars.toFixed(2)}`;
}
