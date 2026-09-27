import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LlmCompletion, LlmCompletionRequest, isTransportError } from "@bandwise/core";
import { describe, expect, it } from "vitest";
import { FixtureLlmTransport } from "./fixture-transport.js";
import { isRetryableLlmStatus, llmErrorForStatus } from "./errors.js";
import { llmFixtureKey } from "./fixture.js";
import { BUNDLED_LLM_FIXTURES_DIR, loadBundledLlmFixtures, loadLlmFixturesFromDir } from "./load.js";

const fixtures = loadBundledLlmFixtures();
const signal = new AbortController().signal;
const named = (name: string) => {
  const f = fixtures.find((x) => x.name === name);
  if (f === undefined) throw new Error(`no LLM fixture ${name}`);
  return f;
};

describe("LLM fixtures", () => {
  it("every fixture parses against the core LlmTransport contract, and keys are unique", () => {
    expect(fixtures.map((f) => `${f.route}/${f.name}`).sort()).toEqual([
      "anthropic/error-529",
      "anthropic/escalation-choice",
      "anthropic/escalation-noul",
      "openrouter/error-402",
      "openrouter/jev-router-choice",
    ]);
    for (const f of fixtures) {
      expect(LlmCompletionRequest.parse(f.request)).toEqual(f.request);
      if ("completion" in f) LlmCompletion.parse(f.completion);
    }
    expect(new Set(fixtures.map((f) => llmFixtureKey(f.request))).size).toBe(fixtures.length);
  });

  it("rejects a folder with a bad fixture file", () => {
    expect(loadLlmFixturesFromDir(`${BUNDLED_LLM_FIXTURES_DIR}anthropic`)).toHaveLength(3);
    const dir = mkdtempSync(join(tmpdir(), "llm-fx-"));
    writeFileSync(join(dir, "notes.txt"), "skipped");
    writeFileSync(join(dir, "bad.json"), JSON.stringify({ name: "bad", route: "anthropic" }));
    expect(() => loadLlmFixturesFromDir(dir)).toThrow(/invalid LLM fixture/);
  });
});

describe("FixtureLlmTransport", () => {
  const transport = new FixtureLlmTransport(fixtures);

  it("replays a completion by request and records the call", async () => {
    const f = named("escalation-choice");
    const out = await transport.complete({ ...f.request, signal });
    expect(out).toEqual({ text: "technical", model: "claude-haiku-4-5", inputTokens: 112, outputTokens: 2 });
    expect(transport.has(f.request)).toBe(true);
    expect(transport.size).toBe(fixtures.length);
    expect(transport.calls.at(-1)).toEqual({ request: f.request, fixture: "escalation-choice" });
  });

  it.each([
    ["error-529", true],
    ["error-402", false],
  ] as const)("%s throws llm_unavailable (retryable %s)", async (name, retryable) => {
    const err = await transport.complete({ ...named(name).request, signal }).catch((e: unknown) => e);
    expect(isTransportError(err)).toBe(true);
    expect(err).toMatchObject({ code: "llm_unavailable", retryable, requestId: null });
  });

  it("an aborted signal is client_aborted and records nothing", async () => {
    const t = new FixtureLlmTransport(fixtures);
    const ac = new AbortController();
    ac.abort();
    await expect(t.complete({ ...named("escalation-noul").request, signal: ac.signal })).rejects.toMatchObject({ code: "client_aborted" });
    expect(t.calls).toHaveLength(0);
  });

  it("a request no fixture covers fails unless respond answers it", async () => {
    const req = { model: "claude-haiku-4-5", system: "s", prompt: "p", maxOutputTokens: 4 };
    await expect(transport.complete({ ...req, signal })).rejects.toMatchObject({ code: "llm_unavailable", retryable: false });
    const t = new FixtureLlmTransport([], { respond: (r) => (r.prompt === "p" ? { text: "ok", model: r.model, inputTokens: 1, outputTokens: 1 } : undefined) });
    expect(await t.complete({ ...req, signal })).toMatchObject({ text: "ok" });
    expect(t.calls[0]?.fixture).toBeNull();
    await expect(t.complete({ ...req, prompt: "q", signal })).rejects.toMatchObject({ code: "llm_unavailable" });
  });
});

describe("status mapping", () => {
  it("retries only timeouts, conflicts, rate limits and server errors", () => {
    expect([400, 401, 402, 403, 404, 408, 409, 413, 429, 500, 529].filter(isRetryableLlmStatus)).toEqual([408, 409, 429, 500, 529]);
    expect(llmErrorForStatus(429, "anthropic", "req_1")).toMatchObject({ code: "llm_unavailable", retryable: true, requestId: "req_1" });
    expect(llmErrorForStatus(400, "openrouter").message).toBe("LLM request to openrouter failed with HTTP 400");
  });
});
