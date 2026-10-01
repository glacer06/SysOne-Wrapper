// App tokens (sk_live_, sk_test_, pk_live_) and agent tokens (sa_live_): minting, parsing and
// hashing (security.md, App tokens and Agent tokens).
//
// A token is `<prefix><org>_<secret>`. `<org>` is the org id as 32 lowercase hex characters, so
// the server can look the token up inside that org's normal tenant scope (RLS on app.org_id) and
// needs no pre-org lookup across every org's tokens. The org id is not a secret; the 32 random
// bytes are. Changing the org part only moves the lookup to another org, where the hash matches
// nothing.
//
// Only the hash is stored: HMAC-SHA256 keyed by the server pepper (BANDWISE_TOKEN_PEPPER), as
// hex. A leaked table without the pepper gives nothing to test guesses against.

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { OrgId } from "@bandwise/core/contracts";

export const APP_TOKEN_PREFIXES = ["sk_live_", "sk_test_", "pk_live_"] as const;
export const AGENT_TOKEN_PREFIX = "sa_live_";
export const TOKEN_PREFIXES = [...APP_TOKEN_PREFIXES, AGENT_TOKEN_PREFIX] as const;
export type TokenPrefix = (typeof TOKEN_PREFIXES)[number];

/** The shortest pepper accepted: 32 bytes of entropy as base64url or hex is at least 43 chars. */
export const MIN_PEPPER_LENGTH = 32;

const TOKEN = /^(sk_live_|sk_test_|pk_live_|sa_live_)([0-9a-f]{32})_([A-Za-z0-9_-]{43})$/;

export class TokenPepperError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TokenPepperError";
  }
}

export interface ParsedToken {
  prefix: TokenPrefix;
  /** The org id the token names, as a uuid. Unverified until the hash matches in that org. */
  orgId: string;
}

/**
 * The prefix and org of a well-formed token, or null. Never throws. The org must pass the same
 * OrgId schema that withTenant applies, so 32 hex characters that are not a valid uuid (wrong
 * version or variant bits) end here as null, and the caller's 401, not as a ZodError later.
 */
export function parseToken(raw: string): ParsedToken | null {
  const m = TOKEN.exec(raw);
  if (m === null) return null;
  const hex = m[2] as string;
  const orgId = OrgId.safeParse(`${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`);
  if (!orgId.success) return null;
  return { prefix: m[1] as TokenPrefix, orgId: orgId.data };
}

export interface TokenHasher {
  /** The stored hash of a token. */
  hash(token: string): string;
  /** True when the token hashes to `stored`, compared in constant time. */
  matches(token: string, stored: string): boolean;
  /** A new token for the org and its hash. Show the token once; store only the hash. */
  mint(prefix: TokenPrefix, orgId: string): { token: string; hash: string };
}

export function createTokenHasher(pepper: string): TokenHasher {
  if (pepper.length < MIN_PEPPER_LENGTH) {
    throw new TokenPepperError(`BANDWISE_TOKEN_PEPPER must be at least ${MIN_PEPPER_LENGTH} characters.`);
  }
  const hash = (token: string): string => createHmac("sha256", pepper).update(token, "utf8").digest("hex");
  return {
    hash,
    matches(token, stored) {
      const a = Buffer.from(hash(token), "hex");
      const b = Buffer.from(stored, "hex");
      return a.length === b.length && timingSafeEqual(a, b);
    },
    mint(prefix, orgId) {
      // The same check parseToken applies, so a minted token always parses back to its org.
      if (orgId !== orgId.toLowerCase() || !OrgId.safeParse(orgId).success) throw new Error("mint needs the org id as a lowercase uuid.");
      const token = `${prefix}${orgId.replaceAll("-", "")}_${randomBytes(32).toString("base64url")}`;
      return { token, hash: hash(token) };
    },
  };
}

/** The pepper from the environment. Throws when it is missing or too short. */
export function tokenHasherFromEnv(env: Readonly<Record<string, string | undefined>>): TokenHasher {
  const pepper = env["BANDWISE_TOKEN_PEPPER"];
  if (pepper === undefined || pepper === "") throw new TokenPepperError("BANDWISE_TOKEN_PEPPER is not set.");
  return createTokenHasher(pepper);
}
