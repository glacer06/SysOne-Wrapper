# ADR-003: Key vault with envelope encryption

- **Status:** accepted (decided by Nick, 2026-09-26)
- **Date:** 2026-09-26
- **Owner:** Platform / Tenancy, reviewed by the Security reviewer
- **Contract impact:** the `KeyResolver` port keeps its signature. One additive error code, `503 key_vault_unavailable` (retryable), goes into api.md and the error contract. The format of `SYSONE_KEK` is fixed here. The envelope columns already in data-model.md (`ciphertext, iv, auth_tag, wrapped_dek, kek_id`) do not change.

## Context

Orgs in BYO key mode store their TypeSafe key with us. SysOne also stores org webhook signing secrets (`org_webhook_secrets`) and, from Phase 5, plugin configs. Golden rule 2: keys never leave the server, and only `tenancy.KeyResolver` decrypts them.

[security.md](../../.claude/skills/sysone-builder/references/security.md#typesafe-keys) sets the outline: a random 256-bit DEK, AES-256-GCM, the DEK wrapped by a KMS key in production and by `SYSONE_KEK` in dev, plaintext cached in memory for at most 5 minutes, and KEK rotation by re-wrapping DEKs in a background job. This ADR settles what it leaves open: which KMS, how a ciphertext is bound to its org, the dev key format, how fast rotation and revocation take effect, and what happens when KMS is down.

Threats in scope: a leaked database dump or backup, a SQL bug that copies a ciphertext into another org's row, a leaked env file, and logs. Out of scope: code execution inside the console process, which can call `KeyResolver` just as the app does. KMS audit logs are how we detect that case.

The platform key (`TYPESAFE_API_KEY`, platform key mode) is an env secret on the host and is not stored in the vault.

## Decision

1. **One DEK per stored secret.** Each row of `org_typesafe_keys` (renamed `org_system_one_keys` by ADR-011, proposed, with one row per org and provider) and `org_webhook_secrets`, and later `plugin_configs`, gets its own random 256-bit DEK. That meets security.md's per-org DEK, and rotating one secret never touches another.
2. **AES-256-GCM** through Node `crypto`, with a random 96-bit IV per encryption and a 128-bit tag. The additional authenticated data is `sysone:v1:<table>:<org_id>:<row_id>`. A ciphertext moved to another org or another row fails to decrypt instead of returning the wrong secret.
3. **Production KEK: AWS KMS**, one symmetric key per environment. `GenerateDataKey` creates each DEK and `Decrypt` unwraps it, both with encryption context `{ orgId, table }`, so CloudTrail logs every unwrap with its org. The console reaches AWS through Vercel OIDC federation and an IAM role limited to `GenerateDataKey`, `Encrypt` and `Decrypt` on that one key. No static cloud credentials sit in env.
4. **`SYSONE_KEK` names the KEK.**
   - Production: `aws-kms:<key ARN>`.
   - Dev and CI: `local:<base64 of 32 bytes>[,<base64 of 32 bytes>...]`. The first key is active; the others only decrypt, which lets tests exercise rotation.
   - `kek_id` is the key ARN, or `local:` plus the first 8 hex characters of the key's SHA-256.
   - The console refuses to start with a `local:` KEK when `VERCEL_ENV` is `production`.
5. **One module.** Only `packages/tenancy/src/vault` touches crypto and KMS, which the existing boundary rule already requires. It exports `seal(ctx, table, rowId, plaintext)` and `open(ctx, table, row)`. `KeyResolver` and the webhook signer are the only callers of `open`.
6. **Plaintext cache.** `KeyResolver` keeps the decrypted key in process memory, keyed by org and fingerprint, for at most 5 minutes. It is never written to Redis ([ADR-004](004-cache.md)). Before using a cached key it reads the org's key epoch from Redis. `key.rotate` and `key.revoke` bump that epoch after commit, so both take effect on the next request. If Redis is down, the 5-minute cap is the bound. Node cannot reliably zero a string, so the controls are the short TTL, no logging and the scrubbing logger.
7. **Fingerprint and last four.** `fingerprint` is the first 16 hex characters of the key's SHA-256. TypeSafe keys are long random strings, so this reveals nothing useful. It also keys the per-org SDK client cache ([system-one-api-contract.md](../../.claude/skills/sysone-builder/references/system-one-api-contract.md)). The UI shows only `key_last4` and the fingerprint.
8. **Save and rotate.** `key.rotate` validates the new key with `GET /v1/models`, seals it with a new DEK, and in one transaction replaces the row, stores the reachable model names, sets `rotated_at` and writes the audit row. After commit it bumps the key epoch. The response never echoes the key. The console reminds the admin to revoke the old key at TypeSafe, because SysOne cannot.
9. **KEK rotation.** AWS KMS automatic yearly rotation keeps the same key ARN and the old key material, so it needs no re-wrap. Replacing the KEK itself (a new key, region or provider, or a suspected compromise) runs the `kek.rewrap` job on the [ADR-005](005-jobs-runner.md) runner. For each row whose `kek_id` is not the active one, it unwraps the DEK with the old KEK, wraps it with the new one, and updates `wrapped_dek` and `kek_id`. Ciphertexts stay as they are. The job is idempotent, runs in batches and writes one platform audit row per run.
10. **KMS down.** A request that needs a key with no cached plaintext fails with `503 key_vault_unavailable` and `retryable: true`. We add this code rather than reuse `system_one_unavailable`, which would blame TypeSafe for our outage. Platform-key runs are not affected.

## Options considered

| Option | Pros | Cons |
|---|---|---|
| AWS KMS with Vercel OIDC federation (chosen) | Keys never leave KMS. Per-org encryption context shows up in CloudTrail. Automatic rotation with no re-wrap. No static credentials. | An AWS account to run, even though we host on Vercel. One KMS call per cache miss. |
| GCP Cloud KMS with workload identity federation | Same model, with additional authenticated data in place of encryption context. | Same extra account, and we have no other GCP use today. Can be added later as a second `KekProvider` without touching stored rows. |
| KEK as an env secret in production | Nothing extra to run. | Anyone who reads env and a DB dump gets every key. No unwrap audit trail. security.md rules it out for production. |
| Postgres `pgcrypto` or a managed-DB column encryption feature | Nothing extra to run. | The key sits next to the data or in the query path, and a dump can include both. Crypto moves into SQL, outside the `tenancy` boundary. |
| A hosted secrets manager, one secret per org key | Rotation and audit built in. | One network call per secret, per-secret pricing, and org secrets spread outside our DB and outside the RLS model. |

## Consequences

- `packages/tenancy/src/vault` exposes a `KekProvider` interface with `aws-kms` and `local` implementations. Tests use `local` or an in-memory fake, and no unit test calls KMS.
- Tests to add: a ciphertext copied to another org's row fails to open; a wrong AAD fails; a `local:` KEK in production fails at startup; `kek.rewrap` moves every row to the new `kek_id`, and a second run changes nothing; after `key.revoke`, the next request cannot use the old key; the log scrubber finds no key material.
- `.env.example` documents the `SYSONE_KEK` format. When Phase 2 lands, the role ARN for OIDC federation (`AWS_ROLE_ARN`) is added to env docs.
- api.md gains `503 key_vault_unavailable`. security.md links here for the details above.
- `plugin_configs.config_ciphertext` needs the same envelope fields. Phase 5 either adds the columns or stores one versioned envelope string; this ADR does not pick.

## Rollout

- Phase 2: the vault, `KeyResolver`, `key.rotate`, `key.revoke` and the key epoch, with the AWS KMS key and IAM role created per environment before the first BYO key is saved.
- Before the first paying customer: the Security reviewer signs off on the IAM policy and the tests above.
- Reversal: moving to GCP KMS, or to a new AWS key, is the `kek.rewrap` job with a new `SYSONE_KEK`. No ciphertext is rewritten, and no org has to re-enter its key.
