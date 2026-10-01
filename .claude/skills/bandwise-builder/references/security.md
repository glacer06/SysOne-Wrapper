# Security

## TypeSafe keys

This section covers every System One key: TypeSafe keys, and OpenRouter keys once ADR-011 (proposed) is accepted. The heading keeps its name so existing links still work.


- **BYO key per org and provider:** stored in `org_system_one_keys` with envelope encryption, one row per `(org_id, provider)`. `provider` is `typesafe` (a TypeSafe key) or `openrouter` (an OpenRouter key, ADR-011, proposed). Each org has a random 256-bit data key (DEK) that encrypts the key with AES-256-GCM. The DEK is wrapped by a KMS key (AWS or GCP KMS in production, `BANDWISE_KEK` env in dev).
- **Keys never cross providers.** `KeyResolver(ctx, provider)` returns only the key stored for that provider, and `system-one-client` sends it only to that provider's base URL. A TypeSafe key is never sent to OpenRouter, and an OpenRouter key never to TypeSafe. The base URL comes from a constant in core, never from env, so the SDK's `TYPESAFE_BASE_URL` fallback cannot redirect a key.
- **Decryption** happens only in `tenancy.KeyResolver`. Plaintext is cached in memory for at most 5 minutes, never logged, never returned. The UI shows `key_last4` and a fingerprint only.
- **Saving a key** validates it per provider and stores the registry ids the key can reach in `org_system_one_keys.models text[]`. The list is refreshed on save, on rotation and nightly ([system-one-models.md](system-one-models.md)).
  - `typesafe`: `GET /v1/models` with the key.
  - `openrouter`: OpenRouter's Models API lists `typesafe/*` models for anyone, so it does not prove the key works. Validation sends one one-noul request with a tiny state on the cheapest reachable route and checks for a 200. A 401 rejects the key, and a 402 (no credits) saves it with a warning. The SDK's `models.list()` is not used, because it fails against OpenRouter.
- **Platform key mode** uses the platform's key for the run's provider: `TYPESAFE_API_KEY` or `OPENROUTER_API_KEY`. Usage is metered to the org's Stripe subscription and capped by plan.
- KEK rotation re-wraps DEKs in a background job. Rotating an org key is audited.
- A 401 from the provider marks the org's key for that provider `invalid`, notifies org admins and emits `key.invalid` ([events.md](events.md)). A 402 from OpenRouter (no credits) notifies org admins but leaves the key `active`.
- **Bandwise never exports a stored key.** Standalone generated code reads the customer's own key from their server env ([deploy-and-codegen.md](deploy-and-codegen.md)).
- **SDK client construction:** every TypeSafe SDK client, on either provider, is built with an explicit `baseURL`, `defaultModel`, `logLevel: 'warn'` and a scrubbing `logger`. The SDK reads `TYPESAFE_LOG_LEVEL` when `logLevel` is not set, and its `debug` level logs request bodies unredacted. Setting it explicitly means that env var can never write tenant state to logs.

## App tokens

App tokens are for host apps only: their servers and their browsers. Agents, the CLI and the MCP server use agent tokens.

- Formats: `sk_live_`, `sk_test_` (secret, server only), `pk_live_` (publishable, browser).
- A token is `<prefix><org>_<secret>`: the org id as 32 hex characters, then 32 random bytes as base64url. The org part is not secret; it lets the server look the token up inside that org's tenant scope (RLS on `app.org_id`), so no pre-org query ever reads every org's tokens. Rewriting the org part only moves the lookup to an org where the hash matches nothing. Code: `packages/tenancy/src/tokens.ts`, `apps/console/src/server/auth/bearer.ts`.
- Stored as HMAC-SHA256 keyed by the server pepper (`BANDWISE_TOKEN_PEPPER`, at least 32 characters). Shown once at creation. Changing the pepper invalidates every token.
- Every failure (unknown, wrong org, revoked, expired, a changed prefix, a user who left the org) is the same `401 unauthenticated`, so the response never says which it was. `last_used_at` is written at most once a minute per token.
- Until the console mints tokens (D3), a platform operator mints them with `pnpm --filter @bandwise/console mint-token`, which writes the hashed row and an audit row and prints the token once.
- Each token has a `channel` (`production` or `staging`, default `production`). Runs use it; a token cannot request another channel.
- Scopes: `run`, `sets:read`, `runs:read`, `runs:write` (standalone ingest), `feedback:write` (`sk_` only, never `pk_`), `review:read`, `review:write`, `usage:read`. Plus a set allowlist, RPM limit, expiry, revocation and `last_used_at`.
- Publishable tokens: origin allowlist enforced with CORS and an `Origin` check, run scope only, low RPM.
- Browser tokens: 5-minute ES256 JWTs minted by `POST /api/v1/tokens/browser` with an `sk_` token, bound to origin and set list. They are signed by a platform key (`BANDWISE_JWT_SIGNING_KEY`) with a `kid`, and the JWKS is published at `/api/v1/.well-known/jwks.json`. On key rotation, publish the new `kid` before signing with it, and keep the old one until its tokens expire.
- Revocation takes effect within 60 seconds (token cache TTL).

