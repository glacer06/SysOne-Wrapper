# Phase 2: Tenancy, auth, keys, billing foundation

**Owners:** Platform / Tenancy, Billing / Savings, Console UI (shell), Security reviewer. **Needs:** Phase 1 schema.

## Platform / Tenancy
- [ ] Auth with Better Auth per ADR-002 (organization, admin and two-factor plugins, behind `resolveSession` in `packages/tenancy`, built-in member and org endpoints disabled): orgs, memberships, invites (7-day token links), five roles, active org
- [ ] Org switcher and `/[orgSlug]` routing
- [ ] BYO key vault with envelope encryption (KMS in prod), validate on save, rotate, invalid-key handling; validation stores the reachable model names in `org_system_one_keys.models` ([system-one-models.md](../system-one-models.md))
- [ ] Per-provider keys (ADR-011, once accepted): `org_system_one_keys` holds at most one key per `(org_id, provider)`; `key.get`, `key.rotate` and `key.revoke` take `provider`; `KeyResolver(ctx, provider)` never returns a key for another provider ([security.md](../security.md))
- [ ] Key validation per provider: TypeSafe with `GET /v1/models`; OpenRouter with its Models API plus one one-noul call, 401 rejects, 402 saves with a warning
- [ ] Registry sync per provider: OpenRouter keys list through OpenRouter's Models API (`typesafe/*`, `~typesafe/*`), never `client.models.list()`; unmapped OpenRouter ids alert the platform admin; the `~typesafe/jev-latest` target feeds alias detection ([system-one-models.md](../system-one-models.md), sections 6 and 15)
- [ ] Provider settings: `organizations.default_system_one_provider` through `settings.update`, and `question_sets.system_one_provider` through `set.update`; the pointer resolver fills `RunSettings.systemOneProvider`. Changing a set's provider re-runs the model lints
- [ ] Platform key mode, with a platform key per provider (`TYPESAFE_API_KEY`, `OPENROUTER_API_KEY`)
- [ ] App tokens (`sk_live_`, `sk_test_`, `pk_live_`): create (show once), scope, set allowlist, origins, channel binding (production by default), revoke. The `runs:write` and `feedback:write` scopes are for `sk_` tokens only.
- [ ] Agent tokens (`sa_live_`): role ceiling, scopes, 90-day maximum expiry, optional daily spend cap, created in settings; effective role is min(ceiling, current membership role), read on every request ([security.md](../security.md))
- [ ] Device flow: `POST /api/v1/auth/device/code` and `POST /api/v1/auth/device/token` (RFC 8628), approved in a console session
- [ ] `runOperation` steps per [management-api.md](../management-api.md): actor resolution, input validation, `can()`, the approval gate, idempotency and If-Match
- [ ] `approval_requests` and the approval step in `runOperation`; approved requests run their stored input unchanged
- [ ] `agentApprovals` org setting (`required` by default, `production_only`, `off`) with the always-gated list from [security.md](../security.md)
- [ ] Idempotency middleware on `idempotency_keys` (24 hours, same transaction as the operation)
- [ ] Browser token minting route `POST /api/v1/tokens/browser` with ES256 (`BANDWISE_JWT_SIGNING_KEY`, `kid`) and the JWKS at `/api/v1/.well-known/jwks.json`
- [ ] `org_webhook_secrets`, encrypted like System One keys
- [ ] Retention settings split: `state_retention_days`, `answers_retention_days`, `dataset_retention_days`
- [ ] Rate limiters: per org (plan), per token, an eval bucket (25 percent of org RPM by default, lowest priority), and a global budget per model from settings (about 1,000 RPM for `jev-1.13.0`) with per-org fair share. Limiter keys include the model.
- [ ] Audit writes inside `withTenant` for every mutation, with `actor_type`, `client`, `actor_token_id` and `approval_id`
- [ ] Platform admin route group: org list, suspend, entitlement overrides, impersonation with banner

## Billing / Savings
- [ ] `plans.ts` with limits: runs/month, platform System One spend per month, RPM, seats, apps, sets, retention max, SSO, eval runs
- [ ] Stripe products, meters, Checkout, Customer Portal. Meter System One cost in micro-USD (or one meter per model), never raw tokens at one rate.
- [ ] Webhooks with idempotency table; grace period and read-only mode on failed payment
- [ ] Meter outbox job (usage events to Stripe, run ID as idempotency key)
- [ ] Usage events carry the resolved model
- [ ] Price book defaults and per-org overrides, keyed by exact versioned model ID ([savings-model.md](../savings-model.md))
- [ ] Quota guard reading `usage_daily` plus same-day Redis counter

## Console UI
- [ ] Shell: layout, org switcher, nav, settings pages (members, keys, apps, agent tokens, billing, retention, PII, agent approvals)
- [ ] Approvals inbox: list pending requests, approve or reject in a console session

## Docs site
- [ ] Docs pages ([team-playbook.md](../team-playbook.md#docs-site)): Organizations, members and roles; Provider keys (bring your own TypeSafe, OpenRouter or AI Gateway key, validation, rotation), and update Providers to drop its Phase 2 callout; Agent tokens and approvals (scopes, role ceiling, device flow), and update Agents and MCP; Plans, billing and quotas

## Exit gate
- One user in three orgs (SGR, Personal, Dallas style seed) switches with no data leak (Playwright).
- One Playwright test per role proves its permissions.
- Demoting a user removes the matching permissions from their agent tokens on the next request.
- An agent token hitting a high-risk operation gets 202 and a pending approval; a human approves in the console and the stored input runs.
- Log scrubber test: no key material (`sk_`, `pk_`, `sa_live_`, TypeSafe keys) in logs or responses.
- k6: one org at its limit does not move another org's p95 latency.
- k6: a 5,000-case eval in org A does not move org A production p95 by more than 10 percent.
- Stripe test clock: subscribe, run 1,000 runs, invoiced System One spend reconciles with `usage_daily` within 0.1%.
- Replaying a webhook is a no-op.
