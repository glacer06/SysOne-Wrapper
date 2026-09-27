# Team playbook

This is how a team of Claude agents (and humans) builds SysOne in parallel without stepping on each other.

## Roles and ownership

| Role | Owns | Active from |
|---|---|---|
| **Architect / Lead** | This skill, `packages/core/src/contracts`, `openapi.json`, ADRs, boundary lint rules, the Phase 0 operation registry skeleton, merge order. Reviews every PR that crosses packages. | Phase 0 |
| **Core Engine** | `packages/core` (compiler, question-types, stages, router, composites, lints, cost + savings, preflight), `packages/system-one-client`, `packages/llm-client` | Phase 1 |
| **Platform / Tenancy** | `packages/db` (schema, RLS, `withTenant`, repos), `packages/tenancy` (Better Auth wiring, vault, app and agent tokens, rate limits), `apps/console/src/server/**` (operation registry and services), `apps/console/app/api/**` (`/api/v1` run and management routes, device flow, jobs, events, webhooks), audit, cache, the `system_one_models` table, and the registry sync and contract watch jobs | Phase 1 (schema), Phase 2 |
| **Billing / Savings** | `packages/billing` (plans, entitlements, Stripe, meter outbox, webhooks), savings rollups, reports, price book | Phase 2 |
| **Console UI** | `apps/console/app/(org)/**` and `app/(platform)/**` UI: org switcher, editor, policy editor, playground, runs, review queue, evals, Definition Studio, dashboards, approvals inbox, settings, platform admin UI. Calls operations, never repositories. | Phase 2 (shell), Phase 3 |
| **Embed Kit** | `packages/client`, `packages/react`, `apps/example-embed` | Phase 4 (can start against mocks in Phase 3) |
| **QA / Evals** | `packages/evals`, fixtures, cross-tenant suite, Playwright, k6, CI gates, live smoke job, the parity test, holdout API tests, codegen snapshot tests, contract snapshots | Phase 0 onward |
| **Integrations** | `packages/cli`, `packages/mcp-server`, `packages/codegen`, `packages/client-py`, `plugins/claude-code` (customer skills and packaging), `examples/*` sample apps. Co-owns `headless-and-agents.md` and `deploy-and-codegen.md` with Docs. | Phase 1 (local CLI), Phase 3 |
| **Quality / Learning** | `packages/core/src/learning` (pure: gate evaluator, precision intervals, threshold suggester, label selector, drift stats, stability), `apps/console/src/jobs/learning` (gate evaluator, auto-demote, question rollup, threshold refit, experiment scorer, model-upgrade candidates), `effectiveness-loop.md` | Phase 3 |
| **Extensions** | `packages/plugin-sdk`, `plugins-builtin`, `apps/extension-chrome` | Phase 5 onward |
| **Security reviewer** (part-time) | Threat model; reviews every change to keys, authz, tokens, agent tokens, approvals, the device flow, webhooks, embed, extension, codegen output and the standalone export | Phase 2 onward |
| **Docs** | `apps/docs` (the public customer docs site), skill references, API docs, embed quickstart, DPA and subprocessor notes | Continuous |

If a file isn't in your lane, don't edit it. Open a handoff (below).

## Contracts that make parallel work possible

1. **zod schemas** in `packages/core/src/contracts`: `QuestionSetSpec`, `ConfidencePolicy`, `RunRequest`, `RunResult`, `TenantContext` (with the agent actor), the error envelope v2, `OperationDef` (`management-api.md`), `ModelProfile` (`system-one-models.md`), `QuestionTypeModule`, `Condition`, `Check`, `FallbackConfig` and `SetInterface` (`spec-schema.md`), `DeployTarget` and `Opportunity` (`deploy-and-codegen.md`), `FeedbackReport`, `QualityTarget`, `SetHealth` and `ThresholdProposal` (`effectiveness-loop.md`), and `EventEnvelope` (`events.md`).
2. **Ports**: `SystemOneTransport`, `KeyResolver`, `RateLimiter`, `QuotaGuard`, `RunSink`, `ActionRegistry`, `PriceBook`, `ModelCatalog`, `LlmTransport`. Each has an in-memory or fixture implementation so nobody waits on anybody.
3. **Store interfaces**: `VersionStore`, `RunStore`, `ReviewStore`, `AuditStore`, `ApprovalStore`, `EventStore`, `IdempotencyStore`.
4. **`openapi.json`** generated from zod and the operation registry, plus MSW handlers generated from it.
5. **Plugin interfaces**: `InputAdapter`, `QuestionTemplate`, `ActionHandler`.

Changing any of these needs an ADR (`templates/adr.md`) approved by the Architect, plus updated fixtures and mocks in the same PR.

## Order of work

