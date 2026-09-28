// The worked example on the landing page: the log-line pager template from the template pack.
// The question, policy and log lines are copied from packages/templates (log-line-pager.ts); the
// site imports only core, so keep them in step by hand. Bands come from core's noul band rule.
// The confidence values are illustrative, not recorded model output, and the page says so.

import { noulBand, type Band } from "@bandwise/core";

export const templateId = "log-line-pager";
export const templateTitle = "Log-line pager";
export const question =
  "Does this log line show a problem that a person on call should look at right now, because users, data, or money are affected or soon will be?";
export const policy = { trueAt: 0.8, falseAt: 0.2, reviewMargin: 0.1 } as const;
/** The template's band actions: high acts on its own, medium and low go to a person. */
const actionByBand: Record<Band, "auto" | "review"> = { high: "auto", medium: "review", low: "review" };

export interface ExampleLine {
  service: string;
  level: string;
  message: string;
  /** Illustrative probability of yes. */
  noul: number;
}

export const lines: readonly ExampleLine[] = [
  { service: "checkout-api", level: "error", message: "charge failed: provider returned 503 for 42 of the last 50 attempts", noul: 0.94 },
  { service: "orders-db", level: "warn", message: "volume /var/lib/postgres at 86 percent capacity", noul: 0.74 },
  { service: "session-cache", level: "warn", message: "redis connection reset, retrying (attempt 1 of 3); reconnected", noul: 0.06 },
];

export interface ExampleDecision extends ExampleLine {
  value: boolean | null;
  band: Band;
  action: "auto" | "review";
  outcome: string;
}

export function decide(line: ExampleLine): ExampleDecision {
  const { value, band } = noulBand(line.noul, policy);
  const action = actionByBand[band];
  const outcome =
    action === "review"
      ? "Queue for a person during working hours"
      : value === true
        ? "Page the person on call"
        : "Log only, nobody is paged";
  return { ...line, value: typeof value === "boolean" ? value : null, band, action, outcome };
}

export const decisions: readonly ExampleDecision[] = lines.map(decide);

/** The five segments of the noul axis under this policy, left to right. */
export function segments(p: { trueAt: number; falseAt: number; reviewMargin: number } = policy) {
  return [
    { from: 0, to: p.falseAt, band: "high" as Band, reads: "no" },
    { from: p.falseAt, to: p.falseAt + p.reviewMargin, band: "medium" as Band, reads: "leaning no" },
    { from: p.falseAt + p.reviewMargin, to: p.trueAt - p.reviewMargin, band: "low" as Band, reads: "unsure" },
    { from: p.trueAt - p.reviewMargin, to: p.trueAt, band: "medium" as Band, reads: "leaning yes" },
    { from: p.trueAt, to: 1, band: "high" as Band, reads: "yes" },
  ];
}
