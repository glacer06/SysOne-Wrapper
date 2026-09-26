---
name: sysone-builder
description: Use when building, extending, reviewing, or planning any part of the SysOne Wrapper monorepo, a multi-tenant SaaS kit around TypeSafe's System One models (Jev first, then future models). Covers the console (Next.js, Drizzle, Postgres RLS, Better Auth, Stripe), the core run engine and confidence router, question set specs and versions, the model registry and model upgrades, headless management (management API, operation registry, @sysone/cli, MCP server, agent tokens, approvals), app onboarding and deploy (opportunities, typed codegen, deploy targets, app bindings, specs as code), the effectiveness loop (app feedback, labeling, quality targets, threshold tuning, champion/challenger, set health), the savings ledger and admin reports, the Definition Studio, the embed kit (@sysone/client, @sysone/react), plugins, and the Chrome extension. Also use whenever code calls Jev or System One (noul, choice, score, confidence bands, state). Defers raw Jev API details to the official typesafe skill and docs.typesafe.ai.
---

# SysOne Builder

SysOne Wrapper is a multi-tenant SaaS that wraps TypeSafe's **System One** models, Jev first and by default, in a managed product. Orgs set up apps, define goals, build versioned question sets, tune confidence bands, publish them live, and call them from any app by ID or through generated typed code. Every run reports what it cost and what it saved against an LLM.

SysOne is headless first. Every console capability is an operation that the console, `/api/v1`, the `sysone` CLI, the MCP server and agents share.

This skill is the rulebook for the agent team building it. This skill is internal. It never ships in the customer Claude Code plugin, which has its own operator and integrate skills (see `references/headless-and-agents.md`). Read it before touching code. Read the phase checklist for the work you were handed. Then read only the references that task needs.

## Glossary

| Term | Meaning |
|---|---|
| **Org** | A tenant. One user can belong to many (for example SGR, Personal, Dallas). Every tenant row carries `org_id`. |
| **Project** | A grouping inside an org (a business line or an app). |
| **Goal** | What a decision is for, with a typed `QualityTarget` (tier, precision targets, coverage, label minimum). Every question set belongs to one. |
| **Question set** | A named, versioned bundle of System One questions (Jev by default) plus policies. Called by ID or slug. |
| **Version** | An immutable snapshot of a question set's `QuestionSetSpec`. Drafts are mutable; published versions never change. `slug@draft` runs the mutable draft. |
| **Channel** | A release pointer (`production`, `staging`) that points at one version. Rollback moves the pointer. Each channel pointer also holds the rollout stage. |
| **Stage** | One System One call inside a run. Questions in a stage run in parallel and cannot see each other. Later stages can see earlier answers. Not the same thing as a rollout stage. |
| **Confidence policy** | Per-question thresholds that turn an answer into a **band** (high, medium, low) and each band into an **action**. |
| **Action** | `auto`, `review`, `fallback`, or `escalate_to_llm`. |
| **Rollout stage** | `inactive`, `shadow`, `controlled`, `full`, `paused`. Set per channel on the release pointer, never in the spec. Inactive means the channel does not serve runs (409 `set_not_live`). Shadow logs but never acts. Controlled lets only the high band act. Paused is the kill switch, set only by humans. The normative stage by band table is in `references/confidence-policy.md`. |
| **Run** | One execution of a question set. Produces the standard `RunResult` envelope. |
| **Savings ledger** | Per-run and rolled-up record of System One cost vs. an LLM counterfactual, LLM calls avoided, and context tokens pruned. |
| **Review item** | A decision waiting for a human: kind `action` (a review action) or kind `label` (a sampled audit or labeling request). Resolving it writes a truth row and can add a labeled case to a dataset. |
| **System One model** | Any TypeSafe model served by `POST /v1/systemone` and picked by the `model` field. Jev is the first family. |
| **Model profile** | A registry row in `system_one_models`: limits, question types, status, weaknesses. See `references/system-one-models.md`. |
| **Provider** | Who serves a System One call: `typesafe` (direct) or `openrouter` (ADR-011, proposed). Picked per org and per set. A `ModelRoute` row says how a model is reached through a provider other than TypeSafe: the id sent, the limits, and whether it is pinned. |
| **Pinned model** | A registry ID of kind `versioned` (for example `jev-1.13.0`). Aliases such as `jev-latest`, partial IDs such as `jev` or `jev-1.13`, and unknown names are moving. |
| **Operation** | One management capability with id `noun.verb` (for example `set.publish`). One handler behind the console, the API, the CLI and MCP. |
| **Job** | Long-running work started by an operation. Returns `202 { jobId }`; poll `GET /api/v1/jobs/{id}`. |
| **Agent token** | `sa_live_` token that belongs to one user in one org. Scoped. Effective role = min(role ceiling, current membership role). |
| **Approval** | A pending request that a human must decide before a high-risk agent operation runs. |
| **App binding** | A record that an app uses a set on a channel through a deploy target. |
| **Opportunity** | A proposed decision point in an app where System One fits. |
| **Deploy target** | `managed`, `managed_typed`, or `standalone`. See `references/deploy-and-codegen.md`. |
| **Set interface** | Input schema, question ids and types, choice options, score levels, composites, route outputs. Versioned by `interfaceMajor`. |
| **Precision** | The weighted share of labeled decisions in a band that match, over every counted row: app feedback, audit samples (weighted by `1 / sample_rate`), and reviewer resolutions. Gates use its 95 percent lower bound. Canonical definition: `references/effectiveness-loop.md` section 2. |
| **Agreement** | The same measure restricted to human reviewer rows (`audit` and `reviewer`), a subset of precision. Shown in the Human agreement report. Gates do not use it. |
| **Coverage** | Share of relevant gating decisions whose policy `action` is `auto` (not `effectiveAction`), so it can be measured in shadow. |
| **Proposal** | A suggested change, such as new thresholds or a model upgrade, that becomes a draft when accepted. |
| **Experiment** | A champion/challenger comparison across versions, models or policies. |
| **Event** | A structured record agents can read from the event feed. See `references/events.md`. |

