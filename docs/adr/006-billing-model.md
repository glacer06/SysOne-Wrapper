# ADR-006: Billing model

- **Status:** proposed
- **Date:** 2026-09-26
- **Owner:** Billing / Savings
- **Contract impact:** the `PlanId` values are fixed here; the schema stays `^[a-z][a-z0-9_]{0,31}$`. In data-model.md, `usage_events.kind` changes from `system_one_input_tokens | run` to `run | eval_run | system_one_cost | llm_cost`, and `usage_events` gains a nullable `job_id` and `push_status` (`pending | sent | skipped`). No change to `RunResult`, the error envelope or any operation.

## Context

ADR-001 picks Stripe Billing with usage meters. phase-2.md asks for plans with limits in code, Stripe meters, Checkout, the Customer Portal, idempotent webhooks, a grace period with read-only mode, and a meter outbox keyed by run id. It says to meter System One cost in micro-USD, never raw tokens at one rate. The exit gate: on a Stripe test clock, invoiced System One spend matches `usage_daily` within 0.1 percent. [architecture.md](../../.claude/skills/sysone-builder/references/architecture.md#core-contracts-packagescoresrccontracts) leaves the plan ids to this ADR.

Facts from the references:

- Money is integer micro-USD. Each System One call is priced by its `model_resolved` from the price book, and a platform-key run on an unpriced model is refused with `422 model_unpriced` ([savings-model.md](../../.claude/skills/sysone-builder/references/savings-model.md#money-math)).
- `usage_events` is an outbox written in the run's transaction. "Every successful run has usage events" is a tested invariant. A replayed run writes none ([ADR-007](007-headless-parity.md)).
- BYO-key orgs pay TypeSafe directly. Platform-key orgs pay us for System One spend. LLM calls (`escalate_to_llm`, Studio drafting, improve mode) use SysOne's Anthropic key in every key mode.
- Checkout and the portal are hosted by Stripe and are not operations (ADR-007). Only owners manage billing.

## Decision

### Plans in code

`packages/billing/src/plans.ts` exports `plans: Record<PlanId, Plan>`, parsed with zod when the module loads. The database holds only `billing_accounts.plan` and `entitlement_overrides`. Only `packages/billing` imports `stripe`.

```ts
Plan = {
  id: PlanId, name: string, selfServe: boolean,       // selfServe: offered in Checkout
  keyModes: Array<"byo" | "platform">,
  stripe: { base: string | null, runs: string | null, evalRuns: string | null,
            systemOneCost: string | null, llmCost: string | null },   // Stripe price lookup_keys; null = not sold
  limits: { runsPerMonth: number | null, evalRunsPerMonth: number | null,
            platformSystemOneSpendMicroUsdPerMonth: number | null, rpm: number,
            seats: number | null, apps: number | null, sets: number | null,
            retentionDaysMax: number },                 // null = unlimited
  features: { sso: boolean },
  graceDays: number,
}
```

- Plans point at Stripe prices by `lookup_key`, never by price id, so test mode and live mode share code. A CI check and a deploy script confirm every lookup key exists in the target Stripe mode.
- Entitlements are the plan's `limits` and `features` with `entitlement_overrides` applied on top. An override key must be a `limits` or `features` key; zod checks it.

| Plan id | For | Key modes | Stripe |
|---|---|---|---|
| `free` | trying SysOne | BYO | no customer |
| `team` | small teams, self-serve | BYO or platform | base price plus meters |
| `business` | larger orgs, self-serve, SSO | BYO or platform | base price plus meters |
| `enterprise` | sales-led, set by the platform admin | BYO or platform | custom prices on the same meters |
| `internal` | Nick's own orgs (SGR, Personal, Dallas), set by the platform admin | BYO or platform | no customer; spend still lands in `usage_daily` |

Prices, limit numbers, the markup and whether `free` gets a small platform-key allowance are Nick's call. They live in Stripe and `plans.ts`, not in this ADR.

### Meters

Four Stripe meters, each summing `value`, with `stripe_customer_id` in the payload. Each `usage_events.kind` maps to one meter.

| Kind and meter | Value | Written when | Priced |
|---|---|---|---|
| `run` -> `sysone_runs` | 1 | every successful run a caller made | graduated price; the plan's included runs are a free first tier, so Stripe computes overage and our code never does |
| `eval_run` -> `sysone_eval_runs` | 1 | eval cases and challenger samples, runs SysOne makes to measure a version | unpriced by default; recorded so it can be priced later with no code change |
| `system_one_cost` -> `sysone_system_one_cost` | the run's `system_one_cost_micro_usd` | platform key mode only, any run kind | per micro-USD through `unit_amount_decimal`; 1 micro-USD at cost is 0.0001 cents |
| `llm_cost` -> `sysone_llm_cost` | the LLM cost in micro-USD | every run with escalation cost, and jobs that call an LLM | same as above |

Why cost and not tokens: the run already carries its cost, priced per call by the resolved model. Metering that integer means the invoice and the savings ledger use the same number, output-token prices are included, and a new model needs a price book row but no new Stripe meter or price.

### Outbox and push

- `RunSink` writes the rows in the run's transaction: `run` or `eval_run` for every successful run (the invariant holds), `system_one_cost` when `key_mode` is `platform`, `llm_cost` when escalation cost is above zero. Jobs that call an LLM outside a run write `llm_cost` rows with `job_id` in place of `run_id`. Exactly one of the two is set.
- The push job runs every minute on the [ADR-005](005-jobs-runner.md) runner. It finds orgs with `pending` rows through the audited platform path. Then, per org inside `withTenant`, it locks up to 500 rows with `for update skip locked`, sends one meter event per row and marks them `sent`.
- An org with no Stripe customer at push time gets its rows marked `skipped`, so usage from before a subscription is never billed later.
- The meter event `identifier` is `<run_id>:<kind>`, or `<job_id>:<row_id>` for job rows. Stripe enforces uniqueness for at least 24 hours, so a retried push does not double count.
- The event `timestamp` is the run's `created_at`, so usage lands in the period it happened. Stripe accepts timestamps up to 35 days old. The job raises a platform alert when the oldest `pending` row is more than 10 minutes old.
- At the current global budget (about 1,000 RPM for `jev-1.13.0`) this is at most about 50 meter events per second. If volume outgrows per-event calls, move to Stripe's meter event stream or to per-org, per-minute sums with `<org_id>:<kind>:<minute>` identifiers.

### Reconciliation, webhooks and account state

- **Reconciliation.** A nightly job compares, per org and day, `sent` rows with Stripe's meter event summaries and with `usage_daily`. A gap above 0.1 percent raises a platform alert. This is the check behind the Phase 2 exit gate.
- **Webhooks.** `app/api/stripe/webhook` verifies the signature with `STRIPE_WEBHOOK_SECRET`. It inserts the event id into `stripe_webhook_events` in the same transaction as the state change, and a duplicate id is a no-op. It handles `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid` and `invoice.payment_failed`. Subscription events re-read the subscription from Stripe instead of trusting the payload, so out-of-order delivery cannot roll a plan back. Plan changes write an audit row with the system actor.
- **Failed payment.** `invoice.payment_failed` sets `billing_accounts.status` to past due and `grace_until` to now plus `graceDays` (proposed: 7). During grace everything works and owners see a banner. After grace the org is read-only. Mutating operations and platform-key runs return `402 quota_exceeded` with a portal link, so no new error code is needed. Reads, billing access and moves toward safety (pause, rollback, token and key revocation) never stop. Proposal, Nick's call: BYO-key runs keep serving after grace, so customer apps do not break over an invoice.
- **Quota.** `QuotaGuard` checks `runsPerMonth` and platform spend against `usage_daily` for past days plus a same-day Redis counter ([ADR-004](004-cache.md)), and returns `402 quota_exceeded` at the limit. `eval.run` checks `evalRunsPerMonth` once, up front, from the case count times repeats, so the `QuotaGuard` port keeps its signature. At 80 percent of any limit the quota job emits `alert.raised` with kind `quota`.

## Options considered

| Option | Pros | Cons |
|---|---|---|
| Cost meters in micro-USD plus run meters, plans in code, outbox (chosen) | One number on the invoice and in the ledger. New models need no Stripe change. Limits are typed and reviewed in PRs. A Stripe outage never fails a run. | Stripe invoices show dollars of usage, not tokens per model; the usage report fills that gap. |
| One meter per model, token prices in Stripe | Invoice lists tokens per model. | Every new model needs Stripe changes before it can be billed. Prices live in Stripe and the price book and drift apart. |
| One token meter at one rate | Simplest. | Misprices every model but one. phase-2.md rules it out. |
| Plans and limits in Stripe product metadata | Change limits without a deploy. | Untyped and untested. Reading a limit needs a Stripe call. Changes skip code review. |
| Push to Stripe in the request path | No outbox table. | A Stripe outage fails or loses usage, and a retried request can bill twice. |

## Consequences

- data-model.md: the new `usage_events` kinds, `job_id`, `push_status` and the invariant wording. phase-2.md: the plan ids and meters. architecture.md: the `PlanId` comment points here.
- Tests to add: a replayed run pushes nothing new; a retried push sends the same identifiers; rows of an org with no customer end `skipped`; an out-of-order `customer.subscription.updated` does not roll the plan back; a read-only org can still pause and roll back; the test-clock reconciliation from the Phase 2 exit gate.
- The Stripe connector must be authorized in claude.ai before agents create meters and prices (PLAN.md).

## Rollout

- Phase 2: `plans.ts`, the four meters and prices in Stripe test mode, Checkout and the portal, webhooks, the outbox push, reconciliation and the quota guard.
- Before the first paying customer: Nick sets prices, limits and the markup, and the live-mode lookup keys are created.
- Reversal: plans are code and meters are data in Stripe. Adding a meter or retiring one is a new kind and a `plans.ts` change. Existing rows keep their kind, and history is never rewritten.
