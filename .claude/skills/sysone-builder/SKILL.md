---
name: sysone-builder
description: Use when building, extending, reviewing, or planning any part of the SysOne Wrapper monorepo, a multi-tenant SaaS kit around TypeSafe's Jev (System One) model. Covers the console (Next.js, Drizzle, Postgres RLS, Auth.js, Stripe), the core run engine and confidence router, question set specs and versions, the savings ledger and admin reports, the Definition Studio, the embed kit (@sysone/client, @sysone/react), plugins, the Chrome extension, and the MCP server. Also use whenever code calls Jev or System One (noul, choice, score, confidence bands, state). Encodes architecture, contracts, conventions, phase checklists, and the agent team playbook. Defers raw Jev API details to the official typesafe skill and docs.typesafe.ai.
---

# SysOne Builder

SysOne Wrapper is a multi-tenant SaaS that wraps TypeSafe's **Jev** model in a managed product. Orgs define goals, build versioned question sets, tune confidence bands, publish them live, and call them from any app by ID. Every run reports what it cost and what it saved against an LLM.

This skill is the rulebook for the agent team building it. Read it before touching code. Read the phase checklist for the work you were handed. Then read only the references that task needs.

## Glossary

| Term | Meaning |
|---|---|
| **Org** | A tenant. One user can belong to many (for example SGR, Personal, Dallas). Every tenant row carries `org_id`. |
| **Project** | A grouping inside an org (a business line or an app). |
| **Goal** | What a decision is for, with a success metric. Every question set belongs to one. |
| **Question set** | A named, versioned bundle of Jev questions plus policies. Called by ID or slug. |
| **Version** | An immutable snapshot of a question set's `QuestionSetSpec`. Drafts are mutable; published versions never change. |
| **Channel** | A release pointer (`production`, `staging`) that points at one version. Rollback moves the pointer. |
| **Stage** | One Jev call inside a run. Questions in a stage run in parallel and cannot see each other. Later stages can see earlier answers. |
| **Confidence policy** | Per-question thresholds that turn an answer into a **band** (high, medium, low) and each band into an **action**. |
| **Action** | `auto`, `review`, `fallback`, or `escalate_to_llm`. |
| **Rollout stage** | `draft`, `shadow`, `controlled`, `full`, `paused`. Shadow logs but never acts. Controlled lets only the high band act. Paused is the kill switch. |
| **Run** | One execution of a question set. Produces the standard `RunResult` envelope. |
| **Savings ledger** | Per-run and rolled-up record of Jev cost vs. an LLM counterfactual, LLM calls avoided, and context tokens pruned. |
| **Review item** | A medium or low band answer waiting for a human. Resolving it can add a labeled case to a dataset. |

## Golden rules

1. **Tenant isolation is not optional.** Every tenant table has `org_id` and a Postgres RLS policy. Every request sets `app.current_org`. A query that can cross orgs is a P0 bug.
2. **Jev keys never leave the server.** Only `apps/console` server code and `packages/jev-client` touch them. No `dangerouslyAllowBrowser`. Ever.
3. **`packages/core` is pure.** No I/O, no env access, no DB, no network. It takes data in and returns data out.
4. **Contracts change only through an ADR.** The zod schemas in `packages/core/src/contracts` are what lets the team work in parallel. See `templates/adr.md`.
5. **Published versions are immutable.** Change means a new version. A DB trigger enforces it.
6. **Pin the model once thresholds are tuned.** `jev-latest` moves. A publish lint blocks aliases on sets with tuned thresholds.
7. **Every mutation writes an audit row.** Every one, including platform admin actions and impersonation.
8. **No live Jev calls in unit tests.** Use the fixture transport. Live calls live in `pnpm smoke`, gated on `TYPESAFE_API_KEY`.
9. **Every run returns the standard envelope,** including the cost and savings block. No endpoint invents its own shape.
10. **Questions and thresholds live in the spec, not in code.** That is what makes them reviewable and managed live.

## Jev: where the truth lives

Our wrapper contract is in `references/jev-api-contract.md`. For anything about Jev itself, go to the source:

- Install the official skill once per machine:
  `claude plugin marketplace add typesafe-ai/skills` then `claude plugin install typesafe@typesafe-ai`
- Read the live docs index before changing any Jev payload: `https://docs.typesafe.ai/llms.txt`. Append `.md` to any docs page for Markdown.
- Pages you will use most: `/api.md`, `/models.md`, `/confidence.md`, `/primitives.md`, `/primitives/advanced.md`, `/sdk/javascript.md`, `/patterns.md`, `/cookbooks.md`.

