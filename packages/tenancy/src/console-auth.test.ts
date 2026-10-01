import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import { createSessionTokenHasher, generateEnrollmentCode, hashAttemptKey, hashEnrollmentCode } from "./console-auth.js";

describe("console auth hashes", () => {
  it("hashes attempt keys to 64 hex characters that do not contain the key", () => {
    const h = hashAttemptKey("sign-in:email:ada@x.test");
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(h).not.toContain("ada");
  });

  it("makes enrollment codes in four groups from the unambiguous alphabet", () => {
    for (let i = 0; i < 50; i++) expect(generateEnrollmentCode()).toMatch(/^[A-HJ-NP-Z2-9]{4}(-[A-HJ-NP-Z2-9]{4}){3}$/);
    expect(generateEnrollmentCode()).not.toBe(generateEnrollmentCode());
  });

  it("hashes a code the same however it is typed", () => {
    const code = "ABCD-EFGH-JKLM-NPQR";
    expect(hashEnrollmentCode("abcd efgh jklm npqr")).toBe(hashEnrollmentCode(code));
    expect(hashEnrollmentCode("ABCD-EFGH-JKLM-NPQS")).not.toBe(hashEnrollmentCode(code));
  });
});

describe("session token hasher", () => {
  const SECRET = "s".repeat(32);

  it("is stable per token and secret, 64 hex characters, and differs across either", () => {
    const hash = createSessionTokenHasher(SECRET);
    expect(hash("tok-a")).toMatch(/^[0-9a-f]{64}$/);
    expect(hash("tok-a")).toBe(createSessionTokenHasher(SECRET)("tok-a"));
    expect(hash("tok-a")).not.toBe(hash("tok-b"));
    expect(hash("tok-a")).not.toBe(createSessionTokenHasher("t".repeat(32))("tok-a"));
  });

  it("never uses the secret itself as the HMAC key and never returns the token", () => {
    const hash = createSessionTokenHasher(SECRET);
    expect(hash("tok-a")).not.toBe(createHmac("sha256", SECRET).update("tok-a").digest("hex"));
    expect(hash("tok-a")).not.toContain("tok-a");
  });

  it("refuses an empty secret", () => {
    expect(() => createSessionTokenHasher("")).toThrow();
  });
});
