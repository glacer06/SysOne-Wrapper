# Phase 2: Tenancy, auth, keys, billing foundation

**Owners:** Platform / Tenancy, Billing / Savings, Console UI (shell), Security reviewer. **Needs:** Phase 1 schema.

## Platform / Tenancy
- [ ] Auth per ADR-002: orgs, memberships, invites (7-day token links), five roles, active org
- [ ] Org switcher and `/[orgSlug]` routing
- [ ] BYO key vault with envelope encryption (KMS in prod), validate on save, rotate, invalid-key handling
- [ ] Platform key mode
- [ ] App tokens (`sk_live_`, `sk_test_`, `pk_live_`): create (show once), scope, set allowlist, origins, revoke
- [ ] Rate limiters: per org (plan), per token, global platform budget (about 1,000 RPM) with per-org fair share
- [ ] Audit writes inside `withTenant` for every mutation
- [ ] Platform admin route group: org list, suspend, entitlement overrides, impersonation with banner

## Billing / Savings
- [ ] `plans.ts` with limits: runs/month, platform tokens/month, RPM, seats, apps, sets, retention max, SSO, eval runs
- [ ] Stripe products, meters, Checkout, Customer Portal
- [ ] Webhooks with idempotency table; grace period and read-only mode on failed payment
- [ ] Meter outbox job (usage events to Stripe, run ID as idempotency key)
- [ ] Price book defaults and per-org overrides
- [ ] Quota guard reading `usage_daily` plus same-day Redis counter

## Console UI
- [ ] Shell: layout, org switcher, nav, settings pages (members, keys, apps, billing, retention, PII)

## Exit gate
- One user in three orgs (SGR, Personal, Dallas style seed) switches with no data leak (Playwright).
- One Playwright test per role proves its permissions.
- Log scrubber test: no key material in logs or responses.
- k6: one org at its limit does not move another org's p95 latency.
- Stripe test clock: subscribe, run 1,000 runs, invoice tokens reconcile with `usage_daily` within 0.1%.
- Replaying a webhook is a no-op.
