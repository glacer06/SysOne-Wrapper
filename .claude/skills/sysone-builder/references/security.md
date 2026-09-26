# Security

## TypeSafe keys

- **BYO key per org:** stored in `org_jev_keys` with envelope encryption. Each org has a random 256-bit data key (DEK) that encrypts the TypeSafe key with AES-256-GCM. The DEK is wrapped by a KMS key (AWS or GCP KMS in production, `SYSONE_KEK` env in dev).
- **Decryption** happens only in `tenancy.KeyResolver`. Plaintext is cached in memory for at most 5 minutes, never logged, never returned. The UI shows `key_last4` and a fingerprint only.
- **Saving a key** validates it with `GET /v1/models` first.
- **Platform key mode** uses the platform's TypeSafe key. Usage is metered to the org's Stripe subscription and capped by plan.
- KEK rotation re-wraps DEKs in a background job. Rotating an org key is audited.
- A 401 from Jev marks the org's key `invalid` and notifies org admins.

## App tokens

- Formats: `sk_live_`, `sk_test_` (secret, server only), `pk_live_` (publishable, browser).
- Stored as sha256 with a server pepper. Shown once at creation.
- Scopes (`run`, `sets:read`, `runs:read`, `review:read`, `review:write`, `usage:read`), set allowlist, RPM limit, expiry, revocation, `last_used_at`.
- Publishable tokens: origin allowlist enforced with CORS and an `Origin` check, run scope only, low RPM.
- Browser tokens: 5-minute JWTs minted by a host server with an `sk_` token, bound to origin and set list.
- Revocation takes effect within 60 seconds (token cache TTL).

## Authorization

- `can(ctx, action, resource)` in `packages/core/src/authz.ts`. Every server action and route calls it.
- RLS is the backstop, not the primary check.
- Cross-tenant requests return 404.
- Sets marked `protected` need an admin to publish.

## Platform admin

- Separate route group and layout. Requires `platform_role = 'superadmin'` and MFA.
- Impersonation is time-boxed, shows a banner, and writes `impersonator_id` on every audit row.
- Suspending an org blocks runs within 30 seconds (org status cache TTL).

## Audit

Append-only `audit_log`. The app's DB role has no UPDATE or DELETE on it. Covers: publish, rollback, promote, rollout change, policy change, key create/rotate/revoke, token create/revoke, member invite/role change/removal, settings, price book edits, review resolutions, plan changes, impersonation start/stop, data export, org deletion.

## PII and data handling

- State can hold personal data, and it goes to TypeSafe. TypeSafe is a subprocessor; list it in the DPA.
- Controls:
  - `redactPaths` per set, plus built-in detectors (email, phone, card, SSN) and regex rules.
  - Org `pii_mode`: `off`, `redact_logs` (store redacted state), `redact_logs_and_input` (redact before calling Jev, with a warning that accuracy may change and evals should be re-run).
  - Per-set storage mode: full, redacted, hash only.
  - Retention job: nulls `runs.state` and `answers` after `retention_days` (default 30), drops old partitions, purges resolved review items. Audit log retention is separate (1 year).
  - Review queue shows only stored, redacted state.
- Advise customers not to send regulated data (PHI and similar) until a DPA or BAA covers it. Jev does not train on customer data; ZDR is an enterprise option (see TypeSafe legal page).

## Web

- CSRF: Server Actions plus SameSite cookies.
- Strict CSP on the console.
- Stripe webhook signatures verified; our outbound action webhooks signed with HMAC.
- zod validation and size caps on every input.

## Extensions

- **Chrome extension:** no TypeSafe key, ever. Signs in to the console for a session token scoped to the user's org and role. Sends nothing until the user clicks, and shows the state for preview and redaction first. Permissions: `activeTab` and `storage`. Action picker mode only clicks on its own for high-band answers on org-allowlisted sites.
- **MCP server:** uses a scoped `sk_` app token, never a Jev key.
