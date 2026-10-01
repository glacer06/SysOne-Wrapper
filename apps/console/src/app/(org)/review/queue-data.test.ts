import type { QuestionSetSpec } from "@bandwise/core";
import { describe, expect, it } from "vitest";

import type { ReviewItemView, RunDetail } from "~/server/operations/views";

import { pairDays, uncounted } from "../savings/savings-view";
import { queueEntry, STATE_LIMIT } from "./queue-data";

const item = {
  id: "0199a1b2-0000-7000-8000-00000000000c",
  runId: "0199a1b2-0000-7000-8000-00000000000b",
  setId: "0199a1b2-0000-7000-8000-00000000000a",
  decisionId: "kind",
  kind: "action",
  reason: "near_threshold",
  sampleRate: null,
  band: "medium",
  suggested: { value: "allow" },
  status: "open",
  assigneeId: null,
  resolution: null,
  resolvedBy: { userId: null, tokenId: null },
  resolvedAt: null,
  addToDataset: false,
  createdAt: "2026-10-01T06:00:00Z",
} as ReviewItemView;

const run = {
  systemOneCostMicroUsd: 20,
  savingsMicroUsd: 4000,
  answers: { kind: { type: "choice", choice: "allow", confidence: 0.55, probabilities: { allow: 0.55, block: 0.45 } } },
  decisions: { kind: { kind: "question", value: "allow", band: "medium", relevant: true, action: "review", effectiveAction: "review", executed: true } },
  state: { command: "x".repeat(STATE_LIMIT) },
} as unknown as RunDetail;

const spec = { policies: { kind: { type: "choice", gating: true, thresholds: { high: 0.7, medium: 0.4 }, actions: {} } } } as unknown as QuestionSetSpec;

describe("queue entries", () => {
  it("carries the score, the ruler, numbered choices and a cut state", () => {
    const e = queueEntry(item, run, spec, "action-risk-gate", new Date("2026-10-01T07:00:00Z"));
    expect(e.score).toBe(0.55);
    expect(e.ruler?.markers[0]).toMatchObject({ id: "kind", at: 0.55, heavy: true });
    expect(e.choices?.map((c) => c.json)).toEqual(['"allow"', '"block"']);
    expect(e.suggestedJson).toBe('"allow"');
    expect(e.reason).toBe("Close to a threshold");
    expect(e.cost).toBe("$0.00002 for the run, saved $0.004");
    expect(e.stateCut).toBe(true);
    expect(e.state?.length).toBe(STATE_LIMIT);
    expect(e.settled).toBeNull();
  });

  it("still lists an item whose run cannot be read, and says what was settled", () => {
    const e = queueEntry({ ...item, status: "resolved", resolution: { value: "block" }, resolvedAt: "2026-10-01T06:30:00Z" }, null, null, "set", new Date());
    expect(e.runLoaded).toBe(false);
    expect(e.ruler).toBeNull();
    expect(e.suggestedLabel).toBe("allow");
    expect(e.settled).toBe("Resolved as block on 2026-10-01 06:30 UTC.");
  });
});

describe("savings numbers", () => {
  it("pairs spend and the LLM estimate for every day, and finds the uncounted part of the gap", () => {
    const usage = {
      from: "2026-09-29T12:00:00Z",
      to: "2026-10-01T12:00:00Z",
      days: [{ day: "2026-09-30", runs: 2, errors: 0, systemOneCostMicroUsd: 10, counterfactualMicroUsd: 500, savingsMicroUsd: 490, llmCallsAvoided: 2 }],
    } as never;
    expect(pairDays(usage)).toEqual([
      { day: "2026-09-29", spend: 0, llm: 0 },
      { day: "2026-09-30", spend: 10, llm: 500 },
      { day: "2026-10-01", spend: 0, llm: 0 },
    ]);
    const totals = { systemOneCostMicroUsd: 10, counterfactualMicroUsd: 500, savingsMicroUsd: 300 } as never;
    expect(uncounted(totals)).toBe(190);
    expect(uncounted({ systemOneCostMicroUsd: 10, counterfactualMicroUsd: 500, savingsMicroUsd: 490 } as never)).toBe(0);
  });
});
