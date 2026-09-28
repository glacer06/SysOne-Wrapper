import {
  DEFAULT_EST_OUTPUT_TOKENS_PER_QUESTION,
  SEED_COMPARATOR_PRICES,
  SEED_SYSTEM_ONE_PRICES,
  callCostMicro,
  counterfactualMicro,
} from "@bandwise/core";
import { describe, expect, it } from "vitest";
import { calculatorSetup, comparators, computeBill, defaultComparatorId, maxInputTokens, systemOneModel } from "~/lib/bill";
import { formatUsd } from "~/lib/format";

const haiku = SEED_COMPARATOR_PRICES.find((p) => p.model === "claude-haiku-4-5");
const jev = SEED_SYSTEM_ONE_PRICES.find((p) => p.model === "jev-1.13.0");

describe("savings calculator math (ADR-015 bill)", () => {
  it("reads prices from the core price book, not from the site", () => {
    expect(systemOneModel.price).toBe(jev);
    expect(comparators.map((c) => c.price)).toEqual([...SEED_COMPARATOR_PRICES]);
    expect(defaultComparatorId).toBe("claude-haiku-4-5");
  });

  it("matches the core formula: decisions x System One cost + escalations x LLM call cost", () => {
    const input = { decisionsPerDay: 20_000, inputTokensPerDecision: 1_500, escalationRate: 0.1, comparatorId: "claude-haiku-4-5" };
    const bill = computeBill(input);
    const s1 = callCostMicro({ inputTokens: 1_500, outputTokens: 0, reportedMicro: null }, jev ?? null) ?? 0;
    const llm = counterfactualMicro(1_500, DEFAULT_EST_OUTPUT_TOKENS_PER_QUESTION, haiku ?? null);
    expect(bill.systemOnePerDecisionMicro).toBe(s1);
    expect(bill.llmPerCallMicro).toBe(llm);
    expect(bill.escalationsPerDay).toBe(2_000);
    expect(bill.daily.systemOneMicro).toBe(20_000 * s1);
    expect(bill.daily.escalationMicro).toBe(2_000 * llm);
    expect(bill.daily.totalMicro).toBe(20_000 * s1 + 2_000 * llm);
    expect(bill.daily.allLlmMicro).toBe(20_000 * llm);
    expect(bill.monthly.totalMicro).toBe(bill.daily.totalMicro * 30);
  });

  it("works through the seeded prices by hand", () => {
    // jev-1.13.0: 1,500 x 42,000 / 1e6 = 63 micro-USD. Haiku 4.5: (1,500 x 1,000,000 + 60 x 5,000,000) / 1e6 = 1,800.
    const bill = computeBill({ decisionsPerDay: 20_000, inputTokensPerDecision: 1_500, escalationRate: 0.1, comparatorId: "claude-haiku-4-5" });
    expect(bill.systemOnePerDecisionMicro).toBe(63);
    expect(bill.llmPerCallMicro).toBe(1_800);
    expect(formatUsd(bill.daily.systemOneMicro)).toBe("$1.26");
    expect(formatUsd(bill.daily.escalationMicro)).toBe("$3.60");
    expect(formatUsd(bill.daily.allLlmMicro)).toBe("$36.00");
  });

  it("clamps inputs: no negative work, no state past the model's limit, rate within 0 to 1", () => {
    const over = computeBill({ decisionsPerDay: 10, inputTokensPerDecision: maxInputTokens * 3, escalationRate: 4, comparatorId: "nope" });
    const atLimit = computeBill({ decisionsPerDay: 10, inputTokensPerDecision: maxInputTokens, escalationRate: 1, comparatorId: "claude-haiku-4-5" });
    expect(over).toEqual(atLimit);
    const none = computeBill({ decisionsPerDay: -5, inputTokensPerDecision: Number.NaN, escalationRate: -1, comparatorId: "claude-haiku-4-5" });
    expect(none.daily.totalMicro).toBe(0);
    expect(none.daily.allLlmMicro).toBe(0);
  });

  it("hands the page a plain setup whose first render matches the live math", () => {
    const setup = calculatorSetup();
    expect(setup.initial).toEqual(computeBill(setup.defaults));
    expect(JSON.parse(JSON.stringify(setup))).toEqual(setup);
  });

  it("formats small amounts with enough digits to read", () => {
    expect(formatUsd(0)).toBe("$0");
    expect(formatUsd(42_000)).toBe("$0.042");
    expect(formatUsd(1_000_000)).toBe("$1.00");
  });
});