```
Phase 0   Architect alone: skill, plan, scaffold, contracts, ADRs 002 to 010
   |
Phase 1   Core Engine  ||  Platform (schema, RLS, registry table)  ||  QA (fixtures, cross-tenant harness)
          ||  Integrations (local CLI)
   |
Phase 2   Platform (auth, app and agent tokens, approvals, limits)  ||  Billing (Stripe, outbox)  ||  Console shell
   |
Phase 3   Console UI  ||  Platform (operations, /api/v1)  ||  Integrations (CLI, MCP stdio)
          ||  Quality / Learning (gates, auto-demote, audit sampler)  ||  Billing (reports)  ||  Embed Kit on mocks
   |
Phase 4   Embed Kit (real API)  ||  QA (bundle scan, E2E)
          ||  Phase 3b  Quality / Learning (effectiveness loop)
          ||  Phase 4b  Integrations (integrate and deploy)
          All three start when Phase 3 lands and run in parallel.
   |
Phase 5   Extensions (plugins, templates)  ||  Platform (org event webhooks)  ||  Integrations (GitHub Action)
   |
Phase 6   Chrome extension   ||   Phase 7  Integrations (MCP HTTP, Claude Code plugin)
```

## Working rules

- **One worktree and branch per agent per task.** Name: `<role>/<phase>-<short-task>`, for example `core/p1-router`.
- **Small PRs.** One checklist item or a tight group per PR.
- **Tests first** against fixtures or in-memory stores.
- **Run the gate before pushing:** `pnpm turbo lint typecheck test`.
- **Update the phase checklist** in the same PR that completes an item.
- **Track work in Linear**, project SysOne (`P-NSI-36`) in the NSIMS team, one milestone per phase. Put the issue key, for example `NSI-412`, in the PR title and branch name.
- **A console feature is not done until its operation, route and OpenAPI path exist and the parity test passes.**
- **Don't guess System One behavior.** Read the live docs or run `pnpm smoke`. Record new fixtures when behavior matters.

## Docs site

The public customer docs live in `apps/docs`, a Fumadocs site. Run it with `pnpm --filter @sysone/docs dev` (port 3001).

- **Every phase adds or updates its customer pages as part of done.** Each phase checklist names the pages it owes. A phase is not done while its pages are missing or out of date.
- **Pages for unbuilt features say so.** Use a callout that says "Coming in Phase N" or "Available from Phase N". Never describe an unbuilt feature as live.
- **Facts come from the repo.** Every claim must match the references and the contracts. If you are not sure, leave it out.
- **Brand in one place.** The product name, docs domain and GitHub URL live in `apps/docs/src/site.ts`. Pages write the product name as `%product%`. Code identifiers keep their real names (`sysone`, `@sysone/*`, `SYSONE_*`).
- **The API reference is generated** from `packages/core/openapi.json` at build time. Do not copy the schema into the site. `llms.txt` and `llms-full.txt` are generated from the same pages.
- **Independent product.** The footer says the product is independent and built on TypeSafe's System One models, and links docs.typesafe.ai. Never present the site as TypeSafe's docs.
- Content tests in `apps/docs/test` check that every page is listed, that the quickstart spec validates, and the writing rules below.

## Handoff protocol

When you need a change in someone else's lane, open a Linear issue in the SysOne project, with the receiving role label and the phase milestone, or comment on the PR. Include:

```
Handoff: <from role> -> <to role>
Need: <what, one sentence>
Why: <which checklist item it blocks>
Contract impact: none | <ADR link>
Proposed shape: <types or example>
```

The owner replies with accept, counter-proposal, or ADR needed.

## PR template sections

- Summary
- Phase and checklist item
- Contract impact (none, or ADR link)
- Tenancy impact (new tables, RLS, cross-tenant tests)
- Security impact (keys, tokens, authz, PII)
- Tests added
- Docs updated

## Useful tools for agents

- **Official TypeSafe skill** (required): `claude plugin marketplace add typesafe-ai/skills` then `claude plugin install typesafe@typesafe-ai`.
- **Live docs**: `https://docs.typesafe.ai/llms.txt`.
- **The builder skill is internal.** The customer Claude Code plugin ships its own `sysone-operator` and `sysone-integrate` skills (Phase 7).
- **Long sessions** (optional, unverified): The Code (2026-09-26) describes `tamaratran/fast-jev-compaction`, a plugin that uses Jev to prune stale tool calls on `/compact`. It reportedly needs `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1` and Claude Code 2.1.274+. Try it on long agent sessions if you want; don't make the team depend on it.
- **Connectors**: Stripe, Linear (project SysOne, `P-NSI-36`, in the NSIMS team) and Sentry MCP servers need authorization in claude.ai before an agent can use them.

## Official TypeSafe skill version

The official skill (`typesafe-ai/skills`, plugin manifest 0.5.7 as read on 2026-09-26) is the one agents must install. Update it before any new integration: a stale copy is TypeSafe's documented cause of invented request and response fields. When the manifest version changes, re-read `system-one-api-contract.md` against the live docs in the same PR.
