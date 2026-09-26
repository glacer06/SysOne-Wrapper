// In-memory QuotaGuard (ports.ts) for dev and tests. It checks:
//   - the plan's runs per month for the org (402 quota_exceeded at the limit), counted per UTC month;
//   - an agent token's daily spend cap (402 token_budget_exceeded), counted per UTC day from the
//     System One cost the caller records after each run.
// An allowed check counts one run. Phase 2 reads usage_daily plus a same-day Redis counter instead
// (ADR-006), behind the same port.

import type { QuotaGuard, QuotaResult, TenantContext } from "@sysone/core/contracts";

export interface InMemoryQuotaGuardOptions {
  /** The org's runs per month, or null for unlimited. */
  runsPerMonth(ctx: TenantContext): number | null;
  /** agent_tokens.daily_spend_cap_micro_usd for an agent actor, or null for none. */
  tokenDailyCapMicroUsd?(ctx: TenantContext): number | null;
  /** Epoch ms. */
  clock?: () => number;
}

export interface InMemoryQuotaGuard extends QuotaGuard {
  /** Adds a finished run's System One cost to the agent token's spend for today. */
  recordSpend(ctx: TenantContext, microUsd: number): void;
  reset(): void;
}

function monthKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 7);
}

function dayKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function createInMemoryQuotaGuard(opts: InMemoryQuotaGuardOptions): InMemoryQuotaGuard {
  const clock = opts.clock ?? Date.now;
  const runs = new Map<string, number>();
  const spend = new Map<string, number>();

  const guard: QuotaGuard = async (ctx, _model, _estTokens): Promise<QuotaResult> => {
    const now = clock();
    if (ctx.actor.type === "agent") {
      const cap = opts.tokenDailyCapMicroUsd?.(ctx) ?? null;
      const spent = spend.get(`${ctx.actor.tokenId}:${dayKey(now)}`) ?? 0;
      if (cap !== null && spent >= cap) return { ok: false, code: "token_budget_exceeded" };
    }
    const limit = opts.runsPerMonth(ctx);
    const key = `${ctx.orgId}:${monthKey(now)}`;
    const used = runs.get(key) ?? 0;
    if (limit !== null && used >= limit) return { ok: false, code: "quota_exceeded" };
    runs.set(key, used + 1);
    return { ok: true };
  };

  return Object.assign(guard, {
    recordSpend(ctx: TenantContext, microUsd: number) {
      if (ctx.actor.type !== "agent") return;
      const key = `${ctx.actor.tokenId}:${dayKey(clock())}`;
      spend.set(key, (spend.get(key) ?? 0) + microUsd);
    },
    reset() {
      runs.clear();
      spend.clear();
    },
  });
}
