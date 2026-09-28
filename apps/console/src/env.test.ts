import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const validEnv = {
  DATABASE_URL: "postgres://app:app@localhost:5432/bandwise",
  AUTH_SECRET: "a".repeat(32),
  BANDWISE_KEK: "test-kek",
  BANDWISE_JWT_SIGNING_KEY: "test-signing-key",
};

async function loadEnv() {
  vi.resetModules();
  const mod = await import("./env");
  return mod.getEnv();
}

describe("console env", () => {
  beforeEach(() => {
    for (const [key, value] of Object.entries(validEnv)) vi.stubEnv(key, value);
    vi.stubEnv("SYSTEM_ONE_TRANSPORT", "");
    vi.stubEnv("TYPESAFE_API_KEY", "");
    vi.stubEnv("OPENROUTER_API_KEY", "");
    vi.stubEnv("AI_GATEWAY_API_KEY", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("parses a minimal valid env and defaults to the fixture transport", async () => {
    const env = await loadEnv();
    expect(env.DATABASE_URL).toBe(validEnv.DATABASE_URL);
    expect(env.SYSTEM_ONE_TRANSPORT).toBe("fixture");
  });

  it("runs without the vault and JWT keys, as the pre-Phase 2 deploy does (ADR-018)", async () => {
    vi.stubEnv("BANDWISE_KEK", "");
    vi.stubEnv("BANDWISE_JWT_SIGNING_KEY", "");
    const env = await loadEnv();
    expect(env.BANDWISE_KEK).toBeUndefined();
    expect(env.BANDWISE_JWT_SIGNING_KEY).toBeUndefined();
  });

  it("rejects a short AUTH_SECRET, since it keys the early-access IP hash", async () => {
    vi.stubEnv("AUTH_SECRET", "too-short");
    await expect(loadEnv()).rejects.toThrow();
  });

  it("does not validate on import, only on the first getEnv() call", async () => {
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("AUTH_SECRET", "");
    vi.resetModules();
    const mod = await import("./env");
    expect(() => mod.getEnv()).toThrow();
  });

  it("rejects a missing DATABASE_URL", async () => {
    vi.stubEnv("DATABASE_URL", "");
    await expect(loadEnv()).rejects.toThrow();
  });

  it("accepts an OpenRouter key alone for the sdk transport", async () => {
    vi.stubEnv("SYSTEM_ONE_TRANSPORT", "sdk");
    vi.stubEnv("OPENROUTER_API_KEY", "sk-or-test");
    const env = await loadEnv();
    expect(env.OPENROUTER_API_KEY).toBe("sk-or-test");
  });

  it("accepts an AI Gateway key alone for the sdk transport (ADR-013)", async () => {
    vi.stubEnv("SYSTEM_ONE_TRANSPORT", "sdk");
    vi.stubEnv("AI_GATEWAY_API_KEY", "vck-test");
    const env = await loadEnv();
    expect(env.AI_GATEWAY_API_KEY).toBe("vck-test");
  });

  it("requires a platform key when the sdk transport is selected", async () => {
    vi.stubEnv("SYSTEM_ONE_TRANSPORT", "sdk");
    await expect(loadEnv()).rejects.toThrow();
    vi.stubEnv("TYPESAFE_API_KEY", "ts_test_key");
    const env = await loadEnv();
    expect(env.SYSTEM_ONE_TRANSPORT).toBe("sdk");
  });
});