## Agent tokens and approvals

Decision record: [ADR-007](../../../../docs/adr/007-headless-parity.md). The operations are in [management-api.md](management-api.md); the CLI and MCP use is in [headless-and-agents.md](headless-and-agents.md).

### Agent tokens

- Prefix `sa_live_`. Each token belongs to one user in one org. Fields are in [data-model.md](data-model.md) (`agent_tokens`). Stored hashed like app tokens and shown once.
- **Effective role = min(`role_ceiling`, current membership role)**, recomputed on every request from the membership row. Demoting or removing the user shrinks the token at once.
- `can()` requires both the scope and the role.
- Scopes:

| Scope | Covers |
|---|---|
| `run` | Run sets |
| `sets:read` | Read goals, sets, drafts, versions, diffs, datasets, models, apps |
| `sets:write` | Goals, sets, drafts, datasets and the Studio |
| `evals:run` | Evals, playground compare, Studio calibration, improve mode, model trials |
| `release:staging` | Publish, rollback and rollout changes on staging |
| `release:production` | Production publish, promote and rollback, and rollout changes |
| `runs:read` | Read runs |
| `runs:write` | Ingest runs from standalone exports (`POST /api/v1/runs/ingest`, Phase 4b) |
| `review:read` | Read review items |
| `review:write` | Assign, resolve and dismiss review items |
| `feedback:write` | Report outcomes (`POST /api/v1/feedback`) |
| `usage:read` | Usage and savings rollups |
| `reports:read` | Reports, alerts, set health, price book |
| `audit:read` | The audit log |
| `events:read` | The event feed |
| `apps:write` | Apps, app tokens, opportunities, bindings |
| `admin:write` | Members, keys, settings, price book, plugins, agent tokens |

- Minted in the console settings, or by the device flow (`bandwise login`, the MCP server, the Chrome extension). In the device flow the person approves the code in a console session and picks the org, scopes and role ceiling. The ceiling cannot exceed their own role. Device codes are single use and expire after 10 minutes.
- Maximum expiry is 90 days.
- A token can mint only tokens whose scopes it holds, with a ceiling no higher than its own effective role, and never `admin:write`.
- Optional `daily_spend_cap_micro_usd` counts the System One cost of the runs and evals the token starts. Over the cap the API returns `402 token_budget_exceeded`.
- Revocation takes effect within 60 seconds, like app tokens. A token can always revoke itself.

### Approval gate

High-risk operations called by an agent return `202 { approval: { id, status: "pending", url, expiresAt } }` and store an `approval_requests` row. High-risk operations:

- production publish or promote on a set that is protected, or whose production stage is `controlled` or `full`
- rollout moves into `controlled` or `full` from a lower stage, or out of `paused`
- skipping champion/challenger
- experiment promotion
- System One key (TypeSafe or OpenRouter) rotation or revocation
- creating tokens (app or agent) with write scopes
- member role changes, including invitations and removals
- PII or retention changes
- lowering `agentApprovals`
- org deletion

Rules:

- Only a person in a console session with the role the operation needs can approve. No token can approve.
- The stored input runs unchanged; its `input_hash` is checked. If the draft changed since the request, the stored `If-Match` fails and nothing publishes.
- Requests expire after 7 days.
- **Moves toward safety are never gated:** pause, rollback, demote, experiment stop and token revocation. An agent can always make things safer without waiting.

Org setting `agentApprovals`:

| Value | Effect |
|---|---|
| `required` (default) | Every high-risk operation above is gated. |
| `production_only` | Only release and rollout operations on the production channel are gated, plus the always-gated list. |
| `off` | Only the always-gated list is gated. |

