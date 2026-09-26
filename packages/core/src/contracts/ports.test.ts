import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  ActionJob,
  EffectiveModel,
  LlmCompletion,
  LlmCompletionRequest,
  ModelPrice,
  QuotaResult,
  RateLimitResult,
  ResolvedKey,
  ResolvedRun,
  RunSinkRecord,
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
    };
    expect(RunSinkRecord.safeParse(record).success).toBe(true);
    expect(RunSinkRecord.safeParse({ ...record, stateHash: "" }).success).toBe(false);
  });

  it("ResolvedRun takes the example spec and a pointer's channel and rollout stage", () => {
    const resolved = { spec: exampleSpec, versionId: sampleResult.versionId, channel: "production", rollout: "controlled" };
    expect(ResolvedRun.safeParse(resolved).success).toBe(true);
    expect(ResolvedRun.safeParse({ ...resolved, experiment: { id: sampleResult.versionId, arm: "challenger" } }).success).toBe(true);
    expect(ResolvedRun.safeParse({ ...resolved, rollout: "canary" }).success).toBe(false);
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
    };
    expect(await ports.prices.get("org", "jev-1.13.0")).toEqual(prices["jev-1.13.0"]);
    expect(await ports.prices.get("org", "jev-latest")).toBeNull();
    expect([ports.newId(), ports.newId()]).toEqual(["id-0", "id-1"]);
    const completion = await ports.llm?.complete({ model: "claude-haiku-4-5", system: "", prompt: "", maxOutputTokens: 8, signal: new AbortController().signal });
    expect(LlmCompletion.parse(completion).model).toBe("claude-haiku-4-5");
  });
});
