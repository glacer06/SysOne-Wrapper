// Hashes and codes for console sign-in (D3, PJ's review of PR #21): attempt-limit keys and the
// admin-issued two-factor enrollment codes. Here because tenancy is the only package that touches
// crypto.

import { createHash, createHmac, randomBytes } from "node:crypto";

/** SHA-256 of a sign-in limit key, so auth_attempts never holds an email or an IP in the clear. */
export function hashAttemptKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

/** 32 letters and digits with the look-alikes (I, O, 0, 1) left out. 256 is a multiple of 32, so no bias. */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** 16 characters (80 bits), shown as four groups of four, like ABCD-EFGH-JKLM-NPQR. */
export function generateEnrollmentCode(): string {
  const chars = [...randomBytes(16)].map((b) => ALPHABET[b % ALPHABET.length] ?? "A").join("");
  return [0, 4, 8, 12].map((i) => chars.slice(i, i + 4)).join("-");
}

/** Case, spaces and dashes do not matter when the person types the code. */
export function hashEnrollmentCode(code: string): string {
  const normal = code.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return createHash("sha256").update(`bandwise-enrollment:${normal}`).digest("hex");
}

const SESSION_TOKEN_LABEL = "bandwise:console:session-token:v1";

/**
 * Hashes console session tokens before they reach the sessions table, so a read of that table
 * cannot be replayed as a cookie. HMAC-SHA256 hex (64 characters) under a key derived from
 * AUTH_SECRET; the secret itself is never the HMAC key. Changing AUTH_SECRET already signs everyone
 * out, and it also orphans every stored hash, which is the same outcome.
 */
export function createSessionTokenHasher(secret: string): (token: string) => string {
  if (secret.length === 0) throw new Error("session token hasher: empty secret");
  const key = createHmac("sha256", secret).update(SESSION_TOKEN_LABEL).digest();
  return (token) => createHmac("sha256", key).update(token).digest("hex");
}
