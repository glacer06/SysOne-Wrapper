// The hero's receipt: one decision from the worked log-line pager example, read as the four-part
// answer (state, band, why, cost). The band comes from core's noul rule under the template's
// policy. The cost comes from the price book in core's model registry, for an assumed call size,
// so no price is written here. The confidence is illustrative, and the page says so.

import { callCostMicro, counterfactualMicro } from "@bandwise/core";
import { comparatorById, defaultComparatorId, outputTokensPerLlmCall, systemOneModel } from "./bill";
import { decisions, policy, type ExampleDecision } from "./decision-example";

/** Assumed size of one log-line call: the line, some context and the question. */
export const receiptInputTokens = 400;

export interface Receipt {
  decision: ExampleDecision;
  state: string;
  why: string;
  costMicro: number;
  comparatorLabel: string;
  comparatorMicro: number;
}

function stateFor(d: ExampleDecision): string {
  if (d.band === "high") return d.value === true ? "A real problem. Paging the person on call." : "Nothing to do. Logged only.";
  if (d.band === "medium") return d.value === true ? "Leaning yes. A person should look." : "Leaning no. A person should look.";
  return "We don't know. A person should look.";
}

function whyFor(d: ExampleDecision): string {
  const lower = policy.trueAt - policy.reviewMargin;
  if (d.band === "medium" && d.value === true) {
    return `${d.noul.toFixed(2)} sits between ${lower.toFixed(1)} and ${policy.trueAt}, the review margin under the yes line.`;
  }
  if (d.band === "high") {
    return d.value === true
      ? `${d.noul.toFixed(2)} is at or above the yes line, ${policy.trueAt}.`
      : `${d.noul.toFixed(2)} is at or below the no line, ${policy.falseAt}.`;
  }
  return `${d.noul.toFixed(2)} is outside both lines, so the set does not act on it.`;
}

/** The middle line of the example: the one a person checks. */
export function heroReceipt(): Receipt {
  const decision = decisions.find((d) => d.band === "medium") ?? decisions[0];
  if (decision === undefined) throw new Error("The worked example has no decisions");
  const comparator = comparatorById(defaultComparatorId);
  return {
    decision,
    state: stateFor(decision),
    why: whyFor(decision),
    costMicro:
      callCostMicro({ inputTokens: receiptInputTokens, outputTokens: 0, reportedMicro: null }, systemOneModel.price) ?? 0,
    comparatorLabel: comparator.label,
    comparatorMicro: counterfactualMicro(receiptInputTokens, outputTokensPerLlmCall, comparator.price),
  };
}
