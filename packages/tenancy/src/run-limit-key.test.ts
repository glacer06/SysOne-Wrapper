import { describe, expect, it } from "vitest";

import { hashAttemptKey } from "./console-auth.js";
import { hashRunLimitKey } from "./run-limit-key.js";

describe("hashRunLimitKey", () => {
  it("is a stable hex SHA-256 that hides the key and differs from a sign-in limit hash", () => {
    const key = "rate:0193a000-0000-7000-8000-000000000001:agent:0193a000-0000-7000-8000-000000000002";
    const h = hashRunLimitKey(key);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(hashRunLimitKey(key)).toBe(h);
    expect(h).not.toContain("0193a000");
    expect(h).not.toBe(hashAttemptKey(key));
    expect(hashRunLimitKey(`${key}x`)).not.toBe(h);
  });
});
