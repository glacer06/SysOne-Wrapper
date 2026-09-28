// Money formatting and calendar constants. No core import, so the page bundle stays small.

export const DAYS_PER_MONTH = 30;

/** Format micro-USD as dollars: cents for amounts of a dollar or more, two significant digits below. */
export function formatUsd(micro: number): string {
  const usd = micro / 1e6;
  if (usd === 0) return "$0";
  if (Math.abs(usd) >= 1) {
    return usd.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  return usd.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumSignificantDigits: 2 });
}
