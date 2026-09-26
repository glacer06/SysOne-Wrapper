# ADR-004: Cache and Redis

- **Status:** accepted (decided by Nick, 2026-09-26)
- **Date:** 2026-09-26
- **Owner:** Platform / Tenancy
- **Contract impact:** none to core schemas or ports. Documents one new `RunResult.warnings` value, `result_cached` (warnings are strings, so the schema does not change). Fixes the Redis key namespace and caps `question_sets.result_cache_ttl_seconds` at 86,400.

## Context

[architecture.md](../../.claude/skills/sysone-builder/references/architecture.md#caching) sets three cache layers: specs by version id, the release pointer with an L1, an L2 and an epoch key, and an opt-in result cache. It also requires the `org:{orgId}:` prefix on every key. Other references set time bounds that need a home:

- token revocation within 60 seconds and org suspension within 30 seconds ([security.md](../../.claude/skills/sysone-builder/references/security.md))
- decrypted TypeSafe keys in memory for at most 5 minutes ([ADR-003](003-key-vault.md))
- one SDK client per org key, cached by fingerprint
- the quota guard's same-day Redis counter (phase-2.md) and the rate limiters

We run on Vercel functions, so in-process memory lasts only as long as an instance and is not shared between instances. A pause (the kill switch) must reach every instance quickly. An agent token's effective role is recomputed on every request, so it is never cached.

## Decision

1. **Two layers.** L1 is a bounded in-process LRU per function instance. L2 is Redis, reached through `REDIS_URL` with `ioredis`: `rediss://` in production, a local Redis in dev and CI. Upstash stays the host, as ADR-001 says. Because we use the Redis protocol and not a vendor REST API, any Redis 7 compatible host works.
2. **One owner.** Only `packages/tenancy` imports the Redis client. It exports typed cache helpers and the limiters, and the console run service calls those.
3. **Key namespace.** Every tenant key starts with `org:{orgId}:`. The only other prefix is `platform:`, for the global per-model limiter budget and platform-wide epochs. All key builders live in one file, and a unit test fails when a builder returns a key without one of the two prefixes.
4. **Never in Redis:** plaintext TypeSafe keys or other secrets, raw tokens, and state. Token entries are keyed by the token hash and hold metadata only.
5. **Invalidate after commit.** The operation deletes the L2 key and increments the epoch key. If Redis fails at that moment, the operation still succeeds, logs the failure and queues a retry on the [ADR-005](005-jobs-runner.md) runner. The TTLs below cap the worst case.
6. **Redis down.** Caches fall back to Postgres, so answers stay correct and only latency rises. Limiters fall back to an in-process limiter at a fixed, conservative share of the org's RPM and raise an alert. The quota guard falls back to `usage_daily` alone.

### Inventory

| Entry | L1 | L2 (Redis) | Invalidated by | Staleness bound |
|---|---|---|---|---|
| Spec by version id | LRU, no TTL, bounded by entry count | none | never (immutable) | none needed |
| Release pointer `{ versionId, rolloutStage, experimentId }` | 15 s, epoch checked each request | 30 s TTL | publish, rollback, promote, rollout change, experiment change | one Redis GET; 15 s while Redis is down |
| App and agent token row, by hash | 10 s | 50 s TTL | revoke | 60 s (security.md) |
| Agent token effective role | never | never | read from `memberships` each request | none |
| Org status and plan | 5 s | 25 s TTL | suspend, plan change | 30 s (security.md) |
| Decrypted TypeSafe key | 5 min, memory only | never | key epoch (ADR-003) | next request; 5 min while Redis is down |
| SDK client per key fingerprint | instance lifetime | none | a new fingerprint means a new client | none needed |
| Model profiles (`ModelCatalog`) | 60 s | none | platform model writes are rare | 60 s |
| Rate limiter buckets | none | window length | not applicable | not applicable |
| Quota counter per org per day | none | 48 h TTL | rebuilt from `usage_daily` | not applicable |
| Result cache (opt-in per set) | none | the set's TTL | new version (the key holds the version id) | the TTL |

A pause is seen on the next request once the epoch is bumped. If the invalidation write itself fails, the bound is the L2 TTL plus the L1 TTL (45 seconds) until the queued retry lands.

### Result cache

- Used only when the set has `result_cache_ttl_seconds` set (at most 86,400) and the version's model is pinned, which the model registry decides.
- Key: `org:{orgId}:result:{versionId}:{sha256 of the canonical state as sent to System One}`. The hash is taken after redaction, so under `redact_logs_and_input` two inputs that differ only in redacted fields share an entry.
- Value: the raw answers per stage. Routing, relevance, composites and the rollout stage are applied fresh on every run.
- A hit makes no System One call. The run row is still written with empty `calls`, zero System One cost and the warning `result_cached`. It still counts as a run for quota and billing.
- Eval runs and `slug@draft` runs never read or write it, so evals always measure the model.

## Options considered

| Option | Pros | Cons |
|---|---|---|
| Postgres only | One fewer service. | A pointer read on every run adds load to the hot path. Limiter counters in Postgres contend under load. No cheap epoch check. |
| Redis protocol over `REDIS_URL` with `ioredis` (chosen) | One env var. Same protocol in dev, CI and production. Atomic Lua scripts for the limiters. The host can change without code changes. | One connection per function instance, opened lazily and reused. Cold instances pay the connect time. |
| Upstash REST client (`@upstash/redis`) | Works in the edge runtime. No connections to manage. `@upstash/ratelimit` is ready-made. | Needs a URL and a token, a second env var. Local dev needs a REST proxy. Ties the code to one vendor. Our limiter (priority eval bucket, per-model global budget, fair share) is custom anyway. |
| Vercel Edge Config or Runtime Cache | Built into the host. | Made for rarely written config and cached fetches. No atomic counters for the limiters, and per-publish invalidation does not fit their write model. |

## Consequences

- CI runs a Redis service container for the cache and limiter integration tests. Unit tests use an in-memory fake that implements the same helper interface.
- Tests to add: the key prefix test; a pause is seen by a second simulated instance on its next request; a revoked token stops working within 60 seconds with the Redis DEL failing; runs keep working, correctly, with Redis down; a result cache hit writes a run with warning `result_cached` and zero System One cost.
- The Security reviewer checks rule 4 against the key builders and values.
- Docs: architecture.md's Caching section links this ADR and takes the inventory table. savings-model.md lists `result_cached` among the warning values. data-model.md notes the TTL cap.

## Rollout

- Phase 1: the cache helper interface and the in-memory fake, so Core Engine and Platform can build against it.
- Phase 2: Redis, the limiters, the token and org caches, the key epoch and the quota counter.
- Result cache: Phase 3 at the earliest. It stays off for every set until an editor sets a TTL.
- Reversal: the Redis-down path in rule 6 is the same code that would run with no Redis at all. Caches can be dropped by configuration. Only the limiters need Redis to be correct across instances.