Always gated, whatever the setting: key rotation or revocation, member role changes, PII and retention changes, org deletion, creating `admin:write` tokens, and lowering `agentApprovals` itself. Without that last item, an agent with `admin:write` could switch the gate off.

## Console sessions

- Better Auth (ADR-002) with email and password and TOTP two-factor, set up in `apps/console/src/server/auth/config.ts`. Its HTTP handler is not mounted: Server Actions call it, so sign-up, social sign-in and account changes from the browser do not exist. Sign-up is also disabled in the config.
- Two-factor is required before any console page: a session without it reaches only the setup page.
- A session is created only for a member of the console org (`internal` until Phase 2), plus the optional `BANDWISE_CONSOLE_EMAILS` allowlist. The membership is read again on every request.
- Attempt limits per IP and per email, one generic error for every failed sign-in, and an account lockout after 10 wrong codes. Library errors are never echoed or logged with their arguments.
- Cookies are `HttpOnly`, `SameSite=Lax`, and `Secure` with the `__Secure-` prefix on https. Reset tokens and two-factor challenge ids are stored hashed. Session tokens are stored as the library stores them (plain); hashing them is a Phase 2 follow-up.
- Two-factor enrollment is admin-issued: `console-member` writes a one-time enrollment code (hashed in `console_enrollments`, 24 hours) with the reset link, setup needs it with the password, and it is used up when two-factor turns on.
- Sign-in attempt limits (per email and per IP) live in `auth_attempts` with hashed keys, so they hold across instances. The IP comes from `x-real-ip` only.
- A person needs the editor role to run a set's draft (`slug@draft`), which is what a console preview does, because each live preview is a paid call on the platform key.

## Authorization

- `can(ctx, action, resource)` in `packages/core/src/authz.ts`. Every operation calls it through `runOperation`, so Server Actions and route handlers get the same check.
- RLS is the backstop, not the primary check.
- Cross-tenant requests return 404. `403 insufficient_scope` applies only to resources in the caller's own org.
- Sets marked `protected` need an admin to publish. An agent needs an approval on top: an admin ceiling alone is not enough.

## Database roles on Supabase

Production Postgres is Supabase (ADR-018). A fresh project grants `anon`, `authenticated` and `service_role` ALL on every new table, sequence and function in `public` through default privileges owned by `postgres` and `supabase_admin`, plus USAGE on the schema, and `service_role` has BYPASSRLS. Left alone, the Data API keys would be a second way into tenant data around `withTenant` and RLS.

- Migration `0002_close_data_api_roles.sql` revokes every grant those roles hold in `public`, their default privileges where the migrating role may change them, and USAGE on `public` from PUBLIC. It is a no-op for roles that do not exist, so PGlite and plain Postgres run it too.
- `migrateDrizzle` runs `findDataApiExposure` (`packages/db/src/data-api-roles.ts`) after every run and rolls the run back if any of the three roles can reach the schema or anything in it. `data-api-roles.test.ts` proves both on PGlite with stand-in roles.
- The Data API stays off, and no Bandwise app holds the anon or service key. The app connects as a login role that is a member of `bandwise_app`; migrations run as the owner. Setup and the login role: `docs/runbooks/database.md`.

## Rate limits for agents and evals

- Evals, playground compare, Studio calibration, try-model and repeat runs use a separate **eval** limiter bucket. By default it gets 25 percent of the org's RPM and the lowest priority in the global budget, so an agent iterating on a set cannot starve production runs.
- The global budget is a per-model setting: about 1,000 RPM for `jev-1.13.0`, roughly 83 percent of the published 1,200. Limiter keys include the model.
- Per-token limits apply to agent tokens as they do to app tokens. The daily spend cap is above.
- Hosted runs today (`POST /api/v1/sets/{ref}/run` and console draft previews, `apps/console/src/server/run/limits.ts`): every caller, keyed by org plus agent token, app key or console user, gets 120 runs per minute (`429 rate_limited`) and 5 USD of System One and escalation cost per UTC day (`402 token_budget_exceeded`). Spend is the envelope cost of each stored run, linked fallback runs included, so one run in flight can finish over the cap. Both counts live in `run_limits` (migration 0008, an auth-class table with SHA-256 keys, no org data in the clear), updated in one locked upsert so they hold across instances. These are named constants, not yet the per-token `rpm_limit` and `daily_spend_cap_micro_usd` columns; Phase 2 reads those and the plan limits behind the same ports.

## Platform admin