If the live docs and this skill disagree, the docs win. Fix the skill in the same PR.

## Architecture map

```
apps/console        Next.js App Router. Tenant console, platform admin, /api/v1. Only place with DB + Jev keys.
apps/example-embed  E2E target that consumes the embed kit.
apps/extension-chrome  Phase 6. WXT, MV3.
packages/core       Pure. Contracts, spec compiler, stage orchestrator, confidence router, composites, lints, cost + savings, token preflight.
packages/jev-client JevTransport: TypeSafe SDK (default), fixture/replay, later gateway transports.
packages/db         Drizzle schema, RLS policies, migrations, withTenant(), repositories.
packages/tenancy    TenantContext, key vault, app tokens, rate limits, quotas.
packages/billing    Plans, entitlements, Stripe, meter outbox, webhooks.
packages/client     @sysone/client. Server client, Next proxy route, short-lived browser tokens.
packages/react      @sysone/react. QuestionSetRunner, ConfidenceBadge, ProbabilityBars, ScoreGauge, ReviewQueue, SavingsCard.
packages/evals      Datasets, metrics, CLI, CI gate.
packages/plugin-sdk, plugins-builtin   Phase 5.
packages/mcp-server Phase 7.
plugins/claude-code Phase 7.
```

Dependency direction: `core` <- `jev-client`, `db`, `tenancy`, `billing` <- `console`. `client` <- `react`. Only `console` wires the server packages together. Boundary lint enforces it.

Details, the run data flow, and caching: `references/architecture.md`.

## How to work a task

1. **Find your phase.** Open `references/phases/phase-N.md`. Confirm your task is on its checklist and note the exit gate.
2. **Find your lane.** Check `references/team-playbook.md` for which role owns the files you will touch. If it is not yours, open a handoff, don't edit.
3. **Read the contracts** in `packages/core/src/contracts` (or, before Phase 0 part two lands, the shapes in `references/architecture.md` and `references/confidence-policy.md`).
4. **Write tests first** against fixtures or in-memory stores. See `references/testing.md`.
5. **Implement** following `references/conventions.md`.
6. **Run the gate:** `pnpm turbo lint typecheck test`. Add `pnpm smoke` if you touched `jev-client` and have a key.
7. **Update docs** in the same PR: this skill, the relevant reference, and the phase checklist box.

## Recipes (where to look)

| Task | Read |
|---|---|
| Add or change a question field | `jev-api-contract.md`, then an ADR |
| Add a lint | `architecture.md` (lints section), `confidence-policy.md` |
| Add an API route | `api.md`, `security.md`, `data-model.md` |
| Add a table | `data-model.md` (RLS checklist) |
| Add a React component | `architecture.md` (embed kit), `security.md` |
| Add a template or plugin | `definition-studio.md`, `templates/plugin.template.ts` |
| Touch cost, savings, or reports | `savings-model.md` |
| Change band logic | `confidence-policy.md` |

## Definition of done

- Tests pass locally and in CI. New logic has tests. Router and compiler changes keep 100% branch coverage.
- Tenant-scoped code has a cross-tenant test that fails closed.
- Mutations write audit rows.
- No secret in client bundles (the CI bundle scan passes).
- Contracts unchanged, or changed with an accepted ADR.
- Docs and the phase checklist updated.
- Prose follows the voice rules in the root `CLAUDE.md`.

## Reference index

- `references/architecture.md`: packages, run data flow, caching, lints, embed kit
- `references/jev-api-contract.md`: what we rely on from Jev, limits, errors, cost
- `references/confidence-policy.md`: bands, actions, rollout stages, defaults
- `references/data-model.md`: tables, tenancy, RLS, invariants, migrations
- `references/api.md`: `/api/v1` endpoints, auth modes, error envelope
- `references/savings-model.md`: savings math, comparator prices, reports
- `references/definition-studio.md`: the wizard, fit test, template library
- `references/conventions.md`: code style, naming, env, commits
- `references/testing.md`: fixtures, smoke, evals, Playwright
- `references/security.md`: keys, tokens, RBAC, audit, PII
- `references/team-playbook.md`: roles, lanes, contracts, handoffs
- `references/phases/phase-0.md` through `phase-7.md`: checklists and exit gates
- `templates/question-set.example.json`, `templates/adr.md`, `templates/plugin.template.ts`
