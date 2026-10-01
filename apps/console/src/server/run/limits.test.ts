// The per-caller run rate and daily spend cap on hosted runs (limits.ts, migration 0008), through
// POST /api/v1/sets/{ref}/run against a real Postgres (PGlite) as the app role. Each request builds
// its own ports, so every call below uses a fresh limiter and quota instance: the counts they share
// live only in the database.

import type { RunResult, TenantContext } from "@bandwise/core";
import { repos, seedOrgs, type SeededOrg } from "@bandwise/db";
import { createTestDatabase, type TestDatabase } from "@bandwise/db/testing";
import { FixtureTransport, loadBundledFixtures } from "@bandwise/system-one-client/fixture";
import { createTokenHasher } from "@bandwise/tenancy";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { handleRunHttp, type RunHttpDeps } from "./http";
import {
  chargeRunSpend,
  createDbRunLimiter,
  createDbSpendQuota,
  HOSTED_DAILY_SPEND_CAP_MICRO_USD,
  HOSTED_RUN_LIMITS,
  HOSTED_RUN_WINDOW_MS,
  HOSTED_RUNS_PER_WINDOW,
  type HostedRunLimits,
  limitSubject,
} from "./limits";

const hasher = createTokenHasher("pepper-".repeat(6));

let t: TestDatabase;
let internal: SeededOrg;

const sys = (orgId: string) => ({ orgId, actor: { type: "system" as const }, client: "job" as const, plan: "internal", requestId: "test" });

const T0 = Date.parse("2026-10-01T12:00:10Z");

function deps(limits: HostedRunLimits, now: () => number): () => RunHttpDeps {
  return () => ({
    db: t.db,
    hasher,
    transport: new FixtureTransport(loadBundledFixtures(), { synthesize: true }),
    platformKeys: { typesafe: "test-platform-key" },
    now,
    nowDate: () => new Date(now()),
    limits,
  });
}

async function token(org: SeededOrg): Promise<string> {
  const { token: raw, hash } = hasher.mint("sk_live_", org.orgId);
  await t.db.withTenant(sys(org.orgId), (tx) =>
    repos.appTokens.insert(tx, { appId: org.appId, kind: "secret", prefix: "sk_live_", hash, scopes: ["run"], setIds: [org.setId], channel: "production" }),
  );
  return raw;
}

function call(raw: string, load: () => RunHttpDeps) {
  return handleRunHttp(
    {
      authorization: `Bearer ${raw}`,
      rawRef: "inbox-triage",
      channel: null,
      readBody: async () => ({ text: JSON.stringify({ state: { text: "Can you send me the invoice by Friday?" } }), tooLarge: false }),
      requestId: "req-limits",
    },
    load,
  );
}

type ErrorBody = { error: { code: string; runId?: string; retryable: boolean } };

beforeAll(async () => {
  t = await createTestDatabase();
  [internal] = (await seedOrgs(t.db, [{ slug: "internal", name: "Internal", members: [{ email: "nick@internal.test", name: "Nick", role: "owner" }] }])) as [SeededOrg];
}, 120_000);

afterAll(async () => {
  await t.close();
});

describe("hosted run limits", () => {
  it("names the dogfood limits as constants", () => {
    expect(HOSTED_RUNS_PER_WINDOW).toBe(120);
    expect(HOSTED_RUN_WINDOW_MS).toBe(60_000);
    expect(HOSTED_DAILY_SPEND_CAP_MICRO_USD).toBe(5_000_000);
    expect(HOSTED_RUN_LIMITS).toEqual({ runsPerWindow: 120, windowMs: 60_000, dailySpendCapMicroUsd: 5_000_000 });
  });

  it("refuses a token's runs past the rate with 429 rate_limited, leaves another token alone, and opens again next window", async () => {
    let now = T0;
    const load = deps({ runsPerWindow: 2, windowMs: 60_000, dailySpendCapMicroUsd: Number.MAX_SAFE_INTEGER }, () => now);
    const a = await token(internal);
    const b = await token(internal);
    expect((await call(a, load)).status).toBe(200);
    expect((await call(a, load)).status).toBe(200);
    const refused = await call(a, load);
    expect(refused.status).toBe(429);
    const body = refused.body as ErrorBody;
    expect(body.error).toMatchObject({ code: "rate_limited", retryable: true });
    // The refused run is stored, and the envelope names it.
    const row = await t.db.withTenant(sys(internal.orgId), (tx) => repos.runs.get(tx, body.error.runId as string));
    expect(row).toMatchObject({ status: "rate_limited", errorCode: "rate_limited" });
    expect((await call(b, load)).status).toBe(200);
    now = T0 + 60_000;
    expect((await call(a, load)).status).toBe(200);
  });

  it("refuses a token's runs once its spend for the day reaches the cap with 402 token_budget_exceeded", async () => {
    let now = T0;
    const load = deps({ runsPerWindow: 1_000, windowMs: 60_000, dailySpendCapMicroUsd: 1 }, () => now);
    const a = await token(internal);
    const b = await token(internal);
    const first = await call(a, load);
    expect(first.status).toBe(200);
    expect((first.body as RunResult).cost.systemOneCostUsd).toBeGreaterThan(0);
    const refused = await call(a, load);
    expect(refused.status).toBe(402);
    expect((refused.body as ErrorBody).error).toMatchObject({ code: "token_budget_exceeded", retryable: false });
    expect((await call(b, load)).status).toBe(200);
    // A new UTC day starts a new budget.
    now = Date.parse("2026-10-02T00:00:01Z");
    expect((await call(a, load)).status).toBe(200);
  });
});

