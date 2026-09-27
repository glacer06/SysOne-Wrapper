import { describe, expect, it } from "vitest";

import { RateLimitResult, type TenantContext } from "@bandwise/core/contracts";

import { createInMemoryQuotaGuard } from "./quota-guard.js";
import { createInMemoryRateLimiter } from "./rate-limiter.js";

const ORG_A = "0192f000-0000-7000-8000-00000000000a";
const ORG_B = "0192f000-0000-7000-8000-00000000000b";
const TOKEN = "0192f000-0000-7000-8000-0000000000aa";
const USER = "0192f000-0000-7000-8000-0000000000bb";
const KEY = "0192f000-0000-7000-8000-0000000000cc";
const APP = "0192f000-0000-7000-8000-0000000000dd";

const system = (orgId: string): TenantContext => ({
  orgId,
  actor: { type: "system" },
  client: "job",
  plan: "team",
  requestId: "r",
});

const agent = (orgId: string): TenantContext => ({
  orgId,
  actor: { type: "agent", tokenId: TOKEN, userId: USER, role: "editor", scopes: ["run"], setIds: null, client: "cli" },
  client: "cli",
  plan: "team",
  requestId: "r",
});

const app = (orgId: string): TenantContext => ({
  orgId,
  actor: {
    type: "apiKey",
    keyId: KEY,
    appId: APP,
    tokenKind: "secret",
    mode: "live",
    channel: "production",
    scopes: ["run"],
    setIds: null,
    origin: null,
  },
  client: "api",
  plan: "team",
  requestId: "r",
});

describe("in-memory rate limiter", () => {
  function limiter(overrides: { globalRpm?: number | null; keyRpm?: number | null } = {}) {
    let now = 120_000;
    const l = createInMemoryRateLimiter({
      orgRpm: () => 8,
      globalRpm: () => (overrides.globalRpm === undefined ? 100 : overrides.globalRpm),
      keyRpm: () => overrides.keyRpm ?? null,
      clock: () => now,
    });
    return { l, tick: (ms: number) => (now += ms) };
  }

  it("allows the org RPM per model and then returns reason org with the time to the next window", async () => {
    const { l, tick } = limiter();
    for (let i = 0; i < 8; i++) expect(await l(system(ORG_A), "jev-1.13.0", 100, "run")).toEqual({ ok: true });
    tick(15_000);
    const res = await l(system(ORG_A), "jev-1.13.0", 100, "run");
    expect(RateLimitResult.parse(res)).toEqual({ ok: false, reason: "org", retryAfterMs: 45_000 });
    expect(await l(system(ORG_A), "jev-latest", 100, "run")).toEqual({ ok: true });
    tick(45_000);
    expect(await l(system(ORG_A), "jev-1.13.0", 100, "run")).toEqual({ ok: true });
  });

  it("gives evals a separate 25 percent bucket, so they never use up production runs", async () => {
    const { l } = limiter();
    expect(await l(system(ORG_A), "m", 1, "eval")).toEqual({ ok: true });
    expect(await l(system(ORG_A), "m", 1, "eval")).toEqual({ ok: true });
    expect(await l(system(ORG_A), "m", 1, "eval")).toMatchObject({ ok: false, reason: "eval" });
    for (let i = 0; i < 8; i++) expect(await l(system(ORG_A), "m", 1, "run")).toEqual({ ok: true });
  });

  it("keeps one org from using another org's budget", async () => {
    const { l } = limiter();
    for (let i = 0; i < 8; i++) await l(system(ORG_A), "m", 1, "run");
    expect(await l(system(ORG_A), "m", 1, "run")).toMatchObject({ ok: false });
    expect(await l(system(ORG_B), "m", 1, "run")).toEqual({ ok: true });
  });

  it("applies the global per-model budget, with evals at the lowest priority", async () => {
    const { l } = limiter({ globalRpm: 4 });
    expect(await l(system(ORG_A), "m", 1, "run")).toEqual({ ok: true });
    expect(await l(system(ORG_B), "m", 1, "run")).toEqual({ ok: true });
    // Evals may fill only half the global budget.
    expect(await l(system(ORG_A), "m", 1, "eval")).toMatchObject({ ok: false, reason: "global" });
    expect(await l(system(ORG_A), "m", 1, "run")).toEqual({ ok: true });
    expect(await l(system(ORG_B), "m", 1, "run")).toEqual({ ok: true });
    expect(await l(system(ORG_B), "m", 1, "run")).toMatchObject({ ok: false, reason: "global" });
  });

  it("applies a token's own RPM", async () => {
    const { l } = limiter({ keyRpm: 1 });
    expect(await l(app(ORG_A), "m", 1, "run")).toEqual({ ok: true });
    expect(await l(app(ORG_A), "m", 1, "run")).toMatchObject({ ok: false, reason: "key" });
    expect(await l(system(ORG_A), "m", 1, "run")).toEqual({ ok: true });
  });

  it("consumes nothing on a rejected request", async () => {
    const { l } = limiter({ keyRpm: 0 });
    expect(await l(agent(ORG_A), "m", 1, "run")).toMatchObject({ ok: false, reason: "key" });
    for (let i = 0; i < 8; i++) expect(await l(system(ORG_A), "m", 1, "run")).toEqual({ ok: true });
  });
});

describe("in-memory quota guard", () => {
  it("returns quota_exceeded at the plan's runs per month, and resets next month", async () => {
    let now = Date.UTC(2026, 8, 30, 23, 0);
    const q = createInMemoryQuotaGuard({ runsPerMonth: () => 2, clock: () => now });
    expect(await q(system(ORG_A), "m", 1)).toEqual({ ok: true });
    expect(await q(system(ORG_A), "m", 1)).toEqual({ ok: true });
    expect(await q(system(ORG_A), "m", 1)).toEqual({ ok: false, code: "quota_exceeded" });
    expect(await q(system(ORG_B), "m", 1)).toEqual({ ok: true });
    now = Date.UTC(2026, 9, 1, 0, 1);
    expect(await q(system(ORG_A), "m", 1)).toEqual({ ok: true });
  });

  it("treats a null limit as unlimited", async () => {
    const q = createInMemoryQuotaGuard({ runsPerMonth: () => null });
    for (let i = 0; i < 50; i++) expect(await q(system(ORG_A), "m", 1)).toEqual({ ok: true });
  });

  it("returns token_budget_exceeded once an agent token spent its daily cap", async () => {
    let now = Date.UTC(2026, 8, 26, 10);
    const q = createInMemoryQuotaGuard({
      runsPerMonth: () => null,
      tokenDailyCapMicroUsd: () => 100,
      clock: () => now,
    });
    expect(await q(agent(ORG_A), "m", 1)).toEqual({ ok: true });
    q.recordSpend(agent(ORG_A), 60);
    expect(await q(agent(ORG_A), "m", 1)).toEqual({ ok: true });
    q.recordSpend(agent(ORG_A), 40);
    expect(await q(agent(ORG_A), "m", 1)).toEqual({ ok: false, code: "token_budget_exceeded" });
    // Other actors are not capped by the token.
    expect(await q(system(ORG_A), "m", 1)).toEqual({ ok: true });
    now = Date.UTC(2026, 8, 27, 0, 1);
    expect(await q(agent(ORG_A), "m", 1)).toEqual({ ok: true });
  });
});
