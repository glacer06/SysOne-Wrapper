import { randomBytes } from "node:crypto";

import { describe, expect, it } from "vitest";

import { isTransportError, type KeyMode, type SystemOneProvider, type TenantContext } from "@bandwise/core/contracts";

import { createKeyResolver, KEY_CACHE_MAX_TTL_MS, KeyVaultUnavailableError, type StoredKeyRow } from "./key-resolver.js";
import { KekUnavailableError, LocalKekProvider, type KekProvider } from "./vault/kek.js";
import { createVault, keyFingerprint } from "./vault/vault.js";

const ORG_A = "0192f000-0000-7000-8000-00000000000a";
const ORG_B = "0192f000-0000-7000-8000-00000000000b";
const TS_KEY = "ts_live_aaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const OR_KEY = "sk-or-v1-bbbbbbbbbbbbbbbbbbbbbbbbbbbb";

const ctx = (orgId: string): TenantContext => ({
  orgId,
  actor: { type: "system" },
  client: "job",
  plan: "internal",
  requestId: "r",
});

async function setup(opts: { mode?: KeyMode; kek?: KekProvider } = {}) {
  let now = 1_000_000;
  let epoch = 0;
  let opens = 0;
  const kek = opts.kek ?? new LocalKekProvider([randomBytes(32)]);
  const inner = createVault(kek);
  const vault = {
    ...inner,
    open: (...args: Parameters<typeof inner.open>) => {
      opens += 1;
      return inner.open(...args);
    },
  };
  const rows = new Map<string, StoredKeyRow>();
  async function store(orgId: string, provider: SystemOneProvider, apiKey: string, id: string) {
    const sealed = await inner.seal({ orgId }, "org_system_one_keys", id, apiKey);
    rows.set(`${orgId}:${provider}`, { ...sealed, id, provider, status: "active", fingerprint: keyFingerprint(apiKey) });
  }
  await store(ORG_A, "typesafe", TS_KEY, "0192f000-0000-7000-8000-000000000001");
  await store(ORG_A, "openrouter", OR_KEY, "0192f000-0000-7000-8000-000000000002");
  const resolver = createKeyResolver({
    vault,
    keyMode: async () => opts.mode ?? "byo",
    loadKey: async (c, provider) => rows.get(`${c.orgId}:${provider}`) ?? null,
    platformKeys: { typesafe: "platform-ts-key", vercel: "platform-ai-gateway-key" },
    keyEpoch: async () => epoch,
    clock: () => now,
  });
  return {
    resolver,
    rows,
    store,
    tick: (ms: number) => {
      now += ms;
    },
    bumpEpoch: () => {
      epoch += 1;
    },
    opens: () => opens,
  };
}

async function authCode(p: Promise<unknown>): Promise<string | null> {
  try {
    await p;
    return null;
  } catch (e) {
    return isTransportError(e) ? e.code : String(e);
  }
}

