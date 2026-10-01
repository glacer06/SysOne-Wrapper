// The run rate and daily spend cap on hosted runs, per caller and per org (limits.ts, migration
// 0008), through POST /api/v1/sets/{ref}/run against a real Postgres (PGlite) as the app role. Each
// request builds its own ports, so every call below uses a fresh limiter and quota instance: the
// counts they share live only in the database.
//
// PGlite has one connection, so calls that overlap in time still run one after another here. The
// reservation tests below therefore start several runs' quota steps before any of them is stored,
// which is the interleaving that let concurrent runs pass a read-only cap check together.

import type { RunResult, RunSinkRecord, TenantContext } from "@bandwise/core";
import { authRepositories, repos, seedOrgs, type SeededOrg } from "@bandwise/db";
import { createTestDatabase, type TestDatabase } from "@bandwise/db/testing";
import { FixtureTransport, loadBundledFixtures } from "@bandwise/system-one-client/fixture";
import { createTokenHasher, hashRunLimitKey } from "@bandwise/tenancy";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { handleRunHttp, type RunHttpDeps } from "./http";
import { createDbRunLimiter, createDbSpendCap, HOSTED_RUN_LIMITS, type HostedRunLimits, limitSubject } from "./limits";

const hasher = createTokenHasher("pepper-".repeat(6));

let t: TestDatabase;
let internal: SeededOrg;

const sys = (orgId: string) => ({ orgId, actor: { type: "system" as const }, client: "job" as const, plan: "internal", requestId: "test" });

const T0 = Date.parse("2026-10-01T12:00:10Z");
const MANY = Number.MAX_SAFE_INTEGER;

/** Limits for a test: everything open except what the test sets. */
function open(over: Partial<HostedRunLimits>): HostedRunLimits {
  return {
    runsPerWindow: MANY,
    orgRunsPerWindow: MANY,
    windowMs: 60_000,
    dailySpendCapMicroUsd: MANY,
    orgDailySpendCapMicroUsd: MANY,
    runSpendReserveMicroUsd: 1,
    ...over,
  };
}

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

/** A statement as the database owner, outside the app role (test setup only). */
async function asOwner<T>(fn: () => Promise<T>): Promise<T> {
  await t.pglite.exec("RESET ROLE");
  try {
    return await fn();
  } finally {
    await t.pglite.exec("SET ROLE bandwise_app");
  }
}

