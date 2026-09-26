# ADR-005: Background jobs runner

- **Status:** proposed
- **Date:** 2026-09-26
- **Owner:** Platform / Tenancy
- **Contract impact:** none. The `jobs` table and `GET /api/v1/jobs/{id}` stay the public job status ([management-api.md](../../.claude/skills/sysone-builder/references/management-api.md#jobs)). Two env vars, `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY`, are added when the runner lands in Phase 2.

## Context

ADR-001 hosts on Vercel with no long-running workers and leaves the runner to this ADR. Work that must run outside a request ([architecture.md](../../.claude/skills/sysone-builder/references/architecture.md#background-jobs)):

- **Scheduled:** the meter outbox push every minute ([ADR-006](006-billing-model.md)); nightly rollups, retention, registry sync, contract watch and key checks; the hourly gate evaluator and auto-demote (Phase 3); the weekly threshold refit (Phase 3b); pruning; approval reminders and expiry.
- **Triggered:** `eval`, `compare`, `calibrate`, `improve`, `try_model`, `policy_suggest` and `export` jobs, which return `202 { jobId }`; action dispatch after a run commits, idempotent by `runId:decisionId`; webhook deliveries with retries; the KEK re-wrap ([ADR-003](003-key-vault.md)); cache invalidation retries ([ADR-004](004-cache.md)).

Constraints:

- A 5,000-case eval in one org must not move that org's production p95 by more than 10 percent (phase-2.md exit gate). One org's jobs must not starve another's.
- Each unit of work must fit inside a Vercel function's time limit, or run somewhere else.
- Job code needs the database, the key vault and TypeSafe keys. Every place that holds those is inside the trust boundary.
- Unit tests make no network calls.

## Decision

**Recommendation: Inngest**, with job functions served from the console's own deployment.

1. **Served by us.** One route handler under `apps/console/app/api/jobs/` serves every function. Inngest calls it over HTTPS, signed with `INNGEST_SIGNING_KEY`, and the route rejects unsigned calls. Job code runs on our Vercel functions with our env, so secrets stay where they already are.
2. **Thin wrapper.** Only `apps/console/src/jobs/**` imports `inngest` (a new boundary rule). Each job's logic is a plain async function that takes a `TenantContext` (the system actor, or the actor that started it), its input and a small `steps` interface. It is unit-tested without Inngest and could move to another runner.
3. **Status lives in our `jobs` table**, never in Inngest. `job.get` reads the table.
   - The operation inserts the `queued` row inside its own transaction.
   - After commit it sends an event whose `id` is the `jobId`, and Inngest ignores a duplicate id.
   - A sweeper runs every minute and re-sends `queued` rows older than 2 minutes. That covers a crash between commit and send.
4. **Ids only in Inngest.** Event payloads and step outputs carry ids, counts and cursors (`orgId`, `jobId`, `runId`). Inngest stores both, so state, answers, keys and tokens never go in them. Steps read what they need from Postgres inside `withTenant`.
5. **Long jobs run as steps.** An eval runs its cases in chunks of about 50 per step, each well under the function time limit, and aggregates at the end. A retry replays only the step that failed.
6. **Fairness.** Every tenant function sets an Inngest concurrency key on `orgId`, plus a global limit. Eval-type jobs also draw from the eval limiter bucket, which caps them at 25 percent of the org's RPM with the lowest priority ([security.md](../../.claude/skills/sysone-builder/references/security.md#rate-limits-for-agents-and-evals)).
7. **Schedules** are Inngest cron functions. A scheduled job that covers every org sends one event per org, so one failing org does not block the rest.
8. **Action dispatch** sends one event per decision with `id` set to `runId:decisionId`, which gives `ActionRegistry` its idempotency.
9. **Local and CI.** Development uses the Inngest Dev Server. Unit tests call job functions directly with an in-memory `steps`. No test calls Inngest's cloud.

## Options considered

| Option | Pros | Cons |
|---|---|---|
| Inngest (recommended) | Runs inside our Vercel deployment: no second compute and no second home for secrets. Durable steps, retries, cron, fan-out, per-key concurrency and dedupe by event id are built in. Dev server for local work. The server is open source and can be self-hosted if we leave the cloud. | Orchestration is a vendor service that stores event payloads and step outputs, which is why rule 4 exists. Billed per step. Every step must fit a function's time limit. |
| Trigger.dev v4 | Tasks have no time limit, so long evals need no chunking. Queues with concurrency keys, retries, cron and live run status. Open source and self-hostable. | Tasks run on Trigger.dev's compute, or ours if self-hosted, not on Vercel. The database URL, the KEK reference and the vault code have to be deployed there too. That widens the trust boundary and adds a second deploy pipeline for the Security reviewer to cover. |
| Vercel Cron plus a queue (Upstash QStash or Vercel Queues) | Fewest new parts. Cron is part of the host, and QStash reuses the Upstash account from ADR-004. HTTP delivery with retries. | We would build step memoization, fan-out, per-org concurrency and job visibility ourselves. Vercel Cron does not retry a failed invocation and does not stop overlapping runs, so every scheduled job would need its own lock. |

## Consequences

- Platform / Tenancy owns the job route, the sweeper and the boundary rule. Quality / Learning writes its jobs in `apps/console/src/jobs/learning` against the same `steps` interface. Billing / Savings writes the meter push and reconciliation jobs.
- Inngest goes on the vendor list. It receives ids and counts only, never tenant content.
- Tests QA adds:
  - a duplicate send of a job event runs the job once
  - a crash between commit and send is recovered by the sweeper
  - a payload scan fails when an event or step output has a field named `state`, `answers`, `apiKey` or `token`
  - the 5,000-case eval k6 gate from phase-2.md
- Docs: architecture.md's Background jobs section and ADR-001's Background jobs row point here. `.env.example` gains the two Inngest vars in Phase 2.

## Rollout

- Phase 2: the job route, the sweeper, the meter push (ADR-006), approval reminders and expiry, retention, registry sync and the KEK re-wrap.
- Phase 3: the eval, compare, calibrate, improve, try_model, policy_suggest and export job kinds, the gate evaluator and auto-demote. Action dispatch moves onto the runner when the first action handler ships.
- Reversal: jobs are plain functions behind a thin wrapper, with status in our own table. Self-hosting the Inngest server is the first fallback. Moving to Trigger.dev or cron plus a queue means a new wrapper and route, not rewritten jobs.
