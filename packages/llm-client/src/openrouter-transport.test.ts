import { describe, expect, it } from "vitest";
import { loadBundledLlmFixtures } from "./fixture/load.js";
import { OPENROUTER_CHAT_COMPLETIONS_URL, OPENROUTER_TYPESAFE_ROUTER_MODEL, OpenRouterLlmTransport } from "./openrouter-transport.js";

// Canned chat completion bodies stand in for the network. No live call is made.

const fixture = loadBundledLlmFixtures().find((f) => f.name === "jev-router-choice");
if (fixture === undefined || !("completion" in fixture)) throw new Error("missing fixture jev-router-choice");
const signal = new AbortController().signal;

const chatBody = (over: Record<string, unknown> = {}) => ({
  id: "gen-fx-1",
  model: OPENROUTER_TYPESAFE_ROUTER_MODEL,
  choices: [{ message: { role: "assistant", content: "technical" } }],
  usage: { prompt_tokens: 118, completion_tokens: 2, cost: 0 },
  ...over,
});

type Reply = { status: number; body: unknown } | Error;

function scriptedFetch(replies: Reply[]) {
  const seen: Array<{ url: string; init: RequestInit | undefined }> = [];
  const fn = async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
    seen.push({ url: String(url), init });
    const r = replies[Math.min(seen.length - 1, replies.length - 1)] as Reply;
    if (r instanceof Error) throw r;
    return new Response(typeof r.body === "string" ? r.body : JSON.stringify(r.body), { status: r.status, headers: { "content-type": "application/json" } });
  };
  return { fn: fn as typeof fetch, seen };
}

const make = (replies: Reply[], over: Partial<ConstructorParameters<typeof OpenRouterLlmTransport>[0]> = {}) => {
  const f = scriptedFetch(replies);
  const sleeps: number[] = [];
  const t = new OpenRouterLlmTransport({ apiKey: "or_key", fetch: f.fn, sleep: async (ms) => void sleeps.push(ms), ...over });
  return { t, seen: f.seen, sleeps };
};

describe("OpenRouterLlmTransport (ADR-011, proposed)", () => {
  it("posts one chat completion with the org's OpenRouter key and returns text, model and tokens", async () => {
    const { t, seen } = make([{ status: 200, body: chatBody() }]);
    const out = await t.complete({ ...fixture.request, signal });
    expect(out).toEqual(fixture.completion);
    expect(seen[0]?.url).toBe(OPENROUTER_CHAT_COMPLETIONS_URL);
    expect(new Headers(seen[0]?.init?.headers).get("authorization")).toBe("Bearer or_key");
    expect(JSON.parse(String(seen[0]?.init?.body))).toEqual({
      model: "typesafe/jev-router",
      messages: [
        { role: "system", content: fixture.request.system },
        { role: "user", content: fixture.request.prompt },
      ],
      max_tokens: 16,
    });
  });

  it("a null or missing message content is an empty text", async () => {
    const { t } = make([{ status: 200, body: chatBody({ choices: [{ message: { content: null } }] }) }]);
    expect((await t.complete({ ...fixture.request, signal })).text).toBe("");
    const { t: t2 } = make([{ status: 200, body: chatBody({ choices: [{}] }) }]);
    expect((await t2.complete({ ...fixture.request, signal })).text).toBe("");
  });

  it("retries 503 and network errors with backoff, then succeeds", async () => {
    const { t, seen, sleeps } = make([{ status: 503, body: {} }, new TypeError("fetch failed"), { status: 200, body: chatBody() }]);
    expect((await t.complete({ ...fixture.request, signal })).text).toBe("technical");
    expect(seen).toHaveLength(3);
    expect(sleeps).toEqual([250, 500]);
  });

  it("gives up after maxRetries with a retryable llm_unavailable", async () => {
    const { t, seen } = make([{ status: 529, body: {} }], { maxRetries: 1 });
    await expect(t.complete({ ...fixture.request, signal })).rejects.toMatchObject({ code: "llm_unavailable", retryable: true });
    expect(seen).toHaveLength(2);
  });

  it("402 (no credits) is llm_unavailable and not retried", async () => {
    const { t, seen } = make([{ status: 402, body: { error: { code: 402, message: "Insufficient credits" } } }]);
    await expect(t.complete({ ...fixture.request, signal })).rejects.toMatchObject({ code: "llm_unavailable", retryable: false });
    expect(seen).toHaveLength(1);
  });

  it.each([
    ["a body that is not JSON", "not json"],
    ["a body with the wrong shape", { choices: [] }],
  ])("%s is llm_invalid_reply", async (_name, body) => {
    const { t } = make([{ status: 200, body }]);
    await expect(t.complete({ ...fixture.request, signal })).rejects.toMatchObject({ code: "llm_invalid_reply" });
  });

  it("an aborted signal is client_aborted, before or during the call", async () => {
    const ac = new AbortController();
    ac.abort();
    const { t, seen } = make([{ status: 200, body: chatBody() }]);
    await expect(t.complete({ ...fixture.request, signal: ac.signal })).rejects.toMatchObject({ code: "client_aborted" });
    expect(seen).toHaveLength(0);

    const during = new AbortController();
    const aborting = async (): Promise<Response> => {
      during.abort();
      throw new DOMException("aborted", "AbortError");
    };
    const t2 = new OpenRouterLlmTransport({ apiKey: "k", fetch: aborting as typeof fetch, sleep: async () => {} });
    await expect(t2.complete({ ...fixture.request, signal: during.signal })).rejects.toMatchObject({ code: "client_aborted" });
  });

  it("uses global fetch and a real timer by default", () => {
    expect(new OpenRouterLlmTransport({ apiKey: "k" })).toBeInstanceOf(OpenRouterLlmTransport);
  });
});
