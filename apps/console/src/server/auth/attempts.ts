// Attempt limits for the sign-in pages. Each key gets a fixed window.
//
// The console uses createDbAttemptLimiter: the windows live in auth_attempts (migration 0007), so
// the limits hold across every server instance (PJ's review of PR #21). Keys are hashed before they
// reach the database. createAttemptLimiter keeps the same rules in memory, for tests.

import { authRepositories, type BandwiseDb } from "@bandwise/db";
import { hashAttemptKey } from "@bandwise/tenancy";

export interface AttemptLimit {
  max: number;
  windowMs: number;
}

export interface AttemptLimiter {
  /** Counts one attempt for every key. False when any key is already at its limit; then nothing is counted. */
  take(keys: readonly { key: string; limit: AttemptLimit }[]): Promise<boolean>;
}

/** At most this many keys are kept; the oldest windows go first. */
const MAX_KEYS = 10_000;

export function createAttemptLimiter(clock: () => number = Date.now): AttemptLimiter & { reset(): void } {
  const windows = new Map<string, { start: number; count: number }>();
  return {
    async take(keys) {
      const now = clock();
      const current = keys.map(({ key, limit }) => {
        const w = windows.get(key);
        const live = w !== undefined && now - w.start < limit.windowMs ? w : { start: now, count: 0 };
        return { key, limit, w: live };
      });
      if (current.some(({ limit, w }) => w.count >= limit.max)) return false;
      for (const { key, w } of current) {
        windows.delete(key);
        windows.set(key, { start: w.start, count: w.count + 1 });
      }
      while (windows.size > MAX_KEYS) {
        const oldest = windows.keys().next().value;
        if (oldest === undefined) break;
        windows.delete(oldest);
      }
      return true;
    },
    reset() {
      windows.clear();
    },
  };
}

/** The shared limiter: one transaction per attempt, rows locked, in auth_attempts. */
export function createDbAttemptLimiter(db: BandwiseDb, clock: () => number = Date.now): AttemptLimiter {
  return {
    take(keys) {
      const rows = keys.map(({ key, limit }) => ({ keyHash: hashAttemptKey(key), max: limit.max, windowMs: limit.windowMs }));
      return db.withNoTenant((tx) => authRepositories.authAttempts.take(tx, rows, new Date(clock())));
    },
  };
}

const MINUTE = 60_000;

/** Sign-in: per IP and per email. Two-factor and reset: per IP (the library locks the account too). */
export const LIMITS = {
  signInPerIp: { max: 20, windowMs: 15 * MINUTE },
  signInPerEmail: { max: 5, windowMs: 15 * MINUTE },
  codePerIp: { max: 10, windowMs: 5 * MINUTE },
  resetPerIp: { max: 10, windowMs: 15 * MINUTE },
} as const satisfies Record<string, AttemptLimit>;