## Golden rules

1. **Tenant isolation is not optional.** Every tenant table has `org_id` and a Postgres RLS policy. Every request sets `app.org_id`. A query that can cross orgs is a P0 bug.
2. **System One keys never leave the server.** Only `tenancy.KeyResolver` decrypts them and only `packages/system-one-client` sends them. No `dangerouslyAllowBrowser`. Ever.
3. **`packages/core` is pure.** No I/O, no env access, no DB, no network. It takes data in and returns data out.
4. **Contracts change only through an ADR.** The zod schemas in `packages/core/src/contracts` are what lets the team work in parallel. See `templates/adr.md`.
5. **Published versions are immutable.** Change means a new version. A DB trigger enforces it.
6. **Pin a versioned model before controlled.** Aliases and partial IDs are moving and are allowed only in `inactive` and `shadow`. Whether a name is pinned comes from the model registry, never from a pattern match.
7. **Every mutation writes an audit row.** Every one, including platform admin actions, agent actions and impersonation.
8. **No live System One calls in unit tests.** Use the fixture transport. Live calls live in `pnpm smoke`, gated on `TYPESAFE_API_KEY`.
9. **Every run returns the standard envelope,** including the cost and savings block. No endpoint invents its own shape.
10. **Questions and thresholds live in the spec, not in code.** That is what makes them reviewable and managed live. Code SysOne generates for apps (typed clients, standalone exports) is derived from the spec into one read-only generated file. Never hand-edit it.
11. **Headless parity.** Every console capability is an operation in `apps/console/src/server/operations`. Server Actions, `/api/v1` routes, the CLI and the MCP server are thin adapters over it. No capability exists only in the console, except Stripe checkout and portal, approval decisions and impersonation.
12. **Model facts are data.** Limits, question types and prices come from the model registry and price book, never constants in code. Code, schemas, columns, error codes and env vars say `systemOne` or `system_one`; UI copy may say Jev.
13. **Agents propose, humans approve.** High-risk agent operations wait for a human approval. Moves toward safety (pause, rollback, demote) are never gated. Human labels are ground truth; agent labels count only after a human confirms them. The test split never leaves the server.

## System One: where the truth lives

Our wrapper contract is in `references/system-one-api-contract.md`. Model facts (limits, question types, status, weaknesses, pinned or moving) are in `references/system-one-models.md`. For anything about the models themselves, go to the source:

