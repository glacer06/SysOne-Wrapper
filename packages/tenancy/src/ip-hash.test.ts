import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import { hashClientIp } from "./ip-hash.js";

const SECRET = "s".repeat(32);

describe("hashClientIp", () => {
  it("is stable per IP and secret, and differs across either", () => {
    expect(hashClientIp(SECRET, "203.0.113.7")).toBe(hashClientIp(SECRET, "203.0.113.7"));
    expect(hashClientIp(SECRET, "203.0.113.7")).not.toBe(hashClientIp(SECRET, "203.0.113.8"));
    expect(hashClientIp(SECRET, "203.0.113.7")).not.toBe(hashClientIp("t".repeat(32), "203.0.113.7"));
  });

  it("returns 64 hex characters, also for an unknown IP", () => {
    expect(hashClientIp(SECRET, "203.0.113.7")).toMatch(/^[0-9a-f]{64}$/);
    expect(hashClientIp(SECRET, null)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("never uses the secret itself as the HMAC key", () => {
    const direct = createHmac("sha256", SECRET).update("203.0.113.7").digest("hex");
    expect(hashClientIp(SECRET, "203.0.113.7")).not.toBe(direct);
  });
});
