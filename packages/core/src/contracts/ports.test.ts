import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  ActionJob,
  EffectiveModel,
  isTransportError,
  LATENCY_BUDGET_MS,
  latencyBudgetMs,
  RUN_SOURCE_SURFACE,
  TransportError,
  LlmCompletion,
  LlmCompletionRequest,
  ModelPrice,
  QuotaResult,
  RateLimitResult,
  ResolvedKey,
  ResolvedRun,
  RunSinkRecord,
  type LinkedRunPort,
  type LlmTransport,
  type ModelCatalog,
  type PriceBook,
  type RunPorts,
} from "./ports.js";
import { RunResult } from "./run.js";

function readJson(relative: string): unknown {
  return JSON.parse(readFileSync(new URL(relative, import.meta.url), "utf8")) as unknown;
}

const exampleSpec = readJson("../../../../.claude/skills/sysone-builder/templates/question-set.example.json");
const sampleResult = RunResult.parse(readJson("./__fixtures__/run-result.sample.json"));

describe("port payloads", () => {
  it("RateLimitResult is ok, or not ok with a retry and a reason", () => {
    expect(RateLimitResult.safeParse({ ok: true }).success).toBe(true);
    expect(RateLimitResult.safeParse({ ok: false, retryAfterMs: 250, reason: "org" }).success).toBe(true);
    expect(RateLimitResult.safeParse({ ok: false, retryAfterMs: 250 }).success).toBe(false);
    expect(RateLimitResult.safeParse({ ok: false, retryAfterMs: 250, reason: "app" }).success).toBe(false);
    expect(RateLimitResult.safeParse({ ok: true, retryAfterMs: 0 }).success).toBe(false);
  });

  it("QuotaResult carries quota_exceeded or token_budget_exceeded", () => {
    expect(QuotaResult.safeParse({ ok: false, code: "token_budget_exceeded" }).success).toBe(true);
    expect(QuotaResult.safeParse({ ok: false, code: "rate_limited" }).success).toBe(false);
  });

  it("ResolvedKey needs a key and a byo or platform mode", () => {
    expect(ResolvedKey.safeParse({ apiKey: "ts_x", mode: "byo" }).success).toBe(true);
    expect(ResolvedKey.safeParse({ apiKey: "", mode: "byo" }).success).toBe(false);
    expect(ResolvedKey.safeParse({ apiKey: "ts_x", mode: "shared" }).success).toBe(false);
  });

  it("ModelPrice is integer micro-USD per million tokens", () => {
    expect(ModelPrice.safeParse({ inputPerMtokMicroUsd: 42_000, outputPerMtokMicroUsd: 0 }).success).toBe(true);
    expect(ModelPrice.safeParse({ inputPerMtokMicroUsd: 0.042, outputPerMtokMicroUsd: 0 }).success).toBe(false);
    expect(ModelPrice.safeParse({ inputPerMtokMicroUsd: -1, outputPerMtokMicroUsd: 0 }).success).toBe(false);
  });

  it("EffectiveModel allows an unknown model", () => {
    expect(EffectiveModel.safeParse({ profile: null, pinned: false, resolvedId: null }).success).toBe(true);
  });

  it("ActionJob and the LLM payloads are strict", () => {
    const job = { runId: sampleResult.runId, decisionId: "urgency", handlerId: "builtin.slack.notify", config: { channel: "#ops" } };
    expect(ActionJob.safeParse(job).success).toBe(true);
    expect(ActionJob.safeParse({ ...job, extra: 1 }).success).toBe(false);
    const req = { model: "claude-haiku-4-5", system: "s", prompt: "p", maxOutputTokens: 256 };
    expect(LlmCompletionRequest.safeParse(req).success).toBe(true);
    expect(LlmCompletionRequest.safeParse({ ...req, maxOutputTokens: 0 }).success).toBe(false);
    expect(LlmCompletion.safeParse({ text: "billing", model: "claude-haiku-4-5", inputTokens: 90, outputTokens: 4 }).success).toBe(true);
  });

  it("RunSinkRecord holds the result, the request and the stored state", () => {
    const record = {
      result: sampleResult,
      request: { setRef: "email-triage", channel: "production", state: { email: {} }, source: "api", options: { externalRef: "msg_8812" } },
      state: null,
      stateHash: "sha256:ab12",
      stages: [{ id: "triage", skipped: false, inputTokens: 318, outputTokens: 0, latencyMs: 412, typesafeRequestId: "req_01J9Z3QK4T" }],
      keyMode: "byo",
      parentRunId: null,
    };
    expect(RunSinkRecord.safeParse(record).success).toBe(true);
    expect(RunSinkRecord.safeParse({ ...record, stateHash: "" }).success).toBe(false);
    expect(RunSinkRecord.safeParse({ ...record, parentRunId: sampleResult.versionId }).success).toBe(true);
    const { keyMode: _keyMode, ...withoutKeyMode } = record;
    expect(RunSinkRecord.safeParse(withoutKeyMode).success).toBe(false);
  });

  it("RunSinkRecord stage totals must match result.stages", () => {
    const base = {
      result: sampleResult,
      request: { setRef: "email-triage", state: {}, source: "api", options: {} },
      state: null,
      stateHash: "sha256:ab12",
      keyMode: "platform",
      parentRunId: null,
    };
    const row = { id: "triage", skipped: false, inputTokens: 318, outputTokens: 0, latencyMs: 412, typesafeRequestId: null };
    expect(RunSinkRecord.safeParse({ ...base, stages: [row] }).success).toBe(true);
    expect(RunSinkRecord.safeParse({ ...base, stages: [{ ...row, inputTokens: 1 }] }).success).toBe(false);
    expect(RunSinkRecord.safeParse({ ...base, stages: [{ ...row, id: "other" }] }).success).toBe(false);
    expect(RunSinkRecord.safeParse({ ...base, stages: [] }).success).toBe(false);
  });

  const resolved = {
    spec: exampleSpec,
    setId: sampleResult.setId,
    version: sampleResult.version,
    versionId: sampleResult.versionId,
    interfaceMajor: sampleResult.interfaceMajor,
    interfaceHash: sampleResult.interfaceHash,
    channel: "production",
    rollout: "controlled",
    settings: {
      dispatchActionsOnStaging: false,
      storageMode: "full",
      piiMode: "redact_logs",
      defaultComparatorModel: "claude-haiku-4-5",
      avgEscalationCostMicroUsd: null,
    },
  };

  it("ResolvedRun carries what the envelope needs: set, version, interface and settings", () => {
    expect(ResolvedRun.safeParse(resolved).success).toBe(true);
    expect(ResolvedRun.safeParse({ ...resolved, experiment: { id: sampleResult.versionId, arm: "challenger" } }).success).toBe(true);
    expect(ResolvedRun.safeParse({ ...resolved, rollout: "canary" }).success).toBe(false);
    for (const key of ["setId", "version", "interfaceMajor", "interfaceHash", "settings"] as const) {
      const { [key]: _omit, ...rest } = resolved;
      expect(ResolvedRun.safeParse(rest).success, key).toBe(false);
    }
    expect(ResolvedRun.safeParse({ ...resolved, settings: { ...resolved.settings, storageMode: "none" } }).success).toBe(false);
    expect(ResolvedRun.safeParse({ ...resolved, settings: { ...resolved.settings, avgEscalationCostMicroUsd: 0.5 } }).success).toBe(false);
  });
});

