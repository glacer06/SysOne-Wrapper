import { describe, expect, it } from "vitest";

import { createTokenHasher, parseToken, TokenPepperError, tokenHasherFromEnv } from "./tokens.js";

const PEPPER = "p".repeat(40);
const ORG = "0192f5a4-1b2c-7d3e-8f40-123456789abc";

describe("tokens", () => {
  it("mints a token that parses back to its prefix and org", () => {
    const h = createTokenHasher(PEPPER);
    for (const prefix of ["sk_live_", "sk_test_", "pk_live_", "sa_live_"] as const) {
      const { token, hash } = h.mint(prefix, ORG);
      expect(token.startsWith(`${prefix}0192f5a41b2c7d3e8f40123456789abc_`)).toBe(true);
      expect(parseToken(token)).toEqual({ prefix, orgId: ORG });
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
      expect(h.hash(token)).toBe(hash);
      expect(h.matches(token, hash)).toBe(true);
    }
  });

  it("gives every mint a different secret", () => {
    const h = createTokenHasher(PEPPER);
    expect(h.mint("sk_live_", ORG).token).not.toBe(h.mint("sk_live_", ORG).token);
  });

  it("hashes with the pepper, so another pepper matches nothing", () => {
    const { token, hash } = createTokenHasher(PEPPER).mint("sa_live_", ORG);
    expect(createTokenHasher("q".repeat(40)).matches(token, hash)).toBe(false);
    expect(createTokenHasher(PEPPER).matches(`${token.slice(0, -1)}A`, hash)).toBe(false);
  });

  it("parses nothing that is not exactly a token", () => {
    const { token } = createTokenHasher(PEPPER).mint("sk_live_", ORG);
    for (const bad of ["", "sk_live_", `${token}x`, ` ${token}`, token.replace("sk_live_", "sk_prod_"), token.toUpperCase(), token.replace(/_([^_]+)$/, "_short")]) {
      expect(parseToken(bad)).toBeNull();
    }
  });

  it("refuses a missing or short pepper and a malformed org", () => {
    expect(() => createTokenHasher("short")).toThrow(TokenPepperError);
    expect(() => tokenHasherFromEnv({})).toThrow("BANDWISE_TOKEN_PEPPER is not set.");
    expect(() => createTokenHasher(PEPPER).mint("sk_live_", "not-a-uuid")).toThrow();
  });
});
