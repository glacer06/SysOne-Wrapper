import { describe, expect, it } from "vitest";
import { createLlmTransport } from "./index.js";
import { FixtureLlmTransport } from "./fixture/fixture-transport.js";
import { loadBundledLlmFixtures } from "./fixture/load.js";
import { OPENROUTER_TYPESAFE_ROUTER_MODEL } from "./openrouter-transport.js";
import { RoutedLlmTransport, isOpenRouterModelId } from "./routed-transport.js";

const fixtures = loadBundledLlmFixtures();
const signal = new AbortController().signal;
const request = (name: string) => {
  const f = fixtures.find((x) => x.name === name);
  if (f === undefined) throw new Error(`no LLM fixture ${name}`);
  return f.request;
};

describe("isOpenRouterModelId", () => {
  it.each([
    [OPENROUTER_TYPESAFE_ROUTER_MODEL, true],
    ["anthropic/claude-haiku-4.5", true],
    ["~typesafe/jev-latest", true],
    ["claude-haiku-4-5", false],
    ["claude-opus-5", false],
    ["/nope", false],
    ["a/b/c", false],
  ])("%s -> %s", (id, expected) => {
    expect(isOpenRouterModelId(id)).toBe(expected);
  });
});

describe("RoutedLlmTransport", () => {
  it("sends Anthropic ids to Anthropic and OpenRouter ids to OpenRouter when the route is on", async () => {
    const anthropic = new FixtureLlmTransport(fixtures);
    const openrouter = new FixtureLlmTransport(fixtures);
    const t = new RoutedLlmTransport({ anthropic, openrouter: { enabled: true, transport: openrouter } });
    expect(t.routeFor("claude-haiku-4-5")).toBe("anthropic");
    expect(t.routeFor(OPENROUTER_TYPESAFE_ROUTER_MODEL)).toBe("openrouter");
    expect((await t.complete({ ...request("escalation-choice"), signal })).model).toBe("claude-haiku-4-5");
    expect((await t.complete({ ...request("jev-router-choice"), signal })).model).toBe("typesafe/jev-router");
    expect(anthropic.calls.map((c) => c.fixture)).toEqual(["escalation-choice"]);
    expect(openrouter.calls.map((c) => c.fixture)).toEqual(["jev-router-choice"]);
  });

  it.each([
    ["left out", undefined],
    ["disabled", { enabled: false, transport: new FixtureLlmTransport(fixtures) }],
  ])("with the OpenRouter route %s, an OpenRouter id fails as llm_unavailable without a call", async (_name, openrouter) => {
    const anthropic = new FixtureLlmTransport(fixtures);
    const t = new RoutedLlmTransport({ anthropic, openrouter });
    expect(t.routeFor(OPENROUTER_TYPESAFE_ROUTER_MODEL)).toBeNull();
    await expect(t.complete({ ...request("jev-router-choice"), signal })).rejects.toMatchObject({ code: "llm_unavailable", retryable: false });
    expect(anthropic.calls).toHaveLength(0);
  });
});

describe("createLlmTransport", () => {
  it("builds Anthropic only by default and keeps OpenRouter behind enabled", () => {
    const plain = createLlmTransport({ anthropic: { apiKey: "k" } }) as RoutedLlmTransport;
    expect(plain.routeFor(OPENROUTER_TYPESAFE_ROUTER_MODEL)).toBeNull();
    const off = createLlmTransport({ anthropic: { apiKey: "k" }, openrouter: { apiKey: "or", enabled: false } }) as RoutedLlmTransport;
    expect(off.routeFor(OPENROUTER_TYPESAFE_ROUTER_MODEL)).toBeNull();
    const on = createLlmTransport({ anthropic: { apiKey: "k" }, openrouter: { apiKey: "or", enabled: true } }) as RoutedLlmTransport;
    expect(on.routeFor(OPENROUTER_TYPESAFE_ROUTER_MODEL)).toBe("openrouter");
  });
});
