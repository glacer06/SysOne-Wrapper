import { randomBytes } from "node:crypto";

import { describe, expect, it } from "vitest";

import { KekConfigError, kekFromEnv, KekUnavailableError, LocalKekProvider, localKekId } from "./kek.js";
import { createVault, keyFingerprint, keyLast4 } from "./vault.js";

const ORG_A = "0192f000-0000-7000-8000-00000000000a";
const ORG_B = "0192f000-0000-7000-8000-00000000000b";
const ROW_1 = "0192f000-0000-7000-8000-000000000001";
const ROW_2 = "0192f000-0000-7000-8000-000000000002";
const SECRET = "ts_live_0123456789abcdefghijklmnopqrstuv";

const k1 = randomBytes(32);
const k2 = randomBytes(32);

describe("vault", () => {
  const vault = createVault(new LocalKekProvider([k1]));

  it("round-trips a secret and never stores the plaintext", async () => {
    const sealed = await vault.seal({ orgId: ORG_A }, "org_system_one_keys", ROW_1, SECRET);
    expect(JSON.stringify(sealed)).not.toContain(SECRET);
    expect(sealed.kekId).toBe(localKekId(k1));
    expect(await vault.open({ orgId: ORG_A }, "org_system_one_keys", ROW_1, sealed)).toBe(SECRET);
  });

  it("uses a fresh DEK and IV per seal", async () => {
    const a = await vault.seal({ orgId: ORG_A }, "org_system_one_keys", ROW_1, SECRET);
    const b = await vault.seal({ orgId: ORG_A }, "org_system_one_keys", ROW_1, SECRET);
    expect(a.ciphertext).not.toBe(b.ciphertext);
    expect(a.iv).not.toBe(b.iv);
    expect(a.wrappedDek).not.toBe(b.wrappedDek);
  });

  it("fails to open a ciphertext copied to another org", async () => {
    const sealed = await vault.seal({ orgId: ORG_A }, "org_system_one_keys", ROW_1, SECRET);
    await expect(vault.open({ orgId: ORG_B }, "org_system_one_keys", ROW_1, sealed)).rejects.toThrow();
  });

  it("fails to open a ciphertext copied to another row or table", async () => {
    const sealed = await vault.seal({ orgId: ORG_A }, "org_system_one_keys", ROW_1, SECRET);
    await expect(vault.open({ orgId: ORG_A }, "org_system_one_keys", ROW_2, sealed)).rejects.toThrow();
    await expect(vault.open({ orgId: ORG_A }, "org_webhook_secrets", ROW_1, sealed)).rejects.toThrow();
  });

  it("fails on a tampered ciphertext or tag", async () => {
    const sealed = await vault.seal({ orgId: ORG_A }, "org_system_one_keys", ROW_1, SECRET);
    const flipped = Buffer.from(sealed.ciphertext, "base64");
    flipped[0] = (flipped[0] ?? 0) ^ 1;
    await expect(
      vault.open({ orgId: ORG_A }, "org_system_one_keys", ROW_1, { ...sealed, ciphertext: flipped.toString("base64") }),
    ).rejects.toThrow();
    await expect(
      vault.open({ orgId: ORG_A }, "org_system_one_keys", ROW_1, { ...sealed, authTag: randomBytes(16).toString("base64") }),
    ).rejects.toThrow();
  });

  it("rotates the KEK by re-wrapping the DEK, leaving the ciphertext alone", async () => {
    const old = createVault(new LocalKekProvider([k1]));
    const sealed = await old.seal({ orgId: ORG_A }, "org_system_one_keys", ROW_1, SECRET);
    const rotated = createVault(new LocalKekProvider([k2, k1]));
    const rewrapped = await rotated.rewrap({ orgId: ORG_A }, "org_system_one_keys", sealed);
    expect(rewrapped.kekId).toBe(localKekId(k2));
    expect(rewrapped.ciphertext).toBe(sealed.ciphertext);
    expect(await rotated.open({ orgId: ORG_A }, "org_system_one_keys", ROW_1, rewrapped)).toBe(SECRET);
    // A second run changes nothing.
    expect(await rotated.rewrap({ orgId: ORG_A }, "org_system_one_keys", rewrapped)).toEqual(rewrapped);
    // Once the old KEK is gone, only the re-wrapped row opens.
    const newOnly = createVault(new LocalKekProvider([k2]));
    expect(await newOnly.open({ orgId: ORG_A }, "org_system_one_keys", ROW_1, rewrapped)).toBe(SECRET);
    await expect(newOnly.open({ orgId: ORG_A }, "org_system_one_keys", ROW_1, sealed)).rejects.toBeInstanceOf(
      KekUnavailableError,
    );
  });

  it("fingerprints with the first 16 hex characters of SHA-256 and shows the last four", () => {
    expect(keyFingerprint(SECRET)).toMatch(/^[0-9a-f]{16}$/);
    expect(keyFingerprint(SECRET)).toBe(keyFingerprint(SECRET));
    expect(keyLast4(SECRET)).toBe("stuv");
  });
});

describe("kekFromEnv", () => {
  const local = `local:${k1.toString("base64")},${k2.toString("base64")}`;

  it("parses a local KEK list; the first key is active", () => {
    const kek = kekFromEnv({ BANDWISE_KEK: local });
    expect(kek.activeKekId).toBe(localKekId(k1));
    expect(localKekId(k1)).toMatch(/^local:[0-9a-f]{8}$/);
  });

  it("refuses a local KEK in production", () => {
    expect(() => kekFromEnv({ BANDWISE_KEK: local, VERCEL_ENV: "production" })).toThrow(KekConfigError);
  });

  it("refuses a missing, malformed or short KEK", () => {
    expect(() => kekFromEnv({})).toThrow(KekConfigError);
    expect(() => kekFromEnv({ BANDWISE_KEK: "plain-text" })).toThrow(KekConfigError);
    expect(() => kekFromEnv({ BANDWISE_KEK: `local:${randomBytes(16).toString("base64")}` })).toThrow(KekConfigError);
    expect(() => kekFromEnv({ BANDWISE_KEK: "aws-kms:arn:aws:kms:us-east-1:1:key/x" })).toThrow(/Phase 2/);
  });
});
