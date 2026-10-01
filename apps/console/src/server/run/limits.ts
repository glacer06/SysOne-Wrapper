// Limits for hosted runs, behind core's RateLimiter and QuotaGuard ports. Every hosted run is a real
// call on the platform key, so a leaked hook token must not be able to spend without limit, and
// minting more tokens must not buy more budget. Each limit holds at two levels: per caller (the
// agent token, the app key, or the person in a console session) and per org, over every caller.
//
// - a run rate: at most runsPerWindow runs per caller and orgRunsPerWindow runs per org in each
//   windowMs, in fixed windows;
// - a daily spend cap: the System One and escalation cost per UTC day, in micro-USD, per caller
//   (dailySpendCapMicroUsd) and per org (orgDailySpendCapMicroUsd).
//
// Spend is reserved before the run calls System One: the quota takes runSpendReserveMicroUsd from
// both day windows in one locked step, and refuses the run when either would pass its cap. So runs
// that start at the same time cannot all pass a check that reads the same total. When the run is
// stored, the reservation is settled to the run's real cost in the run's own transaction: the extra
// is charged, or the unused part given back. A charge that fails rolls the run row back with it, so
// a stored run is always counted. A run can still finish over the cap by what it cost beyond its
// reservation; the next one is refused. A run that fails before it is stored keeps its reservation.
//
// All of it lives in run_limits (migration 0008), one locked row per key, so the limits hold across
// every server instance. Keys are hashed before they reach the database. The engine turns a
// refusal into rate_limited (429) or token_budget_exceeded (402).

import {
  microFromUsd,
  type QuotaGuard,
  type RateLimiter,
  type RunSinkRecord,
  type TenantContext,
} from "@bandwise/core";
import { type AnyTx, authRepositories, type BandwiseDb, type TenantTx } from "@bandwise/db";
import { hashRunLimitKey } from "@bandwise/tenancy";

/** Runs one caller may start per window. */
export const HOSTED_RUNS_PER_WINDOW = 120;
/** Runs one org may start per window, over all its callers. */
export const HOSTED_ORG_RUNS_PER_WINDOW = 300;
/** The rate window: one minute. */
export const HOSTED_RUN_WINDOW_MS = 60_000;
/** System One spend one caller may start per UTC day, in micro-USD: 5 USD for dogfood. */
export const HOSTED_DAILY_SPEND_CAP_MICRO_USD = 5_000_000;
/** System One spend one org may start per UTC day, over all its callers: 20 USD for dogfood. */
export const HOSTED_ORG_DAILY_SPEND_CAP_MICRO_USD = 20_000_000;
/** What each run reserves before it calls System One: 1 cent, well above a typical run. */
export const HOSTED_RUN_SPEND_RESERVE_MICRO_USD = 10_000;

const DAY_MS = 24 * 60 * 60 * 1000;
/** Windows older than this are deleted on the way; the longest window is a day. */
const KEEP_MS = 2 * DAY_MS;

export interface HostedRunLimits {
  runsPerWindow: number;
  orgRunsPerWindow: number;
  windowMs: number;
  dailySpendCapMicroUsd: number;
  orgDailySpendCapMicroUsd: number;
  /** Reserved per run before the System One call, settled to the real cost when the run is stored. */
  runSpendReserveMicroUsd: number;
}