describe("transport errors", () => {
  it("narrows a TransportError, including a structurally equal copy", () => {
    const e = new TransportError({ code: "system_one_rate_limited", retryable: true, requestId: "req_1" }, "rate limited");
    expect(isTransportError(e)).toBe(true);
    expect(e.code).toBe("system_one_rate_limited");
    const copy = Object.assign(new Error("x"), { brand: "sysone.transport_error", code: "client_aborted", retryable: false, requestId: null });
    expect(isTransportError(copy)).toBe(true);
  });

  it("rejects other errors and unknown codes", () => {
    expect(isTransportError(new Error("boom"))).toBe(false);
    expect(isTransportError(null)).toBe(false);
    expect(isTransportError({ brand: "sysone.transport_error", code: "teapot", retryable: false, requestId: null })).toBe(false);
  });
});

describe("latency budgets", () => {
  it("matches architecture.md and maps every run source to a surface", () => {
    expect(LATENCY_BUDGET_MS).toEqual({ api: 8_000, embed: 5_000, extension: 3_000, eval: 30_000 });
    expect(Object.keys(RUN_SOURCE_SURFACE).sort()).toEqual(
      ["api", "cli", "console", "embed", "eval", "extension", "mcp", "playground"],
    );
    expect(latencyBudgetMs("embed")).toBe(5_000);
    expect(latencyBudgetMs("mcp")).toBe(8_000);
    expect(latencyBudgetMs("eval")).toBe(30_000);
  });
});

describe("in-memory ports satisfy the interfaces", () => {
  it("wires a RunPorts from fakes", async () => {
    const prices: Record<string, ModelPrice> = {
      "jev-1.13.0": { inputPerMtokMicroUsd: 42_000, outputPerMtokMicroUsd: 0 },
      "claude-haiku-4-5": { inputPerMtokMicroUsd: 1_000_000, outputPerMtokMicroUsd: 5_000_000 },
    };
    const priceBook: PriceBook = { get: (_orgId, modelId) => Promise.resolve(prices[modelId] ?? null) };
    const models: ModelCatalog = {
      get: () => Promise.resolve(null),
      effective: () => Promise.resolve({ profile: null, pinned: false, resolvedId: null }),
    };
    const llm: LlmTransport = {
      complete: (req) => Promise.resolve({ text: "billing", model: req.model, inputTokens: 90, outputTokens: 4 }),
    };
    const linkedRun: LinkedRunPort = (_setRef, _state, opts) =>
      Promise.resolve({ ...sampleResult, channel: opts.channel });
    let next = 0;
    const ports: RunPorts = {
      systemOne: { call: () => Promise.reject(new Error("no live calls in unit tests")) },
      models,
      keys: () => Promise.resolve({ apiKey: "ts_test", mode: "byo" }),
      limiter: () => Promise.resolve({ ok: true }),
      quota: () => Promise.resolve({ ok: true }),
      runs: { persist: () => Promise.resolve({ reviewItemIds: [], labelItemIds: [] }) },
      actions: { isEnabled: () => Promise.resolve(true), enqueue: () => Promise.resolve() },
      prices: priceBook,
      clock: () => 1_758_888_000_000,
      newId: () => `id-${String(next++)}`,
      llm,
      redactor: (state) => state,
      linkedRun,
    };
    expect(await ports.prices.get("org", "jev-1.13.0")).toEqual(prices["jev-1.13.0"]);
    expect(await ports.prices.get("org", "jev-latest")).toBeNull();
    expect([ports.newId(), ports.newId()]).toEqual(["id-0", "id-1"]);
    const completion = await ports.llm?.complete({ model: "claude-haiku-4-5", system: "", prompt: "", maxOutputTokens: 8, signal: new AbortController().signal });
    expect(LlmCompletion.parse(completion).model).toBe("claude-haiku-4-5");
    const linked = await ports.linkedRun?.("fallback-set", {}, {
      channel: "staging",
      parentRunId: sampleResult.runId,
      signal: new AbortController().signal,
    });
    expect(linked?.channel).toBe("staging");
  });
});
