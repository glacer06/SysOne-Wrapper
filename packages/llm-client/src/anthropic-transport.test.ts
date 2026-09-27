import { APIConnectionError, APIUserAbortError } from "@anthropic-ai/sdk";
import { TransportError, isTransportError } from "@sysone/core";
import { afterEach, describe, expect, it } from "vitest";
import { ANTHROPIC_BASE_URL, ANTHROPIC_SDK_LOG_LEVEL, AnthropicLlmTransport, createAnthropicClient, mapAnthropicError } from "./anthropic-transport.js";
import { loadBundledLlmFixtures } from "./fixture/load.js";

// Canned Messages API bodies stand in for the network. No live call is made.

const fixture = loadBundledLlmFixtures().find((f) => f.name === "escalation-choice");
if (fixture === undefined || !("completion" in fixture)) throw new Error("missing fixture escalation-choice");
const signal = new AbortController().signal;

interface Seen {
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

function messageBody(over: Record<string, unknown> = {}) {
  return {
    id: "msg_fx_1",
    type: "message",
    role: "assistant",
    model: "claude-haiku-4-5",
    content: [{ type: "text", text: "tech" }, { type: "text", text: "nical" }],
    stop_reason: "end_turn",
    stop_sequence: null,
    usage: { input_tokens: 100, output_tokens: 2, cache_creation_input_tokens: 10, cache_read_input_tokens: 2 },
    ...over,
  };
}

function fakeFetch(status: number, body: unknown, seen: Seen[] = [], headers: Record<string, string> = {}) {
  return async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const h = new Headers(init?.headers);
    seen.push({ url: String(url), headers: Object.fromEntries(h.entries()), body: JSON.parse(String(init?.body ?? "null")) as Record<string, unknown> });
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "request-id": "req_fx_anthropic", ...headers } });
  };
}

const transport = (fetch: ReturnType<typeof fakeFetch>) => new AnthropicLlmTransport({ apiKey: "sk-ant-test", maxRetries: 0, fetch: fetch as never });

describe("AnthropicLlmTransport", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it("sends one Messages API call with the org's prompt and returns text, model and tokens", async () => {
    const seen: Seen[] = [];
    const out = await transport(fakeFetch(200, messageBody(), seen)).complete({ ...fixture.request, signal });
    expect(out).toEqual({ text: "technical", model: "claude-haiku-4-5", inputTokens: 112, outputTokens: 2 });
    expect(seen[0]?.url).toBe(`${ANTHROPIC_BASE_URL}/v1/messages`);
    expect(seen[0]?.headers["x-api-key"]).toBe("sk-ant-test");
    expect(seen[0]?.headers["authorization"]).toBeUndefined();
    expect(seen[0]?.body).toEqual({
      model: fixture.request.model,
      max_tokens: fixture.request.maxOutputTokens,
      system: fixture.request.system,
      messages: [{ role: "user", content: fixture.request.prompt }],
    });
  });

  it("ignores ANTHROPIC_BASE_URL and ANTHROPIC_AUTH_TOKEN in the environment", async () => {
    process.env["ANTHROPIC_BASE_URL"] = "https://attacker.example";
    process.env["ANTHROPIC_AUTH_TOKEN"] = "tok";
    const seen: Seen[] = [];
    await transport(fakeFetch(200, messageBody(), seen)).complete({ ...fixture.request, signal });
    expect(seen[0]?.url.startsWith(ANTHROPIC_BASE_URL)).toBe(true);
    expect(seen[0]?.headers["authorization"]).toBeUndefined();
    const client = createAnthropicClient({ apiKey: "k" });
    expect(client.baseURL).toBe(ANTHROPIC_BASE_URL);
    expect(client.logLevel).toBe(ANTHROPIC_SDK_LOG_LEVEL);
  });

  it("returns an empty text for a refusal or a reply with no text block", async () => {
    const out = await transport(fakeFetch(200, messageBody({ content: [], stop_reason: "refusal", usage: { input_tokens: 5, output_tokens: 0 } }))).complete({ ...fixture.request, signal });
    expect(out).toEqual({ text: "", model: "claude-haiku-4-5", inputTokens: 5, outputTokens: 0 });
  });

  it.each([
    [529, true],
    [429, true],
    [400, false],
    [401, false],
  ])("HTTP %i is llm_unavailable (retryable %s) with the request id", async (status, retryable) => {
    const err = await transport(fakeFetch(status, { type: "error", error: { type: "x", message: "secret payload echo" } })).complete({ ...fixture.request, signal }).catch((e: unknown) => e);
    expect(isTransportError(err)).toBe(true);
    expect(err).toMatchObject({ code: "llm_unavailable", retryable, requestId: "req_fx_anthropic" });
    expect((err as Error).message).not.toContain("secret");
  });

  it("an unreadable 200 is llm_invalid_reply", async () => {
    const err = await transport(fakeFetch(200, { hello: "world" })).complete({ ...fixture.request, signal }).catch((e: unknown) => e);
    expect(err).toMatchObject({ code: "llm_invalid_reply" });
  });

  it("an aborted signal is client_aborted", async () => {
    const ac = new AbortController();
    ac.abort();
    const err = await transport(fakeFetch(200, messageBody())).complete({ ...fixture.request, signal: ac.signal }).catch((e: unknown) => e);
    expect(err).toMatchObject({ code: "client_aborted" });
  });

  it("a network failure is llm_unavailable after the SDK's retries", async () => {
    const failing = async (): Promise<Response> => {
      throw new TypeError("fetch failed");
    };
    const err = await new AnthropicLlmTransport({ apiKey: "k", maxRetries: 0, fetch: failing as never }).complete({ ...fixture.request, signal }).catch((e: unknown) => e);
    expect(err).toMatchObject({ code: "llm_unavailable", retryable: true, requestId: null });
  });
});

describe("mapAnthropicError", () => {
  it("maps SDK classes and passes TransportErrors through", () => {
    const own = new TransportError({ code: "llm_invalid_reply", retryable: false, requestId: null }, "x");
    expect(mapAnthropicError(own)).toBe(own);
    expect(mapAnthropicError(new APIUserAbortError())).toMatchObject({ code: "client_aborted" });
    expect(mapAnthropicError(new APIConnectionError({ message: "down" }))).toMatchObject({ code: "llm_unavailable", retryable: true });
    expect(mapAnthropicError(new Error("boom"))).toMatchObject({ code: "llm_unavailable", retryable: false });
  });
});