describe("KeyResolver", () => {
  it("returns only the key stored for the provider asked for", async () => {
    const { resolver } = await setup();
    expect(await resolver(ctx(ORG_A), "typesafe")).toEqual({ apiKey: TS_KEY, mode: "byo", provider: "typesafe" });
    expect(await resolver(ctx(ORG_A), "openrouter")).toEqual({ apiKey: OR_KEY, mode: "byo", provider: "openrouter" });
    // No vercel row for ORG_A: its OpenRouter and TypeSafe keys are never sent to Vercel.
    expect(await authCode(resolver(ctx(ORG_A), "vercel"))).toBe("system_one_auth");
  });

  it("fails with system_one_auth when the org has no key for the provider", async () => {
    const { resolver } = await setup();
    expect(await authCode(resolver(ctx(ORG_B), "typesafe"))).toBe("system_one_auth");
  });

  it("fails with system_one_auth for a revoked or invalid key", async () => {
    const { resolver, rows } = await setup();
    const row = rows.get(`${ORG_A}:typesafe`);
    if (row === undefined) throw new Error("setup");
    rows.set(`${ORG_A}:typesafe`, { ...row, status: "revoked" });
    expect(await authCode(resolver(ctx(ORG_A), "typesafe"))).toBe("system_one_auth");
    rows.set(`${ORG_A}:typesafe`, { ...row, status: "invalid" });
    expect(await authCode(resolver(ctx(ORG_A), "typesafe"))).toBe("system_one_auth");
  });

  it("never returns another org's key, even when its row is copied over", async () => {
    const { resolver, rows } = await setup();
    const aRow = rows.get(`${ORG_A}:typesafe`);
    if (aRow === undefined) throw new Error("setup");
    rows.set(`${ORG_B}:typesafe`, aRow);
    expect(await authCode(resolver(ctx(ORG_B), "typesafe"))).toBe("system_one_auth");
  });

  it("refuses a row whose provider does not match the request", async () => {
    const { resolver, rows } = await setup();
    const orRow = rows.get(`${ORG_A}:openrouter`);
    if (orRow === undefined) throw new Error("setup");
    rows.set(`${ORG_A}:typesafe`, orRow);
    expect(await authCode(resolver(ctx(ORG_A), "typesafe"))).toBe("system_one_auth");
  });

  it("caches plaintext for at most 5 minutes", async () => {
    const { resolver, tick, opens } = await setup();
    await resolver(ctx(ORG_A), "typesafe");
    await resolver(ctx(ORG_A), "typesafe");
    expect(opens()).toBe(1);
    tick(KEY_CACHE_MAX_TTL_MS - 1);
    await resolver(ctx(ORG_A), "typesafe");
    expect(opens()).toBe(1);
    tick(2);
    await resolver(ctx(ORG_A), "typesafe");
    expect(opens()).toBe(2);
  });

  it("drops the cached key on the next request after a rotation or revocation bumps the epoch", async () => {
    const { resolver, bumpEpoch, opens, store } = await setup();
    await resolver(ctx(ORG_A), "typesafe");
    await store(ORG_A, "typesafe", "ts_live_rotated_ccccccccccccccccccccc", "0192f000-0000-7000-8000-000000000003");
    bumpEpoch();
    expect((await resolver(ctx(ORG_A), "typesafe")).apiKey).toBe("ts_live_rotated_ccccccccccccccccccccc");
    expect(opens()).toBe(2);
  });

  it("uses the platform key in platform key mode, per provider", async () => {
    const { resolver } = await setup({ mode: "platform" });
    expect(await resolver(ctx(ORG_A), "typesafe")).toEqual({
      apiKey: "platform-ts-key",
      mode: "platform",
      provider: "typesafe",
    });
    expect(await authCode(resolver(ctx(ORG_A), "openrouter"))).toBe("system_one_auth");
    // AI_GATEWAY_API_KEY for the vercel route (ADR-013).
    expect(await resolver(ctx(ORG_A), "vercel")).toEqual({ apiKey: "platform-ai-gateway-key", mode: "platform", provider: "vercel" });
  });

  it("reports key_vault_unavailable, retryable, when the KEK cannot be reached", async () => {
    const real = new LocalKekProvider([randomBytes(32)]);
    let down = false;
    const kek: KekProvider = {
      activeKekId: real.activeKekId,
      wrap: (d, c) => real.wrap(d, c),
      unwrap: (w, c) => (down ? Promise.reject(new KekUnavailableError("down")) : real.unwrap(w, c)),
    };
    const { resolver } = await setup({ kek });
    down = true;
    const err = await resolver(ctx(ORG_A), "typesafe").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(KeyVaultUnavailableError);
    expect(err).toMatchObject({ code: "key_vault_unavailable", status: 503, retryable: true });
  });

  it("keeps key material out of error messages", async () => {
    const { resolver, rows } = await setup();
    const row = rows.get(`${ORG_A}:typesafe`);
    if (row === undefined) throw new Error("setup");
    rows.set(`${ORG_A}:typesafe`, { ...row, fingerprint: "0000000000000000" });
    const err = await resolver(ctx(ORG_A), "typesafe").catch((e: unknown) => e);
    expect(isTransportError(err)).toBe(true);
    expect(String((err as Error).message)).not.toContain(TS_KEY);
    expect(JSON.stringify(err)).not.toContain(TS_KEY);
  });
});
