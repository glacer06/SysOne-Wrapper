// End to end: the run engine escalates through this package's transports on fixtures only.

import {
  type QuestionSetSpec,
  type RunPorts,
  RunResult,
  SEED_COMPARATOR_PRICES,
  SEED_MODEL_PROFILES,
  SEED_MODEL_ROUTES,
  SEED_SYSTEM_ONE_PRICES,
  type SystemOneTransport,
  TransportError,
  allowAllLimiter,
  allowAllQuota,
  createMemoryActionRegistry,
  createMemoryModelCatalog,
  createMemoryPriceBook,
  createMemoryRunSink,
  runQuestionSet,
  sequentialIds,
  staticKeyResolver,
  steppingClock,
} from "@sysone/core";
import { describe, expect, it } from "vitest";
import { FixtureLlmTransport } from "./fixture/fixture-transport.js";
import { loadBundledLlmFixtures } from "./fixture/load.js";
import { RoutedLlmTransport } from "./routed-transport.js";

const fixtures = loadBundledLlmFixtures();
const signal = new AbortController().signal;
const ctx = {
  orgId: "01890000-0000-7000-8000-00000000000a",
  actor: { type: "user" as const, userId: "01890000-0000-7000-8000-0000000000c1", role: "owner" as const, platformRole: null, impersonatorId: null },
  client: "console" as const,
  plan: "pro",
  requestId: "r",
};
const state = { ticket: "The app crashes every time I open the invoices page." };

function spec(escalationModel: string, onUnavailable?: QuestionSetSpec["onUnavailable"]): QuestionSetSpec {
  const s: QuestionSetSpec = {
    schemaVersion: 1,
    model: "jev-1.13.0",
    input: { schema: { type: "object", properties: { ticket: { type: "string" } } } },
    stages: [
      {
        id: "main",
        questions: {
          team: {
            type: "choice",
            instructions: "Which team should handle `ticket`?",
            criteria: { billing: "Payments", technical: "Bugs", none: null },
            meta: { label: "Team" },
          },
        },
      },
    ],
    policies: {
      team: {
        type: "choice",
        gating: true,
        thresholds: { high: 0.75, medium: 0.45 },
        actions: {
          high: { kind: "auto" },
          medium: { kind: "escalate_to_llm", config: { model: escalationModel, maxOutputTokens: 16 } },
          low: { kind: "escalate_to_llm", config: { model: escalationModel, maxOutputTokens: 16 } },
        },
      },
    },
  };
  if (onUnavailable !== undefined) s.onUnavailable = onUnavailable;
  return s;
}

const down: SystemOneTransport = {
  async call() {
    throw new TransportError({ code: "system_one_unavailable", retryable: true, requestId: null }, "down");
  },
};
const mediumBilling: SystemOneTransport = {
  async call() {
    return {
      response: {
        model: "jev-1.13.0",
        answers: { team: { type: "choice", choice: "billing", confidence: 0.6, probabilities: { billing: 0.6, technical: 0.35, none: 0.05 } } },
        usage: { input_tokens: 90, output_tokens: 4 },
      },
      requestId: "req_1",
    };
  },
};

function ports(systemOne: SystemOneTransport, llm: RunPorts["llm"]): RunPorts {
  const p: RunPorts = {
    systemOne,
    models: createMemoryModelCatalog(SEED_MODEL_PROFILES, SEED_MODEL_ROUTES),
    keys: staticKeyResolver({ typesafe: "ts", openrouter: "or" }),
    limiter: allowAllLimiter,
    quota: allowAllQuota,
    runs: createMemoryRunSink(sequentialIds("00000000-0000-7000-9000-")),
    actions: createMemoryActionRegistry(),
    prices: createMemoryPriceBook([...SEED_SYSTEM_ONE_PRICES, ...SEED_COMPARATOR_PRICES]),
    clock: steppingClock(),
    newId: sequentialIds(),
  };
  if (llm !== undefined) p.llm = llm;
  return p;
}

const resolved = (s: QuestionSetSpec) => ({
  spec: s,
  setId: "01890000-0000-7000-8000-0000000000a1",
  version: 1,
  versionId: "01890000-0000-7000-8000-0000000000b1",
  interfaceMajor: 1,
  interfaceHash: "h",
  channel: "production" as const,
  rollout: "full" as const,
  settings: {
    dispatchActionsOnStaging: false,
    storageMode: "full" as const,
    piiMode: "off" as const,
    defaultComparatorModel: "claude-haiku-4-5",
    avgEscalationCostMicroUsd: null,
    systemOneProvider: "typesafe" as const,
  },
});

const run = (s: QuestionSetSpec, p: RunPorts) =>
  runQuestionSet(ctx, { setRef: "s", state, source: "api", options: {} }, resolved(s), p, { signal, budgetMs: 8_000 });

describe("the engine escalates through llm-client on fixtures", () => {
  it("an outage with onUnavailable escalate_to_llm replays the Anthropic escalation fixture (ADR-012)", async () => {
    const llm = new FixtureLlmTransport(fixtures);
    const result = await run(spec("claude-haiku-4-5", "escalate_to_llm"), ports(down, llm));
    expect(RunResult.parse(result)).toBeTruthy();
    expect(llm.calls.map((c) => c.fixture)).toEqual(["escalation-choice"]);
    expect(result).toMatchObject({ status: "error", error: { code: "system_one_unavailable" }, overallAction: "escalate_to_llm" });
    expect(result.decisions["team"]).toMatchObject({
      value: null,
      band: "low",
      effectiveAction: "escalate_to_llm",
      escalation: { model: "claude-haiku-4-5", value: "technical", status: "ok" },
    });
    expect(result.cost).toMatchObject({ llmCallsMade: 1, savingsSuppressed: "outage", savingsUsd: 0 });
    expect(result.cost.escalationCostUsd).toBeGreaterThan(0);
  });

  it("an LLM error fixture during an outage falls back to review", async () => {
    const llm = new FixtureLlmTransport([]);
    const result = await run(spec("claude-haiku-4-5", "escalate_to_llm"), ports(down, llm));
    expect(result.decisions["team"]).toMatchObject({ effectiveAction: "review", escalation: { status: "failed", error: "llm_unavailable" } });
    expect(result.warnings).toEqual(expect.arrayContaining(["system_one_outage", "escalation_failed"]));
  });

  it("a medium-band escalation to typesafe/jev-router goes through the OpenRouter route only when it is on", async () => {
    const on = new RoutedLlmTransport({ anthropic: new FixtureLlmTransport(fixtures), openrouter: { enabled: true, transport: new FixtureLlmTransport(fixtures) } });
    const ok = await run(spec("typesafe/jev-router"), ports(mediumBilling, on));
    expect(ok.status).toBe("ok");
    expect(ok.decisions["team"]).toMatchObject({ value: "billing", band: "medium", effectiveAction: "escalate_to_llm", escalation: { model: "typesafe/jev-router", value: "technical", status: "ok" } });

    const off = new RoutedLlmTransport({ anthropic: new FixtureLlmTransport(fixtures) });
    const failed = await run(spec("typesafe/jev-router"), ports(mediumBilling, off));
    expect(failed.decisions["team"]).toMatchObject({ effectiveAction: "review", escalation: { status: "failed", error: "llm_unavailable" } });
  });
});
