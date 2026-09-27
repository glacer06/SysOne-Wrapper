// KeyResolver (ports.ts): the org's System One key for one provider. The only place a stored key
// is decrypted (golden rule 2). Plaintext stays in process memory, keyed by org, provider and
// fingerprint, for at most 5 minutes, and never reaches a log, an error message or Redis (ADR-003,
// ADR-004). A key is never returned for a provider other than the one asked for (ADR-011).
//
// Tenancy never imports @sysone/db. The console wires `loadKey` and `keyMode` to the repositories
// inside withTenant.

import {
  type KeyMode,
  type KeyResolver,
  type ResolvedKey,
  type SystemOneProvider,
  type TenantContext,
  TransportError,
} from "@sysone/core/contracts";

import { KekUnavailableError } from "./vault/kek.js";
import { keyFingerprint, type SealedSecret, type Vault } from "./vault/vault.js";

/** The org_system_one_keys columns the resolver needs. */
export interface StoredKeyRow extends SealedSecret {
  id: string;
  provider: SystemOneProvider;
  status: "active" | "invalid" | "revoked";
  fingerprint: string;
}

/**
 * The vault could not reach the KEK and no plaintext was cached: `503 key_vault_unavailable`,
 * retryable (ADR-003). Not a TransportError, because the contract's ErrorCode does not list this
 * code yet (see the Phase 1 report: ADR-003 contract gap).
 */
export class KeyVaultUnavailableError extends Error {
  override readonly name = "KeyVaultUnavailableError";
  readonly code = "key_vault_unavailable";
  readonly status = 503;
  readonly retryable = true;
}

export const KEY_CACHE_MAX_TTL_MS = 5 * 60_000;

export interface KeyResolverDeps {
  vault: Vault;
  /** organizations.key_mode for the ctx org. */
  keyMode(ctx: TenantContext): Promise<KeyMode>;
  /** The org's org_system_one_keys row for the provider, read inside withTenant. */
  loadKey(ctx: TenantContext, provider: SystemOneProvider): Promise<StoredKeyRow | null>;
  /** Platform keys for platform key mode: TYPESAFE_API_KEY, OPENROUTER_API_KEY, AI_GATEWAY_API_KEY (vercel). */
  platformKeys: Partial<Record<SystemOneProvider, string>>;
  /** The org's key epoch (Redis in Phase 2). key.rotate and key.revoke bump it. Missing: always 0. */
  keyEpoch?(orgId: string): Promise<number>;
  /** Epoch ms. */
  clock?: () => number;
  /** Capped at 5 minutes. */
  ttlMs?: number;
}

interface CacheEntry {
  apiKey: string;
  expiresAt: number;
  epoch: number;
}

function authError(message: string): TransportError {
  return new TransportError({ code: "system_one_auth", retryable: false, requestId: null }, message);
}

export interface CachingKeyResolver extends KeyResolver {
  /** Drops every cached plaintext. */
  clear(): void;
  /** How many plaintexts are cached; for tests and metrics. */
  size(): number;
}

export function createKeyResolver(deps: KeyResolverDeps): CachingKeyResolver {
  const clock = deps.clock ?? Date.now;
  const ttl = Math.min(deps.ttlMs ?? KEY_CACHE_MAX_TTL_MS, KEY_CACHE_MAX_TTL_MS);
  const cache = new Map<string, CacheEntry>();

  async function resolve(ctx: TenantContext, provider: SystemOneProvider): Promise<ResolvedKey> {
    const mode = await deps.keyMode(ctx);
    if (mode === "platform") {
      const apiKey = deps.platformKeys[provider];
      if (apiKey === undefined || apiKey === "") throw authError(`no platform key for provider ${provider}`);
      return { apiKey, mode, provider };
    }

    const row = await deps.loadKey(ctx, provider);
    if (row === null) throw authError(`org has no ${provider} key`);
    if (row.provider !== provider) throw authError(`stored key is for another provider`);
    if (row.status !== "active") throw authError(`org's ${provider} key is ${row.status}`);

    const epoch = deps.keyEpoch === undefined ? 0 : await deps.keyEpoch(ctx.orgId);
    const cacheKey = `${ctx.orgId}:${provider}:${row.fingerprint}`;
    const now = clock();
    const hit = cache.get(cacheKey);
    if (hit !== undefined && hit.expiresAt > now && hit.epoch === epoch) {
      return { apiKey: hit.apiKey, mode, provider };
    }
    cache.delete(cacheKey);

    let apiKey: string;
    try {
      apiKey = await deps.vault.open({ orgId: ctx.orgId }, "org_system_one_keys", row.id, row);
    } catch (e) {
      if (e instanceof KekUnavailableError) throw new KeyVaultUnavailableError("key vault unavailable");
      // A ciphertext moved to another org or row, or tampered with: no usable key.
      throw authError(`org's ${provider} key could not be opened`);
    }
    if (keyFingerprint(apiKey) !== row.fingerprint) throw authError(`org's ${provider} key fingerprint mismatch`);
    cache.set(cacheKey, { apiKey, expiresAt: now + ttl, epoch });
    return { apiKey, mode, provider };
  }

  return Object.assign(resolve, {
    clear: () => cache.clear(),
    size: () => cache.size,
  });
}
