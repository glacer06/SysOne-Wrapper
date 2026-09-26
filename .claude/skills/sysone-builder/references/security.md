# Security

## TypeSafe keys

- **BYO key per org:** stored in `org_typesafe_keys` with envelope encryption. Each org has a random 256-bit data key (DEK) that encrypts the TypeSafe key with AES-256-GCM. The DEK is wrapped by a KMS key (AWS or GCP KMS in production, `SYSONE_KEK` env in dev).
- **Decryption** happens only in `tenancy.KeyResolver`. Plaintext is cached in memory for at most 5 minutes, never logged, never returned. The UI shows `key_last4` and a fingerprint only.
- **Saving a key** validates it with `GET /v1/models` first and stores the model names the key can send in `org_typesafe_keys.models text[]`. The list is refreshed on save, on rotation and nightly ([system-one-models.md](system-one-models.md)).
- **Platform key mode** uses the platform's TypeSafe key. Usage is metered to the org's Stripe subscription and capped by plan.
- KEK rotation re-wraps DEKs in a background job. Rotating an org key is audited.
- A 401 from TypeSafe marks the org's key `invalid`, notifies org admins and emits `key.invalid` ([events.md](events.md)).
- **SysOne never exports a stored TypeSafe key.** Standalone generated code reads the customer's own key from their server env ([deploy-and-codegen.md](deploy-and-codegen.md)).
- **SDK client construction:** every TypeSafe SDK client is built with an explicit `baseURL`, `defaultModel`, `logLevel: 'warn'` and a scrubbing `logger`. The SDK reads `TYPESAFE_LOG_LEVEL` when `logLevel` is not set, and its `debug` level logs request bodies unredacted. Setting it explicitly means that env var can never write tenant state to logs.

## App tokens

App tokens are for host apps only: their servers and their browsers. Agents, the CLI and the MCP server use agent tokens.

- Formats: `sk_live_`, `sk_test_` (secret, server only), `pk_live_` (publishable, browser).
- Stored as sha256 with a server pepper. Shown once at creation.
- Each token has a `channel` (`production` or `staging`, default `production`). Runs use it; a token cannot request another channel.
- Scopes: `run`, `sets:read`, `runs:read`, `runs:write` (standalone ingest), `feedback:write` (`sk_` only, never `pk_`), `review:read`, `review:write`, `usage:read`. Plus a set allowlist, RPM limit, expiry, revocation and `last_used_at`.
- Publishable tokens: origin allowlist enforced with CORS and an `Origin` check, run scope only, low RPM.
- Browser tokens: 5-minute ES256 JWTs minted by `POST /api/v1/tokens/browser` with an `sk_` token, bound to origin and set list. They are signed by a platform key (`SYSONE_JWT_SIGNING_KEY`) with a `kid`, and the JWKS is published at `/api/v1/.well-known/jwks.json`. On key rotation, publish the new `kid` before signing with it, and keep the old one until its tokens expire.
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

- Minted in the console settings, or by the device flow (`sysone login`, the MCP server, the Chrome extension). In the device flow the person approves the code in a console session and picks the org, scopes and role ceiling. The ceiling cannot exceed their own role. Device codes are single use and expire after 10 minutes.
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
- TypeSafe key rotation or revocation
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

## Authorization

- `can(ctx, action, resource)` in `packages/core/src/authz.ts`. Every operation calls it through `runOperation`, so Server Actions and route handlers get the same check.
- RLS is the backstop, not the primary check.
- Cross-tenant requests return 404. `403 insufficient_scope` applies only to resources in the caller's own org.
- Sets marked `protected` need an admin to publish. An agent needs an approval on top: an admin ceiling alone is not enough.

## Rate limits for agents and evals

- Evals, playground compare, Studio calibration, try-model and repeat runs use a separate **eval** limiter bucket. By default it gets 25 percent of the org's RPM and the lowest priority in the global budget, so an agent iterating on a set cannot starve production runs.
- The global budget is a per-model setting: about 1,000 RPM for `jev-1.13.0`, roughly 83 percent of the published 1,200. Limiter keys include the model.
- Per-token limits apply to agent tokens as they do to app tokens. The daily spend cap is above.

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
- Stripe webhook signatures verified. Our outbound webhooks (plugin actions and org events) are signed with HMAC using secrets in `org_webhook_secrets`, which are encrypted like TypeSafe keys.
- zod validation and size caps on every input.

## Extensions

- **Chrome extension:** no TypeSafe key, ever. It signs in with the device flow and holds an agent token with client `extension` and scopes `run`, `sets:read`, `review:read` and `review:write`, kept in `chrome.storage.session`. It sends nothing until the user clicks, and shows the state for preview and redaction first. Permissions: `activeTab` and `storage`. Autonomous clicks follow the rule in "State is untrusted".
- **MCP server and CLI:** agent tokens only. Never an `sk_` app token, never a TypeSafe key.
- **Generated code:** generated browser code never contains `sk_` tokens or TypeSafe keys. The CI bundle scan covers codegen output as well as the embed kit.