- Install the official skill once per machine:
  `claude plugin marketplace add typesafe-ai/skills` then `claude plugin install typesafe@typesafe-ai`
- Read the live docs index before changing any System One payload: `https://docs.typesafe.ai/llms.txt`. Append `.md` to any docs page for Markdown.
- The machine-readable source is `https://api.typesafe.ai/openapi.json` (info.version 0.2.0 on 2026-09-26). The contract watch job diffs it nightly.
- Pages you will use most: `/api.md`, `/models.md`, `/confidence.md`, `/primitives.md`, `/primitives/advanced.md`, `/concepts/how-to-build-with-system-one.md`, `/model-jaggedness/jev-1.13.md`, `/patterns.md`, `/patterns/fan-out.md`, `/cookbooks.md`, `/cookbooks/consistency_choice_cookbook.md`, `/sdk/javascript.md`, `/sdk/python/usage.md`.

System One models are not fine-tuned per tenant. Improvement comes from instructions, criteria, state shaping, thresholds, stages and composites. Do not plan a fine-tuning feature.

If the live docs and this skill disagree, the docs win. Fix the skill in the same PR.

## Architecture map

```
apps/console        Next.js App Router. Tenant console, platform admin, /api/v1. Only place with DB + TypeSafe keys.
  src/server/operations   Operation registry. One OperationDef per capability behind console, API, CLI, MCP.
apps/example-embed  E2E target that consumes the embed kit.
apps/extension-chrome  Phase 6. WXT, MV3.
packages/core       Pure. Contracts, spec compiler, stage orchestrator, confidence router, composites, lints,
                    cost + savings, token preflight. src/question-types (one module per type),
                    src/learning (gates, precision intervals, threshold suggester, label selector).
packages/system-one-client  SystemOneTransport: TypeSafe SDK (default), fixture/replay, per-surface timeouts,
                    model list and alias probe helpers. Providers: TypeSafe direct, and OpenRouter by baseURL (ADR-011, proposed).
packages/llm-client Anthropic SDK only: Studio drafting, improve mode, opportunity drafting, escalate_to_llm.
packages/db         Drizzle schema, RLS policies, migrations, withTenant(), repositories.
packages/tenancy    TenantContext, key vault, app tokens, agent tokens, rate limits, quotas.
packages/billing    Plans, entitlements, Stripe, meter outbox, webhooks.
packages/client     @sysone/client. Server client, Next proxy route, short-lived browser tokens.
packages/react      @sysone/react. QuestionSetRunner, ConfidenceBadge, ProbabilityBars, ScoreGauge, ReviewQueue, SavingsCard.
packages/evals      Datasets, metrics, CLI, CI gate.
packages/cli        Phase 3. @sysone/cli (bin sysone), published to npm. HTTP client over /api/v1, plus --local fixture mode.
packages/codegen    Phase 4b. Pure. Typed clients from a set interface.
packages/client-py  Phase 4b, behind ADR-009. Python client generated from openapi.json.
packages/mcp-server Phase 3 stdio, Phase 7 HTTP. Curated tools over operations.
packages/plugin-sdk, plugins-builtin   Phase 5.
plugins/claude-code Phase 7. Customer skills sysone-operator and sysone-integrate. Never this builder skill.
examples/*          Sample apps for integration tests and docs.
```

Dependency direction: `core` <- `system-one-client`, `llm-client`, `db`, `tenancy`, `billing` <- `console`. `client` <- `react`. `codegen` depends only on `core` contracts. `cli` depends on `client` and `codegen` and calls `/api/v1` over HTTP. `mcp-server` calls `/api/v1` over HTTP only. Only `console` wires the server packages together. Boundary lint enforces it.

Details, the run data flow, and caching: `references/architecture.md`.

## How to work a task

