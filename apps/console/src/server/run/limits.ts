// Per-token limits for hosted runs, behind core's RateLimiter and QuotaGuard ports. Every hosted
// run is a real call on the platform key, so a leaked hook token must not be able to spend without
// limit. Two limits per caller (the agent token, the app key, or the person in a console session):
//
// - a run rate: at most HOSTED_RUNS_PER_WINDOW runs per HOSTED_RUN_WINDOW_MS, in fixed windows;
// - a daily spend cap: the System One and escalation cost of the caller's runs per UTC day, in
//   micro-USD. A run is refused once the day's recorded spend reaches the cap. The cost is the
//   one the engine reports in the run's envelope, charged when the run is stored, so one run in
//   flight can finish over the cap; the next one is refused.
//
// Both live in run_limits (migration 0008), one locked row per key, so they hold across every
// server instance. Keys are hashed before they reach the database. The engine turns a refusal into
// rate_limited (429) or token_budget_exceeded (402).

import {
  microFromUsd,
  type QuotaGuard,
  type RateLimiter,
  type RunSink,
  type TenantContext,
} from "@bandwise/core";
import { authRepositories, type BandwiseDb } from "@bandwise/db";
import { hashRunLimitKey } from "@bandwise/tenancy";

/** Runs one caller may start per window. */
export const HOSTED_RUNS_PER_WINDOW = 120;
/** The rate window: one minute. */
export const HOSTED_RUN_WINDOW_MS = 60_000;
/** System One spend one caller may start per UTC day, in micro-USD: 5 USD for dogfood. */
export const HOSTED_DAILY_SPEND_CAP_MICRO_USD = 5_000_000;

const DAY_MS = 24 * 60 * 60 * 1000;
/** Windows older than this are deleted on the way; the longest window is a day. */
const KEEP_MS = 2 * DAY_MS;

export interface HostedRunLimits {
  runsPerWindow: number;
  windowMs: number;
  dailySpendCapMicroUsd: number;
}

export const HOSTED_RUN_LIMITS: HostedRunLimits = {
  runsPerWindow: HOSTED_RUNS_PER_WINDOW,
  windowMs: HOSTED_RUN_WINDOW_MS,
  dailySpendCapMicroUsd: HOSTED_DAILY_SPEND_CAP_MICRO_USD,
};

/** Who a limit counts for: the token or key, else the person, always inside the org. */
export function limitSubject(ctx: TenantContext): string {
  const a = ctx.actor;
  switch (a.type) {
    case "agent":
      return `${ctx.orgId}:agent:${a.tokenId}`;
    case "apiKey":
      return `${ctx.orgId}:app:${a.keyId}`;
    case "user":
      return `${ctx.orgId}:user:${a.userId}`;
    case "system":
      return `${ctx.orgId}:system`;
  }
}

const rateKey = (ctx: TenantContext) => hashRunLimitKey(`rate:${limitSubject(ctx)}`);
const spendKey = (ctx: TenantContext) => hashRunLimitKey(`spend:${limitSubject(ctx)}`);
const dayStart = (now: number) => new Date(Math.floor(now / DAY_MS) * DAY_MS);

/** The per-caller run rate, shared through the database. */
export function createDbRunLimiter(db: BandwiseDb, limits: HostedRunLimits = HOSTED_RUN_LIMITS, clock: () => number = Date.now): RateLimiter {
  return async (ctx) => {
    const now = clock();
    const start = Math.floor(now / limits.windowMs) * limits.windowMs;
    const keyHash = rateKey(ctx);
    const taken = await db.withNoTenant(async (tx) => {
      await authRepositories.runLimits.prune(tx, new Date(now - KEEP_MS));
      return authRepositories.runLimits.take(tx, { keyHash, windowStart: new Date(start), amount: 1, max: limits.runsPerWindow });
    });
    return taken.ok ? { ok: true } : { ok: false, retryAfterMs: Math.max(0, start + limits.windowMs - now), reason: "key" };
  };
}

/** The per-caller daily spend cap, read from what chargeRunSpend recorded today. */
export function createDbSpendQuota(db: BandwiseDb, limits: HostedRunLimits = HOSTED_RUN_LIMITS, clock: () => number = Date.now): QuotaGuard {
  return async (ctx) => {
    const spent = await db.withNoTenant((tx) => authRepositories.runLimits.used(tx, spendKey(ctx), dayStart(clock())));
    return spent >= limits.dailySpendCapMicroUsd ? { ok: false, code: "token_budget_exceeded" } : { ok: true };
  };
}

/**
 * Wraps the RunSink so every stored run adds its cost to the caller's spend for today: the System
 * One cost and the escalation cost from the envelope, as the engine reported them. Linked fallback
 * runs are stored through the same sink, so they count too.
 */
export function chargeRunSpend(sink: RunSink, db: BandwiseDb, clock: () => number = Date.now): RunSink {
  return {
    async persist(ctx, record) {
      const stored = await sink.persist(ctx, record);
      const cost = record.result.cost;
      const amount = microFromUsd(cost.systemOneCostUsd ?? 0) + microFromUsd(cost.escalationCostUsd);
      if (amount > 0) {
        await db.withNoTenant((tx) => authRepositories.runLimits.charge(tx, { keyHash: spendKey(ctx), windowStart: dayStart(clock()), amount }));
      }
      return stored;
    },
  };
}