export const HOSTED_RUN_LIMITS: HostedRunLimits = {
  runsPerWindow: HOSTED_RUNS_PER_WINDOW,
  orgRunsPerWindow: HOSTED_ORG_RUNS_PER_WINDOW,
  windowMs: HOSTED_RUN_WINDOW_MS,
  dailySpendCapMicroUsd: HOSTED_DAILY_SPEND_CAP_MICRO_USD,
  orgDailySpendCapMicroUsd: HOSTED_ORG_DAILY_SPEND_CAP_MICRO_USD,
  runSpendReserveMicroUsd: HOSTED_RUN_SPEND_RESERVE_MICRO_USD,
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

/** The org-wide subject. The caller kinds above never produce this form, so the keys cannot meet. */
const orgSubject = (ctx: TenantContext) => `${ctx.orgId}:org`;

const rateKey = (subject: string) => hashRunLimitKey(`rate:${subject}`);
const spendKey = (subject: string) => hashRunLimitKey(`spend:${subject}`);
const dayStart = (now: number) => new Date(Math.floor(now / DAY_MS) * DAY_MS);

/** Thrown inside a limit transaction to undo the takes it already made. */
class Refused extends Error {
  constructor(readonly level: "key" | "org") {
    super(`refused at ${level}`);
  }
}

/**
 * Takes `amount` from every key in one transaction, or nothing: when one key would pass its max,
 * the takes already made are rolled back. Keys go in a fixed order (caller, then org).
 */
async function takeAll(
  db: BandwiseDb,
  windowStart: Date,
  keys: readonly { keyHash: string; max: number; level: "key" | "org" }[],
  amount: number,
  before?: (tx: AnyTx) => Promise<void>,
): Promise<{ ok: true } | { ok: false; level: "key" | "org" }> {
  try {
    await db.withNoTenant(async (tx) => {
      if (before !== undefined) await before(tx);
      for (const k of keys) {
        const taken = await authRepositories.runLimits.take(tx, { keyHash: k.keyHash, windowStart, amount, max: k.max });
        if (!taken.ok) throw new Refused(k.level);
      }
    });
    return { ok: true };
  } catch (e) {
    if (e instanceof Refused) return { ok: false, level: e.level };
    throw e;
  }
}

/** The run rate per caller and per org, shared through the database. */
export function createDbRunLimiter(db: BandwiseDb, limits: HostedRunLimits = HOSTED_RUN_LIMITS, clock: () => number = Date.now): RateLimiter {
  return async (ctx) => {
    const now = clock();
    const start = Math.floor(now / limits.windowMs) * limits.windowMs;
    const taken = await takeAll(
      db,
      new Date(start),
      [
        { keyHash: rateKey(limitSubject(ctx)), max: limits.runsPerWindow, level: "key" },
        { keyHash: rateKey(orgSubject(ctx)), max: limits.orgRunsPerWindow, level: "org" },
      ],
      1,
      (tx) => authRepositories.runLimits.prune(tx, new Date(now - KEEP_MS)),
    );
    return taken.ok ? { ok: true } : { ok: false, retryAfterMs: Math.max(0, start + limits.windowMs - now), reason: taken.level };
  };
}

/** A reservation the quota took, waiting for the run to be stored. */
interface Reservation {
  day: Date;
  amount: number;
}

export interface HostedSpendCap {
  /** Reserves the run's spend for today, per caller and per org, or refuses the run. */
  quota: QuotaGuard;
  /** The RunSink hook: settles the reservation to the run's real cost, in the run's transaction. */
  settle: (tx: TenantTx, ctx: TenantContext, record: RunSinkRecord) => Promise<void>;
}

/** What a stored run cost: its System One and escalation cost, as the engine reported them. */
export function runSpendMicroUsd(record: RunSinkRecord): number {
  const cost = record.result.cost;
  return microFromUsd(cost.systemOneCostUsd ?? 0) + microFromUsd(cost.escalationCostUsd);
}

/**
 * The daily spend cap, per caller and per org. The quota and the settle step share the
 * reservations they hand over, keyed by the run's context object (the engine passes the same one
 * to both), so a run refused before the quota, which reserved nothing, is charged in full.
 */
export function createDbSpendCap(db: BandwiseDb, limits: HostedRunLimits = HOSTED_RUN_LIMITS, clock: () => number = Date.now): HostedSpendCap {
  const pending = new WeakMap<TenantContext, Reservation[]>();
  const keys = (ctx: TenantContext) => [spendKey(limitSubject(ctx)), spendKey(orgSubject(ctx))];
  return {
    async quota(ctx) {
      const day = dayStart(clock());
      const amount = limits.runSpendReserveMicroUsd;
      const [caller, org] = keys(ctx) as [string, string];
      const taken = await takeAll(
        db,
        day,
        [
          { keyHash: caller, max: limits.dailySpendCapMicroUsd, level: "key" },
          { keyHash: org, max: limits.orgDailySpendCapMicroUsd, level: "org" },
        ],
        amount,
      );
      if (!taken.ok) return { ok: false, code: "token_budget_exceeded" };
      pending.set(ctx, [...(pending.get(ctx) ?? []), { day, amount }]);
      return { ok: true };
    },
    async settle(tx, ctx, record) {
      const actual = runSpendMicroUsd(record);
      const held = pending.get(ctx) ?? [];
      const reservation = held.shift();
      const reserved = reservation?.amount ?? 0;
      for (const keyHash of keys(ctx)) {
        if (actual > reserved) {
          await authRepositories.runLimits.charge(tx, { keyHash, windowStart: dayStart(clock()), amount: actual - reserved });
        } else if (reservation !== undefined && reserved > actual) {
          await authRepositories.runLimits.release(tx, { keyHash, windowStart: reservation.day, amount: reserved - actual });
        }
      }
    },
  };
}
