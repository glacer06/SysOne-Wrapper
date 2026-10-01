// The platform keys the console run path hands the engine, per transport.

import { describe, expect, it, vi } from "vitest";

vi.mock("~/env", () => ({ getEnv: () => ({}) }));
vi.mock("~/server/db", () => ({ getDb: () => ({}) }));

const { FIXTURE_PLACEHOLDER_KEY, platformKeysFor } = await import("./deps");

const none = { TYPESAFE_API_KEY: undefined, OPENROUTER_API_KEY: undefined, AI_GATEWAY_API_KEY: undefined };

describe("platformKeysFor", () => {
  it("fills a placeholder in fixture mode, which never sends a key", () => {
    expect(platformKeysFor({ ...none, SYSTEM_ONE_TRANSPORT: "fixture" })).toEqual({
      typesafe: FIXTURE_PLACEHOLDER_KEY,
      openrouter: FIXTURE_PLACEHOLDER_KEY,
      vercel: FIXTURE_PLACEHOLDER_KEY,
    });
  });

  it("never invents a key for the SDK transport", () => {
    expect(platformKeysFor({ ...none, SYSTEM_ONE_TRANSPORT: "sdk" })).toEqual({});
    expect(platformKeysFor({ ...none, SYSTEM_ONE_TRANSPORT: "sdk", TYPESAFE_API_KEY: "k" })).toEqual({ typesafe: "k" });
  });
});