describe("limit ports", () => {
  const agent = (tokenId: string): TenantContext => ({
    orgId: internal.orgId,
    actor: { type: "agent", tokenId, userId: Object.values(internal.userIds)[0] as string, role: "owner", scopes: ["run"], setIds: null, client: "cli" },
    client: "cli",
    plan: "internal",
    requestId: "r",
  });
  const TOKEN_A = "0193a000-0000-7000-8000-00000000a001";
  const TOKEN_B = "0193a000-0000-7000-8000-00000000a002";
  const T1 = Date.parse("2026-10-01T15:00:00Z");

  it("shares one count between two limiter instances, per token", async () => {
    const limits = { runsPerWindow: 3, windowMs: 60_000, dailySpendCapMicroUsd: 1 };
    const one = createDbRunLimiter(t.db, limits, () => T1);
    const two = createDbRunLimiter(t.db, limits, () => T1 + 15_000);
    const results = [await one(agent(TOKEN_A), "jev", 1, "run"), await two(agent(TOKEN_A), "jev", 1, "run"), await one(agent(TOKEN_A), "jev", 1, "run")];
    expect(results.every((r) => r.ok)).toBe(true);
    expect(await two(agent(TOKEN_A), "jev", 1, "run")).toEqual({ ok: false, retryAfterMs: 45_000, reason: "key" });
    expect(await one(agent(TOKEN_B), "jev", 1, "run")).toEqual({ ok: true });
  });

  it("charges stored runs to the caller and refuses at the cap in every quota instance", async () => {
    const limits = { runsPerWindow: 3, windowMs: 60_000, dailySpendCapMicroUsd: 2_000 };
    const sink = chargeRunSpend({ persist: async () => ({ reviewItemIds: [], labelItemIds: [] }) }, t.db, () => T1);
    const record = (usd: number, escalationUsd = 0) => ({ result: { cost: { systemOneCostUsd: usd, escalationCostUsd: escalationUsd } } }) as never;
    const q1 = createDbSpendQuota(t.db, limits, () => T1);
    const q2 = createDbSpendQuota(t.db, limits, () => T1 + 60_000);
    const ctx = agent("0193a000-0000-7000-8000-00000000a003");
    expect(await q1(ctx, "jev", 1)).toEqual({ ok: true });
    await sink.persist(ctx, record(0.0015));
    expect(await q2(ctx, "jev", 1)).toEqual({ ok: true });
    await sink.persist(ctx, record(0, 0.0005));
    expect(await q1(ctx, "jev", 1)).toEqual({ ok: false, code: "token_budget_exceeded" });
    expect(await q2(ctx, "jev", 1)).toEqual({ ok: false, code: "token_budget_exceeded" });
    expect(await q2(agent("0193a000-0000-7000-8000-00000000a004"), "jev", 1)).toEqual({ ok: true });
  });

  it("keys a limit by org and by token, key or user, never by a shared bucket", () => {
    expect(limitSubject(agent(TOKEN_A))).toBe(`${internal.orgId}:agent:${TOKEN_A}`);
    const user: TenantContext = { ...agent(TOKEN_A), actor: { type: "user", userId: TOKEN_B, role: "owner", platformRole: null, impersonatorId: null }, client: "console" };
    expect(limitSubject(user)).toBe(`${internal.orgId}:user:${TOKEN_B}`);
    expect(limitSubject({ ...agent(TOKEN_A), orgId: TOKEN_B })).not.toBe(limitSubject(agent(TOKEN_A)));
  });
});
