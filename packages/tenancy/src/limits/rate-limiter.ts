// In-memory RateLimiter (ports.ts) for dev, tests and the Redis-down fallback (ADR-004 rule 6).
// Fixed one-minute windows, keyed by model:
//   - global: the per-model platform budget (about 1,000 RPM for jev-1.13.0). Eval requests may use
//     only `evalGlobalShare` of it, so they have the lowest priority.
//   - org: the org's RPM for the run bucket.
//   - eval: a separate bucket with `evalShare` (25 percent) of the org's RPM, so an agent iterating
//     on a set cannot starve production runs (security.md).
//   - key: the app or agent token's own RPM.
// A rejected request consumes nothing. Phase 2 replaces this with Redis Lua scripts behind the
// same port.

import type { RateLimiter, RateLimitResult, TenantContext } from "@sysone/core/contracts";

export interface InMemoryRateLimiterOptions {
  /** The org's RPM (plan limit with overrides). */
  orgRpm(ctx: TenantContext): number;
  /** The per-model global budget in RPM, or null for none. From platform settings, never a constant. */
  globalRpm(model: string): number | null;
  /** The calling token's RPM (app_tokens.rpm_limit), or null for none. */
  keyRpm?(ctx: TenantContext): number | null;
  /** Share of the org RPM the eval bucket gets. Default 0.25. */
  evalShare?: number;
  /** Share of the global budget eval requests may fill. Default 0.5. */
  evalGlobalShare?: number;
  /** Epoch ms. */
  clock?: () => number;
  windowMs?: number;
}

function actorKey(ctx: TenantContext): string | null {
  switch (ctx.actor.type) {
    case "apiKey":
      return `app:${ctx.actor.keyId}`;
    case "agent":
      return `agent:${ctx.actor.tokenId}`;
    default:
      return null;
  }
}

export interface InMemoryRateLimiter extends RateLimiter {
  reset(): void;
}

export function createInMemoryRateLimiter(opts: InMemoryRateLimiterOptions): InMemoryRateLimiter {
  const clock = opts.clock ?? Date.now;
  const windowMs = opts.windowMs ?? 60_000;
  const evalShare = opts.evalShare ?? 0.25;
  const evalGlobalShare = opts.evalGlobalShare ?? 0.5;
  const counts = new Map<string, number>();

  const limiter: RateLimiter = async (ctx, model, _estTokens, bucket): Promise<RateLimitResult> => {
    const now = clock();
    const windowStart = Math.floor(now / windowMs) * windowMs;
    const retryAfterMs = windowStart + windowMs - now;
    const k = (name: string) => `${windowStart}:${name}`;
    const used = (name: string) => counts.get(k(name)) ?? 0;

    const checks: { name: string; limit: number; reason: "global" | "org" | "eval" | "key" }[] = [];
    const global = opts.globalRpm(model);
    if (global !== null) {
      const limit = bucket === "eval" ? Math.floor(global * evalGlobalShare) : global;
      checks.push({ name: `platform:${model}`, limit, reason: "global" });
    }
    const orgRpm = opts.orgRpm(ctx);
    if (bucket === "eval") {
      checks.push({ name: `org:${ctx.orgId}:${model}:eval`, limit: Math.floor(orgRpm * evalShare), reason: "eval" });
    } else {
      checks.push({ name: `org:${ctx.orgId}:${model}:run`, limit: orgRpm, reason: "org" });
    }
    const key = actorKey(ctx);
    const keyRpm = opts.keyRpm?.(ctx) ?? null;
    if (key !== null && keyRpm !== null) checks.push({ name: `key:${key}:${model}`, limit: keyRpm, reason: "key" });

    for (const c of checks) {
      if (used(c.name) >= c.limit) return { ok: false, retryAfterMs, reason: c.reason };
    }
    for (const c of checks) counts.set(k(c.name), used(c.name) + 1);
    // Old windows are dropped lazily.
    for (const name of counts.keys()) {
      if (!name.startsWith(`${windowStart}:`)) counts.delete(name);
    }
    return { ok: true };
  };

  return Object.assign(limiter, { reset: () => counts.clear() });
}