async function runCount(): Promise<number> {
  return asOwner(async () => Number((await t.pglite.query<{ n: number }>("select count(*)::int as n from runs")).rows[0]?.n));
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
  it("keeps every default caller limit under its org limit, and reserves less than either cap", () => {
    const l = HOSTED_RUN_LIMITS;
    expect(l.runsPerWindow).toBeLessThanOrEqual(l.orgRunsPerWindow);
    expect(l.dailySpendCapMicroUsd).toBeLessThanOrEqual(l.orgDailySpendCapMicroUsd);
    expect(l.runSpendReserveMicroUsd).toBeGreaterThan(0);
    expect(l.runSpendReserveMicroUsd).toBeLessThan(l.dailySpendCapMicroUsd);
  });

  it("refuses a token's runs past the rate with 429 rate_limited and Retry-After, leaves another token alone, and opens again next window", async () => {
    let now = T0;
    const load = deps(open({ runsPerWindow: 2 }), () => now);
    const a = await token(internal);
    const b = await token(internal);
    expect((await call(a, load)).status).toBe(200);
    expect((await call(a, load)).status).toBe(200);
    const refused = await call(a, load);
    expect(refused.status).toBe(429);
    // T0 is 10 seconds into its minute, so the window opens again in 50.
    expect(refused.headers).toEqual({ "retry-after": "50" });
    const body = refused.body as ErrorBody;
    expect(body.error).toMatchObject({ code: "rate_limited", retryable: true });
    // The refused run is stored, and the envelope names it.
    const row = await t.db.withTenant(sys(internal.orgId), (tx) => repos.runs.get(tx, body.error.runId as string));
    expect(row).toMatchObject({ status: "rate_limited", errorCode: "rate_limited" });
    expect((await call(b, load)).headers).toBeUndefined();
    now = T0 + 60_000;
    expect((await call(a, load)).status).toBe(200);
  });

  it("refuses a token's runs once its spend for the day reaches the cap with 402 token_budget_exceeded", async () => {
    let now = T0;
    const load = deps(open({ dailySpendCapMicroUsd: 1 }), () => now);
    const a = await token(internal);
    const b = await token(internal);
    const first = await call(a, load);
    expect(first.status).toBe(200);
    expect((first.body as RunResult).cost.systemOneCostUsd).toBeGreaterThan(0);
    const refused = await call(a, load);
    expect(refused.status).toBe(402);
    expect(refused.headers).toBeUndefined();
    expect((refused.body as ErrorBody).error).toMatchObject({ code: "token_budget_exceeded", retryable: false });
    expect((await call(b, load)).status).toBe(200);
    // A new UTC day starts a new budget.
    now = Date.parse("2026-10-02T00:00:01Z");
    expect((await call(a, load)).status).toBe(200);
  });

  it("caps the org's runs over all its tokens, so a new token buys no more rate", async () => {
    // Later than every earlier test's clock, so the org window starts empty.
    const now = Date.parse("2026-10-03T13:00:05Z");
    const load = deps(open({ runsPerWindow: 10, orgRunsPerWindow: 2 }), () => now);
    const a = await token(internal);
    const b = await token(internal);
    expect((await call(a, load)).status).toBe(200);
    expect((await call(b, load)).status).toBe(200);
    const fresh = await token(internal);
    const refused = await call(fresh, load);
    expect(refused.status).toBe(429);
    expect(refused.headers).toEqual({ "retry-after": "55" });
  });

  it("caps the org's spend for the day over all its tokens, so a new token buys no more budget", async () => {
    const now = Date.parse("2026-10-05T09:00:00Z");
    const load = deps(open({ orgDailySpendCapMicroUsd: 1 }), () => now);
    expect((await call(await token(internal), load)).status).toBe(200);
    const refused = await call(await token(internal), load);
    expect(refused.status).toBe(402);
    expect((refused.body as ErrorBody).error.code).toBe("token_budget_exceeded");
  });

  it("rolls a run back with its spend when the charge fails, and keeps the reservation counted", async () => {
    const now = Date.parse("2026-10-06T09:00:00Z");
    const reserve = 7;
    const load = deps(open({ runSpendReserveMicroUsd: reserve }), () => now);
    const a = await token(internal);
    // Any write to run_limits inside a tenant transaction fails: that is only the settle step,
    // which runs in the run's own transaction. The limiter and quota run outside any tenant.
    await asOwner(() =>
      t.pglite.exec(`
        CREATE FUNCTION fail_tenant_charge() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
          IF coalesce(current_setting('app.org_id', true), '') <> '' THEN RAISE EXCEPTION 'charge failed'; END IF;
          RETURN NEW;
        END $$;
        CREATE TRIGGER fail_tenant_charge BEFORE INSERT OR UPDATE ON run_limits FOR EACH ROW EXECUTE FUNCTION fail_tenant_charge();
      `),
    );
    try {
      const before = await runCount();
      const res = await call(a, load);
      expect(res.status).toBe(503);
      expect(await runCount()).toBe(before);
    } finally {
      await asOwner(() => t.pglite.exec("DROP TRIGGER fail_tenant_charge ON run_limits; DROP FUNCTION fail_tenant_charge();"));
    }
    // No other test runs on this day, so the org's spend is this run's reservation alone.
    const day = new Date(Date.parse("2026-10-06T00:00:00Z"));
    const spent = await t.db.withNoTenant((tx) => authRepositories.runLimits.used(tx, hashRunLimitKey(`spend:${internal.orgId}:org`), day));
    expect(spent).toBe(reserve);
  });
});

