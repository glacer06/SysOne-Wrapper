// Hashes for the hosted run limits (migration 0008). Here because tenancy is the only package that
// touches crypto.

import { createHash } from "node:crypto";

/**
 * SHA-256 of a run limit key, with a domain prefix so it never equals a sign-in limit hash. The
 * key names an org and a token, key or user id; run_limits stores only this hash.
 */
export function hashRunLimitKey(key: string): string {
  return createHash("sha256").update(`bandwise-run-limit:${key}`).digest("hex");
}