- Separate route group and layout. Requires `platform_role = 'superadmin'` and MFA.
- Impersonation is time-boxed, shows a banner, and writes `impersonator_id` on every audit row.
- Suspending an org blocks runs within 30 seconds (org status cache TTL).
- Model registry writes (`/api/v1/platform/models`) are audited. Org tokens get 404 on platform routes.

## Audit

Append-only `audit_log`. The app's DB role has no UPDATE or DELETE on it. Each row records `actor_type` (`user`, `agent`, `app` or `system`), `client` (`console`, `api`, `cli`, `mcp`, `extension` or `job`), `actor_user_id`, `actor_token_id` and `approval_id`, so an agent action shows which token did it, for which user, and who approved it.

Covers: publish, rollback, promote, rollout change (including auto-demote), policy change, experiment start, promote and stop, approval requests and decisions, key create/rotate/revoke, app and agent token create/revoke, member invite/role change/removal, settings, price book edits, review resolutions, plan changes, impersonation start/stop, data export, dataset retention changes, org deletion.

## PII and data handling

- State can hold personal data, and it goes to TypeSafe. TypeSafe is a subprocessor; list it in the DPA.
- Controls:
  - `redactPaths` per set, plus built-in detectors (email, phone, card, SSN) and regex rules.
  - Org `pii_mode`: `off`, `redact_logs` (store redacted state), `redact_logs_and_input` (redact before calling System One, with a warning that accuracy may change and evals should be re-run).
  - Per-set storage mode: full, redacted, hash only.
  - Review queue shows only stored, redacted state.
- Retention:
  - `state_retention_days` (default 30): the retention job nulls `runs.state`.
  - `answers_retention_days` (default 180): nulls `answers` and `decisions`. They carry no raw input, so they can be kept longer for threshold replay and health.
  - The job also drops old partitions and purges resolved review items. Audit log retention is separate (1 year).
- **Learning retention:** before a run's state is purged, a run that was picked for labeling or received feedback is copied into `dataset_cases`. The copy has state redacted per `pii_mode`, the full answers, `version_id` and `model_resolved`.
  - `dataset_retention_days` defaults to the org's state retention. Only an admin can raise it, and the change is audited. There is no silent longer default.
  - Deletion requests cascade to dataset cases.
- **Hash-only storage** means review shows no content, datasets cannot grow from production and replay is unavailable. The console and the health endpoint say so plainly, and a publish lint warns when a hash-only set has review actions.
- The test split never leaves the server ([management-api.md](management-api.md), Holdout rules).
- Advise customers not to send regulated data (PHI and similar) until a DPA or BAA covers it. TypeSafe does not train on customer data; ZDR is an enterprise option (see the TypeSafe legal page).

## State is untrusted

System One models do not treat state as hostile by default. TypeSafe says so for `jev-1.13`: injected instructions, misleading framing, or text that argues for its own classification can move the answer (docs.typesafe.ai/model-jaggedness/jev-1.13.md).

- Sets that use the web page adapter, or are flagged `user_generated`, must include adversarial cases in the dataset used for the shadow to controlled gate: injected instructions, and text arguing for its own label.
- Action picker sets default to the high-risk tier.
- The Chrome extension clicks on its own only when the set is at `full` on production, the band is high and the site is on the org's allowlist.

## Web

- CSRF: Server Actions and `/api/v1` route handlers are thin adapters over operations. A request with an `Authorization` header is authenticated by the token alone; bearer-token routes never read cookies. A cookie-authenticated `/api/v1` mutation must also pass an `Origin` check against the console origin, on top of SameSite cookies.
- Strict CSP on the console.
- Stripe webhook signatures verified. Our outbound webhooks (plugin actions and org events) are signed with HMAC using secrets in `org_webhook_secrets`, which are encrypted like System One keys.
- zod validation and size caps on every input.

## Extensions

- **Chrome extension:** no TypeSafe or OpenRouter key, ever. It signs in with the device flow and holds an agent token with client `extension` and scopes `run`, `sets:read`, `review:read` and `review:write`, kept in `chrome.storage.session`. It sends nothing until the user clicks, and shows the state for preview and redaction first. Permissions: `activeTab` and `storage`. Autonomous clicks follow the rule in "State is untrusted".
- **MCP server and CLI:** agent tokens only. Never an `sk_` app token, never a TypeSafe or OpenRouter key.
- **Generated code:** generated browser code never contains `sk_` tokens, TypeSafe keys or OpenRouter keys. The CI bundle scan covers codegen output as well as the embed kit.