1. **Find your phase.** Open `references/phases/phase-N.md` (phases 0 to 7, plus `phase-3b.md` for the effectiveness loop and `phase-4b.md` for integrate and deploy). Confirm your task is on its checklist and note the exit gate.
2. **Find your lane.** Check `references/team-playbook.md` for which role owns the files you will touch. If it is not yours, open a handoff, don't edit.
3. **Read the contracts** in `packages/core/src/contracts` (or, before Phase 0 part two lands, the shapes in `references/spec-schema.md`, `references/architecture.md`, `references/confidence-policy.md` and `references/management-api.md`). If your task needs code against contracts that do not exist yet, it is blocked on Phase 0 part two. Tell the Architect; do not invent contract shapes in your own package.
4. **Operation first.** If you add a console capability, add its operation first (`references/management-api.md`), then the UI.
5. **Write tests first** against fixtures or in-memory stores. See `references/testing.md`.
6. **Implement** following `references/conventions.md`.
7. **Run the gate:** `pnpm turbo lint typecheck test`. Add `pnpm smoke` if you touched `system-one-client` and have a key.
8. **Update docs** in the same PR: this skill, the relevant reference, and the phase checklist box.

## Recipes (where to look)

| Task | Read |
|---|---|
| Add or change a question field | `system-one-api-contract.md`, then an ADR |
| Change spec shape, conditions, checks or question types | `spec-schema.md`, then an ADR |
| Add a lint | `architecture.md` (lints section), `confidence-policy.md` |
| Add an API route | `api.md`, `security.md`, `data-model.md` |
| Add a management operation or endpoint | `management-api.md`, `security.md`, `data-model.md` |
| Add an MCP tool or CLI command | `headless-and-agents.md` |
| Emit or consume an event | `events.md` |
| Add a table | `data-model.md` (RLS checklist) |
| Add a new System One model | `system-one-models.md` (registry row, price book row, fixtures, smoke on the new id) |
| Set up an app or generate app code | `deploy-and-codegen.md` |
| Touch gates, tuning, feedback, labeling, experiments or health | `effectiveness-loop.md`, `confidence-policy.md` |
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
- A new console capability has an operation, a route, an OpenAPI path and, if it is on the curated list, an MCP tool. The parity test passes.
- No Jev-branded identifiers in code, schemas, columns, error codes or env vars.
- Docs and the phase checklist updated.
- Prose follows the voice rules in the root `CLAUDE.md`.

## Reference index

- `references/architecture.md`: packages, run data flow, caching, lints, background jobs, embed kit
- `references/spec-schema.md`: RunRequest, conditions, checks, stages and merged state, relevantWhen, routes, FallbackConfig, QuestionTypeModule, SetInterface
- `references/system-one-api-contract.md`: what we rely on from the System One API, API-wide limits, errors, SDK usage, cost
- `references/system-one-models.md`: ModelProfile, the model registry, pinned or moving, lifecycle, new-model detection, contract watch
- `references/confidence-policy.md`: bands, actions, rollout stages, the stage by band table, gates, defaults
- `references/effectiveness-loop.md`: truth sources, labeling, quality targets and gates, threshold suggestions, set health, proposals, experiments, improve mode
- `references/data-model.md`: tables, tenancy, RLS, invariants, migrations
- `references/api.md`: `/api/v1` run endpoints, auth modes, error envelope
- `references/management-api.md`: operation registry, OperationDef, the management endpoint catalog, the parity test
- `references/headless-and-agents.md`: agent identities and profiles, `@sysone/cli`, specs as code, MCP server, customer skills, agent flows
- `references/events.md`: EventEnvelope, the event catalog, the pull feed, org webhooks
- `references/deploy-and-codegen.md`: integrate flow, opportunities, pattern advisor, deploy targets, codegen, app bindings, `sysone check`
- `references/savings-model.md`: savings math, comparator prices, reports
- `references/definition-studio.md`: the wizard, fit test, improve mode, template library
- `references/conventions.md`: code style, naming, env, commits
- `references/testing.md`: fixtures, smoke, evals, Playwright
- `references/security.md`: keys, tokens, agent tokens, approvals, RBAC, audit, PII
- `references/team-playbook.md`: roles, lanes, contracts, handoffs
- `references/phases/phase-0.md` through `phase-7.md`, plus `phase-3b.md` and `phase-4b.md`: checklists and exit gates
- `templates/question-set.example.json`, `templates/adr.md`, `templates/plugin.template.ts`
- ADRs live in the repo at `docs/adr/`: 001 stack; 002 to 006 auth (Better Auth), key vault, cache, jobs runner, billing; 007 to 010 headless parity, model registry, app integration, rollout and the effectiveness loop (all accepted 2026-09-26); 011 OpenRouter route (proposed)
