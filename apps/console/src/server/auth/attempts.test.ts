import { describe, expect, it } from "vitest";

import { createAttemptLimiter } from "./attempts";

describe("attempt limiter", () => {
  it("allows up to the limit per key, counts nothing when refused, and resets with the window", () => {
    let now = 1_000_000;
    const limiter = createAttemptLimiter(() => now);
    const ip = { key: "ip:a", limit: { max: 3, windowMs: 1000 } };
    const email = { key: "email:x", limit: { max: 2, windowMs: 1000 } };

    expect(limiter.take([ip, email])).toBe(true);
    expect(limiter.take([ip, email])).toBe(true);
    // The email is at its limit, so the IP is not charged either.
    expect(limiter.take([ip, email])).toBe(false);
    expect(limiter.take([ip])).toBe(true);
    expect(limiter.take([ip])).toBe(false);

    now += 1000;
    expect(limiter.take([ip, email])).toBe(true);
  });
});
