// @bandwise/tenancy: key vault, KeyResolver, rate limits and quotas. The only package that touches
// crypto. Phase 1 ships the dev implementations: a local KEK vault (ADR-003), an in-memory rate
// limiter and an in-memory quota guard, all typed to the @bandwise/core ports.

export {
  type EncryptionContext,
  KekConfigError,
  type KekEnv,
  kekFromEnv,
  type KekProvider,
  KekUnavailableError,
  LocalKekProvider,
  localKekId,
  type WrappedDek,
} from "./vault/kek.js";
export {
  createVault,
  keyFingerprint,
  keyLast4,
  secretAad,
  type SealedSecret,
  type Vault,
  type VaultScope,
  type VaultTable,
} from "./vault/vault.js";
export {
  type CachingKeyResolver,
  createKeyResolver,
  KEY_CACHE_MAX_TTL_MS,
  type KeyResolverDeps,
  KeyVaultUnavailableError,
  type StoredKeyRow,
} from "./key-resolver.js";
export {
  createInMemoryRateLimiter,
  type InMemoryRateLimiter,
  type InMemoryRateLimiterOptions,
} from "./limits/rate-limiter.js";
export {
  createInMemoryQuotaGuard,
  type InMemoryQuotaGuard,
  type InMemoryQuotaGuardOptions,
} from "./limits/quota-guard.js";
