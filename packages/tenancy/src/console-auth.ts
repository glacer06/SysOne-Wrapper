// Hashes and codes for console sign-in (D3, PJ's review of PR #21): attempt-limit keys and the
// admin-issued two-factor enrollment codes. Here because tenancy is the only package that touches
// crypto.

import { createHash, randomBytes } from "node:crypto";

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
