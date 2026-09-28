// The savings calculator's math: the ADR-015 daily bill, built from core's cost functions and the
// price book rows in core's model registry seed. Nothing here holds a price of its own.
//
//   daily bill = decisions x System One cost per decision + escalations x cost per LLM call
//
// Every decision runs on System One first; an escalated decision also pays for one LLM call.
// The all-LLM line sends every decision to the comparator instead.
//
// The page renders the default result on the server. The calculator loads this module in the
// browser as its own chunk after the page is interactive, so core never weighs on first load.

import {
  DEFAULT_EST_OUTPUT_TOKENS_PER_QUESTION,
  SEED_COMPARATOR_PRICES,
  SEED_DEFAULT_COMPARATOR_MODEL,
  SEED_MODEL_PROFILES,
  SEED_PLATFORM_DEFAULT_MODEL,
  SEED_SYSTEM_ONE_PRICES,
  callCostMicro,
  counterfactualMicro,
  type ModelPrice,
} from "@bandwise/core";
import { DAYS_PER_MONTH } from "./format";

/** Display names for comparator ids. An id without one shows as itself. */
const COMPARATOR_LABELS: Record<string, string> = {
  "claude-haiku-4-5": "Claude Haiku 4.5",
  "claude-fable-5-1": "Claude Fable 5.1",
};

export interface PricedModel {
  id: string;
  label: string;
  price: ModelPrice;
}

export const systemOneModel: PricedModel = (() => {
  const row = SEED_SYSTEM_ONE_PRICES.find((p) => p.model === SEED_PLATFORM_DEFAULT_MODEL);
  if (row === undefined) throw new Error(`No price book row for ${SEED_PLATFORM_DEFAULT_MODEL}`);
  return { id: row.model, label: row.model, price: row };
})();

export const comparators: readonly PricedModel[] = SEED_COMPARATOR_PRICES.map((row) => ({
  id: row.model,
  label: COMPARATOR_LABELS[row.model] ?? row.model,
  price: row,
}));

export const defaultComparatorId = SEED_DEFAULT_COMPARATOR_MODEL;

/** The most state plus question tokens one System One call takes, from the registry profile. */
export const maxInputTokens: number =
  SEED_MODEL_PROFILES.find((p) => p.id === SEED_PLATFORM_DEFAULT_MODEL)?.limits?.statePlusLongestQuestionTokens ?? 32_000;

export const outputTokensPerLlmCall = DEFAULT_EST_OUTPUT_TOKENS_PER_QUESTION;

export interface BillInput {
  decisionsPerDay: number;
  inputTokensPerDecision: number;
  /** Share of decisions sent to the LLM, 0 to 1. */
  escalationRate: number;
  comparatorId: string;
}

interface Lanes {
  systemOneMicro: number;
  escalationMicro: number;
  totalMicro: number;
  allLlmMicro: number;
}

/** Money in integer micro-USD, like the savings ledger. */
export interface Bill {
  escalationsPerDay: number;
  systemOnePerDecisionMicro: number;
  llmPerCallMicro: number;
  daily: Lanes;
  monthly: Lanes;
}

const clamp = (n: number, lo: number, hi: number) => (Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : lo);

const fallbackComparator: PricedModel = (() => {
  const row = comparators.find((c) => c.id === defaultComparatorId) ?? comparators[0];
  if (row === undefined) throw new Error("The price book has no comparator rows");
  return row;
})();

export function comparatorById(id: string): PricedModel {
  return comparators.find((c) => c.id === id) ?? fallbackComparator;
}

export function computeBill(input: BillInput): Bill {
  const decisions = Math.round(clamp(input.decisionsPerDay, 0, 1e9));
  const tokens = Math.round(clamp(input.inputTokensPerDecision, 0, maxInputTokens));
  const rate = clamp(input.escalationRate, 0, 1);
  const comparator = comparatorById(input.comparatorId);

  // One System One call per decision, priced from the price book.
  const systemOnePerDecisionMicro =
    callCostMicro({ inputTokens: tokens, outputTokens: 0, reportedMicro: null }, systemOneModel.price) ?? 0;
  // One comparator call on the same state, with the default output estimate from the savings math.
  const llmPerCallMicro = counterfactualMicro(tokens, outputTokensPerLlmCall, comparator.price);

  const escalationsPerDay = Math.round(decisions * rate);
  const systemOneMicro = decisions * systemOnePerDecisionMicro;
  const escalationMicro = escalationsPerDay * llmPerCallMicro;
  const allLlmMicro = decisions * llmPerCallMicro;
  const daily = { systemOneMicro, escalationMicro, totalMicro: systemOneMicro + escalationMicro, allLlmMicro };
  const monthly = {
    systemOneMicro: systemOneMicro * DAYS_PER_MONTH,
    escalationMicro: escalationMicro * DAYS_PER_MONTH,
    totalMicro: daily.totalMicro * DAYS_PER_MONTH,
    allLlmMicro: allLlmMicro * DAYS_PER_MONTH,
  };
  return { escalationsPerDay, systemOnePerDecisionMicro, llmPerCallMicro, daily, monthly };
}

/** Plain data the calculator needs before core loads in the browser. */
export interface CalculatorSetup {
  systemOne: PricedModel;
  comparators: readonly PricedModel[];
  defaultComparatorId: string;
  maxInputTokens: number;
  outputTokensPerLlmCall: number;
  defaults: BillInput;
  initial: Bill;
}

export const calculatorDefaults: BillInput = {
  decisionsPerDay: 20_000,
  inputTokensPerDecision: 1_500,
  escalationRate: 0.1,
  comparatorId: defaultComparatorId,
};

export function calculatorSetup(): CalculatorSetup {
  return {
    systemOne: systemOneModel,
    comparators,
    defaultComparatorId,
    maxInputTokens,
    outputTokensPerLlmCall,
    defaults: calculatorDefaults,
    initial: computeBill(calculatorDefaults),
  };
}