describe("limit ports", () => {
  const agent = (tokenId: string, orgId = internal.orgId): TenantContext => ({
    orgId,
    actor: { type: "agent", tokenId, userId: Object.values(internal.userIds)[0] as string, role: "owner", scopes: ["run"], setIds: null, client: "cli" },
    client: "cli",
    plan: "internal",
    requestId: "r",
  });
  const TOKEN_A = "0193a000-0000-7000-8000-00000000a001";
  const TOKEN_B = "0193a000-0000-7000-8000-00000000a002";
  const T1 = Date.parse("2026-10-01T15:00:00Z");
  const DAY1 = new Date(Date.parse("2026-10-01T00:00:00Z"));
  let orgSeq = 0;
  /** A fresh org id per test, so org-wide counts never carry over. */
  const freshOrg = () => `0193b000-0000-7000-8000-${String(++orgSeq).padStart(12, "0")}`;
  const spentBy = (subject: string) => t.db.withNoTenant((tx) => authRepositories.runLimits.used(tx, hashRunLimitKey(`spend:${subject}`), DAY1));
  const record = (usd: number, escalationUsd = 0) =>
    ({ result: { cost: { systemOneCostUsd: usd, escalationCostUsd: escalationUsd } } }) as unknown as RunSinkRecord;
  const settle = (cap: ReturnType<typeof createDbSpendCap>, ctx: TenantContext, r: RunSinkRecord) =>
    t.db.withTenant(sys(ctx.orgId), (tx) => cap.settle(tx, ctx, r));

  it("shares one count between two limiter instances, per token", async () => {
    const limits = open({ runsPerWindow: 3 });
    const one = createDbRunLimiter(t.db, limits, () => T1);
    const two = createDbRunLimiter(t.db, limits, () => T1 + 15_000);
    const results = [await one(agent(TOKEN_A), "jev", 1, "run"), await two(agent(TOKEN_A), "jev", 1, "run"), await one(agent(TOKEN_A), "jev", 1, "run")];
    expect(results.every((r) => r.ok)).toBe(true);
    expect(await two(agent(TOKEN_A), "jev", 1, "run")).toEqual({ ok: false, retryAfterMs: 45_000, reason: "key" });
    expect(await one(agent(TOKEN_B), "jev", 1, "run")).toEqual({ ok: true });
  });

  it("refuses at the org's rate with reason org, and counts nothing for the caller it refused", async () => {
    const org = freshOrg();
    const tight = createDbRunLimiter(t.db, open({ runsPerWindow: 2, orgRunsPerWindow: 2 }), () => T1);
    expect(await tight(agent(TOKEN_A, org), "jev", 1, "run")).toEqual({ ok: true });
    expect(await tight(agent(TOKEN_B, org), "jev", 1, "run")).toEqual({ ok: true });
    expect(await tight(agent(TOKEN_A, org), "jev", 1, "run")).toEqual({ ok: false, retryAfterMs: 60_000, reason: "org" });
    // The org refusal rolled back the caller's take, so token A has used 1 of its 2, not 2.
    const roomier = createDbRunLimiter(t.db, open({ runsPerWindow: 2 }), () => T1);
    expect(await roomier(agent(TOKEN_A, org), "jev", 1, "run")).toEqual({ ok: true });
    expect(await roomier(agent(TOKEN_A, org), "jev", 1, "run")).toMatchObject({ ok: false, reason: "key" });
    // Another org is not touched by this one's count.
    expect(await tight(agent(TOKEN_A, freshOrg()), "jev", 1, "run")).toEqual({ ok: true });
  });

  it("reserves spend before the call, so runs that start together cannot all pass the cap", async () => {
    const org = freshOrg();
    const cap = createDbSpendCap(t.db, open({ dailySpendCapMicroUsd: 3_000, runSpendReserveMicroUsd: 1_000 }), () => T1);
    const ctxs = [1, 2, 3, 4].map(() => agent(TOKEN_A, org));
    // Four runs reach the quota before any of them is stored.
    const results = [];
    for (const ctx of ctxs) results.push(await cap.quota(ctx, "jev", 1));
    expect(results).toEqual([{ ok: true }, { ok: true }, { ok: true }, { ok: false, code: "token_budget_exceeded" }]);
    expect(await spentBy(`${org}:agent:${TOKEN_A}`)).toBe(3_000);
    expect(await spentBy(`${org}:org`)).toBe(3_000);
  });

  it("settles a reservation to the run's real cost, for the caller and the org", async () => {
    const org = freshOrg();
    const cap = createDbSpendCap(t.db, open({ runSpendReserveMicroUsd: 1_000 }), () => T1);
    const over = agent(TOKEN_A, org);
    expect(await cap.quota(over, "jev", 1)).toEqual({ ok: true });
    await settle(cap, over, record(0.0015));
    expect(await spentBy(`${org}:agent:${TOKEN_A}`)).toBe(1_500);
    const under = agent(TOKEN_B, org);
    expect(await cap.quota(under, "jev", 1)).toEqual({ ok: true });
    await settle(cap, under, record(0.0001, 0.0001));
    expect(await spentBy(`${org}:agent:${TOKEN_B}`)).toBe(200);
    expect(await spentBy(`${org}:org`)).toBe(1_700);
  });

  it("charges nothing for a refused run, and gives back the whole reservation of a run that cost nothing", async () => {
    const org = freshOrg();
    const cap = createDbSpendCap(t.db, open({ runSpendReserveMicroUsd: 1_000 }), () => T1);
    // Refused before the quota: nothing reserved, nothing charged.
    await settle(cap, agent(TOKEN_A, org), record(0));
    expect(await spentBy(`${org}:agent:${TOKEN_A}`)).toBe(0);
    const ctx = agent(TOKEN_A, org);
    expect(await cap.quota(ctx, "jev", 1)).toEqual({ ok: true });
    expect(await spentBy(`${org}:agent:${TOKEN_A}`)).toBe(1_000);
    await settle(cap, ctx, record(0));
    expect(await spentBy(`${org}:agent:${TOKEN_A}`)).toBe(0);
    expect(await spentBy(`${org}:org`)).toBe(0);
  });

  it("lets a run start one reservation below the cap and refuses it at the cap, in every quota instance", async () => {
    const org = freshOrg();
    const subject = `${org}:agent:${TOKEN_A}`;
    const limits = open({ dailySpendCapMicroUsd: 2_000, runSpendReserveMicroUsd: 1 });
    const q1 = createDbSpendCap(t.db, limits, () => T1);
    const q2 = createDbSpendCap(t.db, limits, () => T1 + 60_000);
    await t.db.withNoTenant((tx) => authRepositories.runLimits.charge(tx, { keyHash: hashRunLimitKey(`spend:${subject}`), windowStart: DAY1, amount: 1_998 }));
    // Spent 1998 of 2000: cap - 2, then cap - 1, still room for a reservation of 1.
    expect(await q1.quota(agent(TOKEN_A, org), "jev", 1)).toEqual({ ok: true });
    expect(await q2.quota(agent(TOKEN_A, org), "jev", 1)).toEqual({ ok: true });
    expect(await spentBy(subject)).toBe(2_000);
    // At the cap.
    expect(await q1.quota(agent(TOKEN_A, org), "jev", 1)).toEqual({ ok: false, code: "token_budget_exceeded" });
    expect(await q2.quota(agent(TOKEN_A, org), "jev", 1)).toEqual({ ok: false, code: "token_budget_exceeded" });
    expect(await q2.quota(agent(TOKEN_B, org), "jev", 1)).toEqual({ ok: true });
  });

  it("prunes old windows on the way and leaves the live window alone", async () => {
    const org = freshOrg();
    const oldKey = hashRunLimitKey(`rate:${org}:old`);
    await t.db.withNoTenant((tx) => authRepositories.runLimits.charge(tx, { keyHash: oldKey, windowStart: new Date(T1 - 3 * 24 * 60 * 60 * 1000), amount: 5 }));
    const limiter = createDbRunLimiter(t.db, open({ runsPerWindow: 2 }), () => T1);
    expect(await limiter(agent(TOKEN_A, org), "jev", 1, "run")).toEqual({ ok: true });
    expect(await limiter(agent(TOKEN_A, org), "jev", 1, "run")).toEqual({ ok: true });
    expect(await limiter(agent(TOKEN_A, org), "jev", 1, "run")).toMatchObject({ ok: false });
    const rows = await asOwner(
      async () => (await t.pglite.query<{ n: number }>("select count(*)::int as n from run_limits where key_hash = $1", [oldKey])).rows[0]?.n,
    );
    expect(rows).toBe(0);
  });

  it("keys a limit by org and by token, key or user, never by a shared bucket", () => {
    expect(limitSubject(agent(TOKEN_A))).toBe(`${internal.orgId}:agent:${TOKEN_A}`);
    const user: TenantContext = {
      ...agent(TOKEN_A),
      actor: { type: "user", userId: TOKEN_B, role: "owner", platformRole: null, impersonatorId: null },
      client: "console",
    };
    expect(limitSubject(user)).toBe(`${internal.orgId}:user:${TOKEN_B}`);
    expect(limitSubject({ ...agent(TOKEN_A), orgId: TOKEN_B })).not.toBe(limitSubject(agent(TOKEN_A)));
  });
});
