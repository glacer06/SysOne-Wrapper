# Linear backlog: Bandwise project (NSIMS team)

This file is the build backlog for Bandwise in Nick's Linear workspace **NSIMS**. It lives in the existing **Bandwise** project (`P-NSI-36`, https://linear.app/nsims/project/bandwise-ef1f69b9fa8c) inside the **NSIMS** team, next to the Embers projects. Issues are `NSI-n`. Nothing in Embers is created, renamed, or moved.

The source of truth is the phase checklists in `.claude/skills/bandwise-builder/references/phases/` (phases 0 to 7 plus `phase-3b.md` and `phase-4b.md`), the roles in `.claude/skills/bandwise-builder/references/team-playbook.md`, and `docs/PLAN.md`. When a phase file changes, update this file in the same PR. The backlog has 211 issues and 745 points across 10 milestones. Phase 0 is done (part two built with a green gate, ADRs 002 to 010 accepted), and Phase 1 is next.

Section 4 holds the same backlog as JSON. Paths in descriptions are repo-relative.

Product decisions that shape this backlog: Bandwise is multi-tenant SaaS. ADR-002 (P0-18) settled the auth library on 2026-09-26: Better Auth with the organization, admin and two-factor plugins. Jev is the default System One model, and every contract is model-agnostic. Everything the UI does, agents can do headlessly through the same operations.

## 1. Setup notes

### Where things live in Linear

- **Project:** `Bandwise` (`P-NSI-36`) in team `NSIMS`. One project, not one per phase, so the Bandwise work stays in one place in the workspace project list.
- **Milestones:** one per phase inside the project. The "Projects" in sections 2 and 3 below map to these milestones:

| Backlog section | Linear milestone |
|---|---|
| Bandwise P0 | Phase 0: Skill, contracts, scaffold |
| Bandwise P1 | Phase 1: Core engine and data layer |
| Bandwise P2 | Phase 2: Tenancy, auth, keys, billing |
| Bandwise P3 | Phase 3: Console and management API |
| Bandwise P3b | Phase 3b: Effectiveness loop |
| Bandwise P4 | Phase 4: Embed kit |
| Bandwise P4b | Phase 4b: Integrate and deploy |
| Bandwise P5 | Phase 5: Plugins and templates |
| Bandwise P6 | Phase 6: Chrome extension |
| Bandwise P7 | Phase 7: Claude Code plugin and MCP |

### Labels

Each issue has exactly one role label from the **Bandwise role** group (single select), zero or more type labels, and `agent-created` (Nick's existing label for issues an agent files).

| Role label (Bandwise role group) | Owns |
|---|---|
| Architect | The builder skill, contracts, `openapi.json`, ADRs, boundary lint, the Phase 0 registry skeleton, merge order |
| Core Engine | `packages/core`, `packages/system-one-client`, `packages/llm-client` |
| Platform / Tenancy | `packages/db`, `packages/tenancy`, `apps/console/src/server/**`, `apps/console/app/api/**`, audit, cache, registry jobs |
| Billing | `packages/billing`, savings rollups, reports, price book |
| Console UI | `apps/console/app/(org)/**` and `app/(platform)/**`; calls operations, never repositories |
| Embed Kit | `packages/client`, `packages/react`, `apps/example-embed` |
| QA / Evals | `packages/evals`, fixtures, cross-tenant suite, Playwright, k6, CI gates, the parity test |
| Integrations | `packages/cli`, `packages/mcp-server`, `packages/codegen`, `packages/client-py`, `plugins/claude-code`, `examples/*` |
| Quality / Learning | `packages/core/src/learning`, `apps/console/src/jobs/learning`, `effectiveness-loop.md` |
| Extensions | `packages/plugin-sdk`, `plugins-builtin`, `apps/extension-chrome` |
| Security review | Threat model and sign-off on keys, authz, tokens, approvals, webhooks, embed, extension, and codegen output |
| Docs | Skill references, API docs, recipes, quickstart |

Type labels are flat because multi-select label groups are off in this workspace. `Security` is the existing NSIMS label.

| Type label | Use it when the issue |
|---|---|
| `bandwise:contract` | Implements or changes a contract: zod schemas in `packages/core/src/contracts`, `openapi.json`, or a plugin interface. After the freeze, a change needs an ADR. |
| `bandwise:adr` | Writes, reviews, or decides an ADR. |
| `Security` | Touches keys, tokens, authz, approvals, PII, webhooks, the extension, or anything the Security reviewer must see. |
| `bandwise:tenancy` | Touches `org_id`, RLS, `withTenant`, repositories, per-org data, or the cross-tenant suite. |
| `bandwise:headless` | Touches the operation registry, `/api/v1` management routes, the CLI, the MCP server, agent tokens, or approvals. |
| `bandwise:models` | Touches the model registry, `ModelProfile`, pricing by model, preflight limits, model lints, or model upgrades. |
| `bandwise:docs` | Writes docs, recipes, templates, or customer skills. |

### Workflow states and estimates

- Workflow states stay at the Linear defaults. This backlog uses three of them: `Done` for the five Phase 0 part one issues, `Todo` for every Phase 0 part two issue (the first build), and `Backlog` for everything else. Move a project's issues to `Todo` when its dependencies land.
- Estimates use the Fibonacci scale. Issues use 1, 2, 3, 5 or 8 points. Anything bigger was split.
- Blocked-by links use the stable local IDs (for example `P0-09`). After creation, each issue's description ends with its local ID, so a later session can map local IDs to `NSI-n` keys and never create a duplicate.

### Conventions

- Titles are imperative and under 80 characters.
- PR titles carry the Linear key, for example `NSI-412`, per the team playbook working rules.
- A handoff between lanes is a new NSI issue in the Bandwise project labeled with the receiving role, in the project of the phase it blocks (the project stands in for the phase label).
- Each project lead is a role. In Linear, set the lead to the person (or agent owner) who runs that role, and keep the role in the project description.

### Where this backlog goes beyond the checklists

Most issues map one to one to a checklist line. These do not:

- **Exit gates.** Each project ends with one "Pass the Phase N exit gate" issue. It is blocked by every open issue in the project that no other project issue waits on, so it waits on the whole project. QA / Evals owns it, except in Phase 0, where the Architect does.
- **Split items.** A checklist line that is larger than 8 points or spans several lanes is split, and each split issue says so in its note: the Phase 0 contract list (P0-09, P0-10), the Phase 0 ADR line (P0-06, P0-18), the Phase 3 parity line (P3-01 to P3-05), the Phase 3 CLI line (P3-22 to P3-24), the Phase 3 Studio line (P3-33, P3-34), and the Phase 3b and 4b lines that name logic, operation, screen and CLI or MCP work in one line (P3b-02 to P3b-05, P3b-21 and P3b-22, P3b-24 to P3b-26, P4b-08 to P4b-10, P4b-11 and P4b-12).
- **Gaps the exit gates need.** P1-19 (`RunSink`), P2-12 (`set.run`, catalog Phase 2) and P2-25 (`usage_daily` rollup). Their phase files have no line for them yet.
- **Decisions and reviews.** P4b-18 and P4b-20 decide the ADR-009 Python and Standalone sections. P2-29, P4b-22 and P6-08 are the Security reviewer's sign-offs for phases that list that role as an owner.
- **Pending phase-file edits.** Other docs agents found these; the backlog already follows the fixed state: the registry sync, alias probe and contract watch jobs are Phase 1 Platform work (P1-20); the same-snapshot regression gate is Phase 3 (P3-02, P3-35), not Phase 3b; approval emails are Phase 3 (P3-17); the adapter picker lands in Phase 5 (P5-03); `escalate_to_llm` is core work from Phase 1 (P1-03), not a Phase 5 plugin action; try-model never writes the draft (P3b-19).

## 2. Projects

| Order | Project | Description | Lead role | Depends on | Issues | Points |
|---|---|---|---|---|---|---|
| 1 | Bandwise P0: Skill and scaffold | Builder skill and plan (done), then the monorepo scaffold, frozen contracts, operation registry skeleton, OpenAPI, ADRs 002 to 010 and CI. | Architect / Lead (`Architect`) | No dependencies. Blocks every other project. | 19 | 61 |
| 2 | Bandwise P1: Core engine and data layer | Core run engine on fixtures, system-one-client, llm-client, the full schema with RLS, repositories, fixtures, the evals CLI and the local CLI. | Core Engine (`Core Engine`) | P0. Needs the Phase 0 contracts (P0-09, P0-10). | 27 | 97 |
| 3 | Bandwise P2: Tenancy, auth, keys and billing | Auth and orgs, BYO keys, app and agent tokens with the device flow, runOperation with approvals and idempotency, the run route, rate limits, the Stripe foundation, platform admin and the console shell. | Platform / Tenancy (`Platform / Tenancy`) | P1. Needs the Phase 1 schema and repositories, and ADR-002 (P0-18). | 30 | 112 |
| 4 | Bandwise P3: Console and management API | Console screens on operations, the management API with parity, the bandwise CLI, MCP stdio, event feed, feedback API, audit sampling, rollout gates and auto-demote, model pages and reports. | Console UI (`Console UI`) | P2. Needs Phase 2 (auth, tokens, runOperation, approvals, the run route). | 45 | 183 |
| 5 | Bandwise P3b: Effectiveness loop | Policy replay and threshold suggestions, set health, proposals, champion/challenger, model upgrades, Studio improve mode and quality-adjusted value. | Quality / Learning (`Quality / Learning`) | P3. Starts when Phase 3 lands. Runs in parallel with P4 and P4b. | 31 | 102 |
| 6 | Bandwise P4: Embed kit | @bandwise/client (edge-safe, typed run, feedback), @bandwise/react, integration recipes and the example app. | Embed Kit (`Embed Kit`) | P3. Can start during Phase 3 against the MSW mocks (P3-26); the exit gate needs the real Phase 3 API. Runs in parallel with P3b and P4b. | 10 | 32 |
| 7 | Bandwise P4b: Integrate and deploy | Opportunities, TypeScript codegen, app bindings, bandwise init, codegen and check, and the interface-breaking guard. Python and the standalone export stay behind ADR-009. | Integrations (`Integrations`) | P3. Starts when Phase 3 lands and runs in parallel with P3b and P4. The TypeScript target builds against the @bandwise/client types (P4-01) until that package lands. | 23 | 69 |
| 8 | Bandwise P5: Plugins and templates | Plugin SDK, built-in adapters and actions, the remaining templates, plugin enablement, org event webhooks and the GitHub Action. | Extensions (`Extensions`) | P4. Needs Phase 4. The GitHub Action also needs bandwise check from P4b. | 11 | 41 |
| 9 | Bandwise P6: Chrome extension | WXT MV3 extension with evaluate page and action picker modes, signed in with the device flow. | Extensions (`Extensions`) | P5. Needs the Phase 5 web page adapter. Runs in parallel with P7. | 9 | 30 |
| 10 | Bandwise P7: MCP HTTP and Claude Code plugin | MCP HTTP transport, the Claude Code plugin with the bandwise-operator and bandwise-integrate skills, and a marketplace entry. | Integrations (`Integrations`) | P3, P3b, P4b. Needs the Phase 3 operations and Phase 4b; the Phase 3b tools must exist. Runs in parallel with P6. | 6 | 18 |

Order of work: P0, then P1, then P2, then P3. When P3 lands, P3b, P4 and P4b run in parallel. P5 follows P4. P6 and P7 run in parallel at the end.

## 3. Issues by project

### Bandwise P0: Skill and scaffold

Builder skill and plan (done), then the monorepo scaffold, frozen contracts, operation registry skeleton, OpenAPI, ADRs 002 to 010 and CI.

Lead role: Architect / Lead. No dependencies. Blocks every other project. Checklist: `.claude/skills/bandwise-builder/references/phases/phase-0.md`. 19 issues, 61 points.

P0-01 to P0-05 are Phase 0 part one and are done. P0-06 to P0-19 are Phase 0 part two, the first build.

#### P0-01 Write the bandwise-builder skill and its references

Labels: `Architect` `bandwise:docs` | Estimate: 5 | State: Done | Blocked by: none

The builder skill and every reference exist, so each agent works from one rulebook.

Acceptance criteria:

- `SKILL.md` stays under 300 lines and indexes every reference and phase file.
- References cover architecture, contracts, the run and management APIs, data model, security, testing, phases and the team playbook.

Refs: `.claude/skills/bandwise-builder/SKILL.md`, `.claude/skills/bandwise-builder/references/team-playbook.md`

#### P0-02 Write the root CLAUDE.md and README.md

Labels: `Architect` `bandwise:docs` | Estimate: 2 | State: Done | Blocked by: none

Anyone opening the repo knows to load the skill and how the product works.

Acceptance criteria:

- `CLAUDE.md` tells agents to load the skill and lists commands, golden rules, env vars and writing rules.
- `README.md` describes the product for a new reader.

Refs: `CLAUDE.md`, `README.md`

#### P0-03 Write docs/PLAN.md and ADR-001

Labels: `Architect` `bandwise:docs` `bandwise:adr` | Estimate: 3 | State: Done | Blocked by: none

The plan and the stack decision are on record.

Acceptance criteria:

- `docs/PLAN.md` covers why, scope, phases and team kickoff prompts.
- ADR-001 records the stack. The auth library it left open is settled by ADR-002: Better Auth.

Refs: `docs/PLAN.md`, `docs/adr/001-stack.md#open-question-for-adr-002`

#### P0-04 Draft ADRs 007 to 010 with status proposed

Labels: `Architect` `bandwise:adr` `bandwise:headless` `bandwise:models` `bandwise:contract` | Estimate: 5 | State: Done | Blocked by: none

The four decisions behind Nick's 2026-09-26 requirements are drafted before the contract freeze.

Acceptance criteria:

- ADR-007 headless parity, ADR-008 model registry and neutral naming, ADR-009 app integration and deploy targets, and ADR-010 rollout on pointers and the effectiveness loop exist with status proposed.

Refs: `docs/adr/007-headless-parity.md`, `docs/adr/008-system-one-model-registry.md`, `docs/adr/009-app-integration-and-deploy-targets.md`, `docs/adr/010-rollout-pointers-and-effectiveness-loop.md`

#### P0-05 Add templates: example question set, ADR and plugin

Labels: `Architect` `bandwise:docs` `bandwise:contract` | Estimate: 2 | State: Done | Blocked by: none

Agents copy from working templates instead of guessing shapes.

Acceptance criteria:

- `templates/question-set.example.json`, `templates/adr.md` and `templates/plugin.template.ts` exist.
- The example spec has no `rollout` key.

Refs: `.claude/skills/bandwise-builder/templates/question-set.example.json`, `.claude/skills/bandwise-builder/templates/adr.md`, `.claude/skills/bandwise-builder/templates/plugin.template.ts`

#### P0-06 Review and accept ADRs 007 to 010 before the contract freeze

Labels: `Architect` `bandwise:adr` `bandwise:contract` `bandwise:headless` `bandwise:models` | Estimate: 3 | State: Todo | Blocked by: P0-04

Nick reviews and accepts ADRs 007 to 010, so the Phase 0 contracts freeze on accepted decisions.

Acceptance criteria:

- ADRs 007, 008, 009 and 010 have status accepted.
- The ADR-009 Python and Standalone sections stay proposed (decided later in P4b-18 and P4b-20).
- ADR-001's Amended-by line no longer says ADR-008 and ADR-009 are proposed.
- Every contract name the ADRs use matches the reference files.

Refs: `docs/adr/007-headless-parity.md`, `docs/adr/008-system-one-model-registry.md`, `docs/adr/009-app-integration-and-deploy-targets.md`, `docs/adr/010-rollout-pointers-and-effectiveness-loop.md`, `.claude/skills/bandwise-builder/references/phases/phase-0.md#part-two-scaffold-and-contracts`

Note: Split from the phase-0.md ADR item (P0-06, P0-18): ADRs 007 to 010 must be accepted before the contracts freeze, and ADR-002 must be decided before Phase 2 starts.

#### P0-07 Scaffold the pnpm workspace and turborepo with empty packages

Labels: `Architect` | Estimate: 3 | State: Todo | Blocked by: none

Create the monorepo layout every role builds in.

Acceptance criteria:

- A pnpm workspace and `turbo.json` hold every app and package listed in architecture.md, each with a `package.json` and an empty `src`.
- `pnpm i && pnpm turbo lint typecheck test build` passes on the empty scaffold.
- No package name, path or code identifier says jev; model ids such as `jev-1.13.0` are data. The client package is `packages/system-one-client` (ADR-008).

Refs: `.claude/skills/bandwise-builder/references/architecture.md#packages-and-boundaries`, `.claude/skills/bandwise-builder/references/conventions.md#naming`

#### P0-08 Add packages/config with strict tsconfig, boundary lint and vitest

Labels: `Architect` `Security` | Estimate: 3 | State: Todo | Blocked by: P0-07

Shared config makes the import boundaries a CI failure, not a review comment.

Acceptance criteria:

- `tsconfig` is strict. A shared vitest preset is used by every package.
- `eslint-plugin-boundaries` encodes every rule in architecture.md: only `system-one-client` imports `@typesafe-ai/sdk`, only `llm-client` imports `@anthropic-ai/sdk`, only `db` imports `drizzle-orm`, only `tenancy` touches crypto and KMS, `react` never imports server code, `core` has no side effects, `codegen` imports only core contracts, and `mcp-server` calls `/api/v1` over HTTP only.
- The `packages/cli/src/local/**` exception is encoded: it may import `core` and the fixture subpath export of `system-one-client`, never the SDK transport.
- A fixture with a deliberate bad import fails lint, and a fixture for the `cli/src/local` exception passes.

Refs: `.claude/skills/bandwise-builder/references/architecture.md#packages-and-boundaries`, `.claude/skills/bandwise-builder/references/conventions.md#typescript`

#### P0-09 Write the spec, policy, run and error contracts in zod

Labels: `Architect` `bandwise:contract` | Estimate: 8 | State: Todo | Blocked by: P0-06, P0-07

Freeze the contracts that Phase 1 builds against.

Acceptance criteria:

- In `packages/core/src/contracts`, as zod: `QuestionSetSpec` (strict, no `rollout`), `TenantContext` (with the agent actor), `Channel`, `RolloutStage`, `PublishCtx`; `ConfidencePolicy` (discriminated union), `BandActions`, `ActionRef`; `RunRequest`, `RunDryRunResult`, `SystemOneRequest`, `SystemOneAnswer`, `SystemOneResponse`, `QuestionTypeModule`, `Condition`, `Check`, `FallbackConfig`, `EscalationConfig`, `SetInterface`; `RunResult`, `Decision`, `RunCost`; the error envelope v2, `ErrorDetail`, `GateResult` and `Manifest`.
- Ports and store interfaces are TypeScript interfaces whose payloads are these zod types.
- `templates/question-set.example.json` parses with the strict `QuestionSetSpec` schema.
- The same spec plus a `rollout` key fails with rule `spec.unknown_key` at path `/rollout`.
- A hand-written `RunResult` sample round-trips: parse, serialize and parse again give an equal value.
- Names are neutral (`systemOne`, `system_one`) per ADR-008.

Refs: `.claude/skills/bandwise-builder/references/phases/phase-0.md#part-two-scaffold-and-contracts`, `.claude/skills/bandwise-builder/references/architecture.md#core-contracts-packagescoresrccontracts`, `.claude/skills/bandwise-builder/references/architecture.md#ports`, `.claude/skills/bandwise-builder/references/architecture.md#store-interfaces`, `.claude/skills/bandwise-builder/references/confidence-policy.md#policy-shape`, `.claude/skills/bandwise-builder/references/spec-schema.md`, `.claude/skills/bandwise-builder/references/savings-model.md#standard-run-envelope-runresult`, `.claude/skills/bandwise-builder/references/api.md#error-envelope-v2`

Note: Split from the phase-0.md contracts item (P0-09, P0-10), because it is larger than 8 points.

#### P0-10 Write the management, model, deploy, loop and event contracts

Labels: `Architect` `bandwise:contract` `bandwise:headless` `bandwise:models` | Estimate: 5 | State: Todo | Blocked by: P0-06, P0-07

Freeze the contracts that the headless surface, the model registry, deploy and the effectiveness loop share.

Acceptance criteria:

- As zod: `OperationDef` and `DryRunResult` (management-api.md), `SpecDiff` (phase-0.md), `ModelProfile` (system-one-models.md), `DeployTarget` and `Opportunity` (deploy-and-codegen.md), `FeedbackReport`, `QualityTarget`, `SetHealth`, `ThresholdProposal` and `LabelingPolicy` (effectiveness-loop.md), and `EventEnvelope` plus `EventType` as the union of the event catalog (events.md).
- `QualityTarget` has one definition, the one in effectiveness-loop.md that architecture.md's contract table points to.
- Each contract has a parse test with one valid and one invalid sample.

Refs: `.claude/skills/bandwise-builder/references/management-api.md#operation-registry`, `.claude/skills/bandwise-builder/references/management-api.md#dry-runs`, `.claude/skills/bandwise-builder/references/phases/phase-0.md#specdiff`, `.claude/skills/bandwise-builder/references/system-one-models.md#3-modelprofile-contract`, `.claude/skills/bandwise-builder/references/deploy-and-codegen.md#4-deploy-targets`, `.claude/skills/bandwise-builder/references/deploy-and-codegen.md#opportunity-contract`, `.claude/skills/bandwise-builder/references/effectiveness-loop.md#5-quality-targets-and-gates-phase-3`, `.claude/skills/bandwise-builder/references/events.md#eventenvelope`

Note: Split from the phase-0.md contracts item (P0-09, P0-10), because it is larger than 8 points.

#### P0-11 Build the operation registry skeleton with stubbed handlers

Labels: `Architect` `bandwise:headless` `bandwise:contract` | Estimate: 5 | State: Todo | Blocked by: P0-09, P0-10

Every management operation exists as a registry entry from day one, so OpenAPI and the parity test cover all of them.

Acceptance criteria:

- `apps/console/src/server/operations` holds `OperationDef`, a `runOperation` stub and one entry per operation in the management-api.md catalog, with handlers stubbed.
- Entries whose shape is given have real zod input and output, for example `set.run`, `set.publish`, `eval.run`, `draft.validate`, `job.get` and `version.diff` (output `SpecDiff`).
- Any input with no given shape is `z.object({}).passthrough()` and any such output is `z.unknown()`, each marked `// shape: Phase <n>, owner Platform / Tenancy` from the catalog's Phase column.
- List operations take `limit` and `cursor` and return `{ data, nextCursor }`.

Refs: `.claude/skills/bandwise-builder/references/phases/phase-0.md#part-two-scaffold-and-contracts`, `.claude/skills/bandwise-builder/references/management-api.md#catalog`, `.claude/skills/bandwise-builder/references/management-api.md#operation-registry`, `.claude/skills/bandwise-builder/references/management-api.md#conventions-for-every-route`

#### P0-12 Generate openapi.json from the registry and add the parity skeleton

Labels: `Architect` `bandwise:headless` `bandwise:contract` | Estimate: 3 | State: Todo | Blocked by: P0-11

One generated OpenAPI file feeds the CLI, the MCP server, MSW mocks and the embed kit.

Acceptance criteria:

- `packages/core/openapi.json` is generated from zod and the registry and committed. Each `operationId` is the operation id, with `x-bandwise-scope`, `x-bandwise-min-role`, `x-bandwise-risk` and `x-bandwise-actors`.
- It has a path for every management operation.
- The parity test skeleton runs in CI and fails when an operation has no path. The device flow (`/auth/`), the JWKS and `openapi.json` itself are the documented exceptions.
- The OpenAPI snapshot test fails when the committed file differs from a fresh generation.

Refs: `.claude/skills/bandwise-builder/references/management-api.md#openapi-and-the-parity-test`, `.claude/skills/bandwise-builder/references/management-api.md#auth-device-flow`, `.claude/skills/bandwise-builder/references/testing.md#layers`

#### P0-13 Seed ModelProfile rows for jev-1.13.0, jev-latest and jev-preview

Labels: `Architect` `bandwise:models` | Estimate: 2 | State: Todo | Blocked by: P0-10

Model facts start as data, not constants.

Acceptance criteria:

- `packages/core/src/models/catalog.ts` holds the three rows from the seed table, including `aliasTarget` and `supersedes`.
- Every row parses as `ModelProfile`.
- The alias rows point `aliasTarget` at `jev-1.13.0`.

Refs: `.claude/skills/bandwise-builder/references/system-one-models.md#13-seed-table`, `.claude/skills/bandwise-builder/references/system-one-models.md#3-modelprofile-contract`

#### P0-14 Add the apps/console placeholder page and src/env.ts

Labels: `Architect` | Estimate: 1 | State: Todo | Blocked by: P0-07

The console app boots and reads env in one place.

Acceptance criteria:

- An App Router placeholder page renders.
- All env access goes through `apps/console/src/env.ts` (t3-env), marked `server-only`.

Refs: `.claude/skills/bandwise-builder/references/conventions.md#env`, `.claude/skills/bandwise-builder/references/conventions.md#nextjs`

#### P0-15 Add .env.example with every documented variable

Labels: `Architect` `Security` | Estimate: 1 | State: Todo | Blocked by: P0-07

Developers and agents see every variable without any secret in git.

Acceptance criteria:

- Lists `TYPESAFE_API_KEY`, `DATABASE_URL`, `AUTH_SECRET`, `BANDWISE_KEK`, `BANDWISE_JWT_SIGNING_KEY`, `SYSTEM_ONE_TRANSPORT`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `REDIS_URL` and `ANTHROPIC_API_KEY`, with no values.
- No `.env*` file with values is committed.

Refs: `CLAUDE.md`, `.claude/skills/bandwise-builder/references/conventions.md#env`

#### P0-16 Add GitHub Actions CI for lint, typecheck, test and build

Labels: `Architect` | Estimate: 2 | State: Todo | Blocked by: P0-08

Every PR runs the same gate agents run locally.

Acceptance criteria:

- CI runs `pnpm i` and `pnpm turbo lint typecheck test build` on every PR and fails on any step.
- CI needs no `TYPESAFE_API_KEY` and makes no live System One call.

Refs: `.claude/skills/bandwise-builder/references/testing.md#layers`, `.claude/skills/bandwise-builder/references/team-playbook.md#working-rules`

#### P0-17 Add the PR template with contract, tenancy and security sections

Labels: `Architect` `bandwise:docs` | Estimate: 1 | State: Todo | Blocked by: none

Every PR states its contract, tenancy and security impact.

Acceptance criteria:

- The template has Summary, Phase and checklist item, Contract impact, Tenancy impact, Security impact, Tests added and Docs updated.
- It asks for the Linear issue key (for example `NSI-412`) in the PR title.

Refs: `.claude/skills/bandwise-builder/references/team-playbook.md#pr-template-sections`, `.claude/skills/bandwise-builder/references/team-playbook.md#working-rules`

#### P0-18 Draft and decide ADRs 002 to 006

Labels: `Architect` `bandwise:adr` `Security` `bandwise:tenancy` | Estimate: 5 | State: Todo | Blocked by: none

Record the open infrastructure decisions before the phases that need them.

Acceptance criteria:

- ADR-002 picks the auth library: Better Auth with the organization, admin and two-factor plugins (accepted by Nick, 2026-09-26). It supports many orgs per user, invites, five roles and audited impersonation.
- ADR-003 key vault, ADR-004 cache, ADR-005 jobs runner and ADR-006 billing model are written from `templates/adr.md` and saved in `docs/adr/` with a status line.

Refs: `docs/adr/001-stack.md#open-question-for-adr-002`, `.claude/skills/bandwise-builder/templates/adr.md`, `.claude/skills/bandwise-builder/references/security.md#typesafe-keys`, `.claude/skills/bandwise-builder/references/architecture.md#caching`, `.claude/skills/bandwise-builder/references/architecture.md#background-jobs`

Note: Split from the phase-0.md ADR item (P0-06, P0-18): ADRs 007 to 010 must be accepted before the contracts freeze, and ADR-002 must be decided before Phase 2 starts.

#### P0-19 Pass the Phase 0 exit gate

Labels: `Architect` `bandwise:contract` | Estimate: 2 | State: Todo | Blocked by: P0-12, P0-13, P0-14, P0-15, P0-16, P0-17, P0-18

Confirm Phase 0 is done before Phase 1 starts.

Acceptance criteria:

- `pnpm i && pnpm turbo lint typecheck test build` passes on the scaffold.
- Boundary lint catches a deliberate bad import in a test fixture.
- `openapi.json` has a path for every management operation, and the parity test skeleton runs.
- The example spec parses as strict `QuestionSetSpec`. Adding a `rollout` key fails with rule `spec.unknown_key` at `/rollout`.
- Every row in `catalog.ts` parses as `ModelProfile`. A sample `RunResult` round-trips through its zod schema.
- ADRs 007 to 010 are accepted. Only the ADR-009 Python and Standalone sections stay proposed.
- Fresh-agent checks pass: "add a question set feature" names spec-schema.md, architecture.md and phases/phase-3.md; "let an agent publish a set" names management-api.md, security.md and headless-and-agents.md; "add a new System One model" names system-one-models.md.

Refs: `.claude/skills/bandwise-builder/references/phases/phase-0.md#exit-gate`

### Bandwise P1: Core engine and data layer

Core run engine on fixtures, system-one-client, llm-client, the full schema with RLS, repositories, fixtures, the evals CLI and the local CLI.

Lead role: Core Engine. Depends on: Bandwise P0: Skill and scaffold. Needs the Phase 0 contracts (P0-09, P0-10). Checklist: `.claude/skills/bandwise-builder/references/phases/phase-1.md`. 27 issues, 97 points.

#### P1-01 Build the spec compiler with noul, choice and score modules

Labels: `Core Engine` `bandwise:contract` | Estimate: 5 | State: Backlog | Blocked by: P0-09

Each spec stage compiles to a System One request through one module per question type.

Acceptance criteria:

- Each `QuestionSetSpec` stage compiles to a `SystemOneRequest` through the `QuestionTypeModule` files in `packages/core/src/question-types`.
- No per-type logic lives outside `question-types`, so a new type is one module plus a renderer.
- An answer of unknown type is stored raw with warning `unknown_answer_type`, band `low` and `effectiveAction` `fallback`, and never throws.
- 100 percent branch coverage.

Refs: `.claude/skills/bandwise-builder/references/spec-schema.md#9-questiontypemodule-and-systemoneanswer`, `.claude/skills/bandwise-builder/references/system-one-api-contract.md#request`, `.claude/skills/bandwise-builder/references/system-one-api-contract.md#question-types`

#### P1-02 Build the stage orchestrator: checks, when, stateFrom and batch split

Labels: `Core Engine` `bandwise:contract` | Estimate: 5 | State: Backlog | Blocked by: P1-01

Runs execute stages in order with pure checks and merged state.

Acceptance criteria:

- Evaluates `spec.checks` with no System One call and skips a stage whose `when` fails.
- Merges `answers.<qid> = { value, band }` per `stateFrom`.
- Splits a stage into parallel batches when it exceeds the profile limits.
- A question in a skipped stage has no `answers` entry and gets the skipped decision shape in testing.md.
- `runQuestionSet` runs end to end with a fixture transport and in-memory stores.

Refs: `.claude/skills/bandwise-builder/references/spec-schema.md#4-spec-stages-and-merged-state`, `.claude/skills/bandwise-builder/references/spec-schema.md#2-condition`, `.claude/skills/bandwise-builder/references/spec-schema.md#3-check`, `.claude/skills/bandwise-builder/references/architecture.md#run-data-flow`, `.claude/skills/bandwise-builder/references/testing.md#router-tests`

#### P1-03 Build the confidence router per the normative table

Labels: `Core Engine` `bandwise:contract` | Estimate: 8 | State: Backlog | Blocked by: P0-09

Bands, actions and effective actions follow the one normative table, enforced only in core.

Acceptance criteria:

- Covers per-option overrides, noul bands, relevance (`relevantWhen`), composites (level and band), routes (first match wins, then `defaultRoute`), run band and `overallAction` with the order `review > fallback > escalate_to_llm > auto`.
- `effectiveAction` follows the stage by band by action table on production and staging. Staging dispatches no side-effect handler unless `dispatchActionsOnStaging`. `Decision.executed` follows its rule.
- `escalate_to_llm` calls `ports.llm` in run step 10. `Decision.value` keeps the System One answer and the LLM result goes in `Decision.escalation`. A missing port, a failure or a timeout gives `effectiveAction` `review` and warning `escalation_failed`.
- Table-driven tests: one row per normative table row, band edges for every type, relevance, skipped and empty decisions, composites and conservative ordering. 100 percent branch coverage.

Refs: `.claude/skills/bandwise-builder/references/confidence-policy.md#effective-action-by-rollout-stage-normative`, `.claude/skills/bandwise-builder/references/confidence-policy.md#band-algorithm`, `.claude/skills/bandwise-builder/references/confidence-policy.md#escalation`, `.claude/skills/bandwise-builder/references/spec-schema.md#5-relevantwhen`, `.claude/skills/bandwise-builder/references/spec-schema.md#6-routes`, `.claude/skills/bandwise-builder/references/spec-schema.md#10-composite-terms-level-and-band`, `.claude/skills/bandwise-builder/references/testing.md#router-tests`

#### P1-04 Implement cost and savings math for all three kinds

Labels: `Core Engine` `bandwise:models` | Estimate: 5 | State: Backlog | Blocked by: P0-09

Every run reports honest cost and savings in integer micro-USD.

Acceptance criteria:

- Money math uses integer micro-USD and one `round_half_up` per term. Test vector: 318 input tokens on `jev-1.13.0` at 42,000 micro-USD per Mtok cost 13 micro-USD.
- Each call is priced by its own `modelResolved`. Calls that resolve to different models set warning `model_resolved_mixed`.
- Decision counterfactual, escalation avoided and context pruned are computed. Only decisions with `effectiveAction` `auto` count toward savings. Shadow, eval, staging and experiment runs report `savingsUsd` 0 with a `savingsSuppressed` reason.
- An unpriced model gives cost `null` and warning `model_unpriced` in BYO key mode.

Refs: `.claude/skills/bandwise-builder/references/savings-model.md#money-math`, `.claude/skills/bandwise-builder/references/savings-model.md#the-three-kinds-of-savings`, `.claude/skills/bandwise-builder/references/savings-model.md#honesty-rules`, `.claude/skills/bandwise-builder/references/testing.md#cost-and-savings-tests`

#### P1-05 Add token preflight from ModelProfile limits

Labels: `Core Engine` `bandwise:models` | Estimate: 2 | State: Backlog | Blocked by: P0-09, P0-13

Oversized requests fail fast, with limits read from the model profile.

Acceptance criteria:

- Limits come from the profile (`statePlusLongestQuestionTokens`, `requestTokens`), never constants. A moving name uses the profile of its last observed resolved model.
- Warns at 80 percent and fails fast with `preflight_too_large`.
- A fake 16k profile blocks a 20k state, and the `jev-1.13.0` profile lets the same state through.

Refs: `.claude/skills/bandwise-builder/references/system-one-models.md#7-limits-as-data`, `.claude/skills/bandwise-builder/references/architecture.md#run-data-flow`, `.claude/skills/bandwise-builder/references/testing.md#model-registry-tests`

#### P1-06 Implement lints with stable rule ids, including model and weakness lints

Labels: `Core Engine` `bandwise:models` `bandwise:contract` | Estimate: 5 | State: Backlog | Blocked by: P0-09, P0-13

Specs get the same pure lint results in the editor and at publish.

Acceptance criteria:

- `lint(spec, profile, publishCtx?)` returns `{ rule, severity, path, message }` with `path` as a JSON Pointer, for every rule in the lint and weakness tables.
- Lints that need a `PublishCtx` field are skipped when it is absent.
- Each model lint fires on a minimal bad spec and stays quiet on a clean one. Weakness lints fire only when the profile lists the weakness.
- `templates/question-set.example.json` lints with zero errors against the `jev-1.13.0` seed profile.

Refs: `.claude/skills/bandwise-builder/references/architecture.md#lints-packagescoresrclints`, `.claude/skills/bandwise-builder/references/architecture.md#model-weakness-lints`, `.claude/skills/bandwise-builder/references/system-one-models.md#10-weaknesses`, `.claude/skills/bandwise-builder/references/testing.md#model-registry-tests`

#### P1-07 Implement interfaceOf and diffInterface

Labels: `Core Engine` `bandwise:contract` | Estimate: 3 | State: Backlog | Blocked by: P0-09

Interface changes between versions are computed, so breaking changes fail loudly later.

Acceptance criteria:

- `interfaceOf(spec)` returns a `SetInterface`.
- `diffInterface(from, to)` returns `{ breaking, additive }`, with a table test for each change type in spec-schema.md section 11.

Refs: `.claude/skills/bandwise-builder/references/spec-schema.md#11-setinterface`, `.claude/skills/bandwise-builder/references/deploy-and-codegen.md#5-set-interface-and-compatibility`

#### P1-08 Write the authz.ts role matrix

Labels: `Core Engine` `Security` `bandwise:tenancy` | Estimate: 2 | State: Backlog | Blocked by: P0-09

One `can()` decides every permission for every caller.

Acceptance criteria:

- `can(ctx, action, resource)` in `packages/core/src/authz.ts` covers the five roles, scopes and resource rules such as protected sets needing an admin to publish.
- For agent tokens the effective role is min(role ceiling, membership role), and both scope and role are required.
- A table test covers each role and scope.

Refs: `.claude/skills/bandwise-builder/references/data-model.md#roles`, `.claude/skills/bandwise-builder/references/security.md#authorization`, `.claude/skills/bandwise-builder/references/security.md#agent-tokens`

#### P1-09 Build system-one-client with SDK and fixture transports

Labels: `Core Engine` `bandwise:models` `Security` | Estimate: 8 | State: Backlog | Blocked by: P0-09

One package owns every System One call, its errors and its fixtures.

Acceptance criteria:

- `SdkTransport` is the only importer of `@typesafe-ai/sdk`. Every client has an explicit `baseURL`, `defaultModel`, `logLevel: 'warn'` and a scrubbing logger.
- Errors map to `system_one_*` codes, and every row of the errors table has a unit test, including 400, 403, 404, 408, `APIUserAbortError` and a timeout.
- Per-surface timeouts and retry budgets configure the SDK's own retries, with no second retry loop. Request ids are captured. Clients are cached per org.
- Model list and alias probe helpers exist.
- `FixtureTransport` ships as its own subpath export that never imports `@typesafe-ai/sdk`.

Refs: `.claude/skills/bandwise-builder/references/system-one-api-contract.md#errors`, `.claude/skills/bandwise-builder/references/system-one-api-contract.md#js-sdk-usage`, `.claude/skills/bandwise-builder/references/architecture.md#latency-budgets`, `.claude/skills/bandwise-builder/references/security.md#typesafe-keys`, `.claude/skills/bandwise-builder/references/testing.md#fixtures`

#### P1-10 Build llm-client with the LlmTransport port and a fixture transport

Labels: `Core Engine` | Estimate: 2 | State: Backlog | Blocked by: P0-09

Studio drafting, improve mode, opportunity drafting and escalation share one metered LLM port.

Acceptance criteria:

- `llm-client` is the only importer of `@anthropic-ai/sdk`.
- `LlmTransport.complete` matches architecture.md and returns model and token counts for metering.
- A fixture transport serves tests. Model ids come from the claude-api skill, not guesses.

Refs: `.claude/skills/bandwise-builder/references/architecture.md#ports`, `.claude/skills/bandwise-builder/references/architecture.md#packages-and-boundaries`

#### P1-11 Build bandwise run --local in packages/cli/src/local

Labels: `Integrations` `bandwise:headless` | Estimate: 3 | State: Backlog | Blocked by: P1-02, P1-03, P1-09, P0-08

A developer runs a spec locally with no network and no key.

Acceptance criteria:

- `pnpm bandwise run --local spec.json state.json` runs `templates/question-set.example.json` on the fixture transport, with no network access and no `TYPESAFE_API_KEY`.
- The code lives in `packages/cli/src/local/**`, imports only `core` and the fixture subpath of `system-one-client`, and loads through a dynamic import.
- The boundary lint rejects a deliberate import of the SDK transport from `packages/cli/src/local/**`.

Refs: `.claude/skills/bandwise-builder/references/phases/phase-1.md#integrations`, `.claude/skills/bandwise-builder/references/architecture.md#packages-and-boundaries`, `.claude/skills/bandwise-builder/references/headless-and-agents.md#datasets-evals-and-runs`

#### P1-12 Write the full Drizzle schema with RLS in migration 0001

Labels: `Platform / Tenancy` `bandwise:tenancy` `bandwise:models` | Estimate: 8 | State: Backlog | Blocked by: P0-09

Tenancy is in the schema from the first migration.

Acceptance criteria:

- Every table in data-model.md exists, with `org_id`, an RLS policy from the template and an `org_id` index on every tenant table, in migration 0001.
- The platform tables `system_one_models` (seeded from `catalog.ts`) and `model_alias_observations` have no `org_id`.
- Money columns are integer micro-USD. Rollout exists only on `release_pointers`.

Refs: `.claude/skills/bandwise-builder/references/data-model.md#tables`, `.claude/skills/bandwise-builder/references/data-model.md#rls-policy-template`, `.claude/skills/bandwise-builder/references/data-model.md#platform-tables-no-org_id`, `.claude/skills/bandwise-builder/references/data-model.md#migrations`

#### P1-13 Implement withTenant with transaction-local set_config

Labels: `Platform / Tenancy` `bandwise:tenancy` | Estimate: 2 | State: Backlog | Blocked by: P1-12

Every query runs inside one tenant context.

Acceptance criteria:

- `withTenant(ctx, fn)` opens a transaction and sets `app.org_id` transaction-locally.
- All DB access goes through it.

Refs: `.claude/skills/bandwise-builder/references/data-model.md#tenancy-rules`, `.claude/skills/bandwise-builder/references/data-model.md#rls-policy-template`

#### P1-14 Add the RLS setting test for app.org_id

Labels: `Platform / Tenancy` `bandwise:tenancy` `Security` | Estimate: 1 | State: Backlog | Blocked by: P1-12, P1-13

A wrong RLS setting name fails CI.

Acceptance criteria:

- A schema scan fails on any policy or `withTenant` call that uses a setting name other than `app.org_id`.

Refs: `.claude/skills/bandwise-builder/references/testing.md#security-tests`, `.claude/skills/bandwise-builder/references/data-model.md#rls-policy-template`

#### P1-15 Add repositories for every table with no raw db export

Labels: `Platform / Tenancy` `bandwise:tenancy` | Estimate: 5 | State: Backlog | Blocked by: P1-13

All data access goes through tenant-scoped repositories.

Acceptance criteria:

- One repository per table. `packages/db` exports no raw `db` handle.
- Every repository method runs inside `withTenant`.
- Adding a repository without adding it to the cross-tenant suite fails CI.

Refs: `.claude/skills/bandwise-builder/references/data-model.md#migrations`, `.claude/skills/bandwise-builder/references/testing.md#cross-tenant-suite`

#### P1-16 Add the immutability trigger on published versions

Labels: `Platform / Tenancy` | Estimate: 1 | State: Backlog | Blocked by: P1-12

Published versions can never change.

Acceptance criteria:

- A DB trigger rejects any update to a published version's spec, and a test proves it.

Refs: `.claude/skills/bandwise-builder/references/data-model.md#invariants-tested`

#### P1-17 Add the two-org seed

Labels: `Platform / Tenancy` `bandwise:tenancy` | Estimate: 2 | State: Backlog | Blocked by: P1-15

Tests start from two orgs with real-looking data.

Acceptance criteria:

- A seed creates two orgs, each with members, a goal, a set and runs.
- The cross-tenant suite and Playwright use it.

Refs: `.claude/skills/bandwise-builder/references/data-model.md#identity-and-tenancy`, `.claude/skills/bandwise-builder/references/testing.md#cross-tenant-suite`

#### P1-18 Add dev implementations: local KEK vault, in-memory limiter and quota

Labels: `Platform / Tenancy` `Security` | Estimate: 3 | State: Backlog | Blocked by: P0-09

Everyone can run the stack locally with no cloud services.

Acceptance criteria:

- A `KeyResolver` backed by a `BANDWISE_KEK` envelope vault for dev, with an encrypt and decrypt round-trip test.
- In-memory `RateLimiter` and `QuotaGuard` match the port signatures.

Refs: `.claude/skills/bandwise-builder/references/architecture.md#ports`, `.claude/skills/bandwise-builder/references/security.md#typesafe-keys`, `.claude/skills/bandwise-builder/references/testing.md#security-tests`

#### P1-19 Implement RunSink over the repositories

Labels: `Platform / Tenancy` `bandwise:tenancy` `bandwise:models` | Estimate: 3 | State: Backlog | Blocked by: P1-15

A run and everything it creates are written in one transaction.

Acceptance criteria:

- `RunSink.persist` writes the run, action review items, usage events with the resolved model and the `model_alias_observations` update in one transaction. Label items join once the audit sampler lands (P3-30).
- A new `model_requested` to `model_resolved` pair emits `model.alias_moved` once.
- Usage events exist for every successful run.

Refs: `.claude/skills/bandwise-builder/references/architecture.md#ports`, `.claude/skills/bandwise-builder/references/architecture.md#run-data-flow`, `.claude/skills/bandwise-builder/references/data-model.md#runs-partitioned-by-month`

Note: Added: phase-1.md has no line for RunSink, but the Phase 1 exit gate needs usage events for every run.

#### P1-20 Run the registry sync, alias probe and contract watch jobs

Labels: `Platform / Tenancy` `bandwise:models` | Estimate: 5 | State: Backlog | Blocked by: P1-09, P1-15, P1-18

New models, moved aliases and TypeSafe contract changes are detected from Phase 1.

Acceptance criteria:

- Registry sync (nightly) lists `/v1/models` per org key, stores the reachable names in `org_typesafe_keys.models`, inserts unseen names as `unreviewed` and alerts the platform admin. An unseen `foo-2.0.0` is covered by a test.
- The alias probe sends a one-noul request for idle aliases and records the response `model`.
- Contract watch (nightly) diffs TypeSafe's `openapi.json`, `llms.txt` and `models.md` against committed snapshots, then alerts and opens an issue for the Architect on a change.

Refs: `.claude/skills/bandwise-builder/references/architecture.md#background-jobs`, `.claude/skills/bandwise-builder/references/system-one-models.md#6-detection`, `.claude/skills/bandwise-builder/references/testing.md#model-registry-tests`

Note: phase-3.md says these jobs run from Phase 1. The matching Platform line in phase-1.md is a pending edit.

#### P1-21 Record the minimum fixture set, including an alias-resolved response

Labels: `QA / Evals` `bandwise:models` | Estimate: 3 | State: Backlog | Blocked by: P1-09

Tests run on recorded System One responses, never live calls.

Acceptance criteria:

- Fixtures live in `packages/system-one-client/fixtures/*.json` as `{ request, response, openapiVersion }`.
- The set covers one of each question type, a multi-stage run, a choice with a none option chosen, a noul near 0.5, `jev-latest` answered by `jev-1.13.0`, and 401, 422, 429 and 529 errors.
- `pnpm fixtures:record [--model <id>]` re-records and scrubs headers and ids.

Refs: `.claude/skills/bandwise-builder/references/testing.md#fixtures`

#### P1-22 Add the fixture contract test against zod

Labels: `QA / Evals` `bandwise:contract` | Estimate: 2 | State: Backlog | Blocked by: P1-21

A changed System One shape fails CI, and new fields pass.

Acceptance criteria:

- Every fixture response validates against the passthrough answer schemas.
- The test fails when the committed contract snapshot's `openapi.json` version is newer than the fixtures' version. PR CI needs no network.

Refs: `.claude/skills/bandwise-builder/references/testing.md#fixtures`

#### P1-23 Add the pinned-classification table test

Labels: `QA / Evals` `bandwise:models` | Estimate: 1 | State: Backlog | Blocked by: P0-13

Pinned versus moving comes from the registry only.

Acceptance criteria:

- `jev-latest`, `jev-preview`, `jev` and `jev-1.13` are moving, `jev-1.13.0` is pinned, and an unseen `foo-2.0.0` is moving.
- Classification reads the registry `kind` only, never a pattern match.

Refs: `.claude/skills/bandwise-builder/references/testing.md#model-registry-tests`, `.claude/skills/bandwise-builder/references/system-one-models.md#4-pinned-or-moving`

#### P1-24 Build the packages/evals CLI

Labels: `QA / Evals` `bandwise:models` | Estimate: 5 | State: Backlog | Blocked by: P1-02, P1-03, P1-04, P1-15

Internal evals score a version on a dataset with the metrics the gates use.

Acceptance criteria:

- `pnpm eval --org <slug> --set <slug> --version <n> --dataset <name> [--snapshot <id>] [--model <id>]` runs. Without `--snapshot` it takes a new snapshot.
- Metrics per question (accuracy, MAE, Brier, confusion matrix) and per band (precision with its 95 percent Wilson lower bound, coverage, review load, ECE), plus cost and latency.
- `eval_runs` record `model` and `snapshot_id`. `--model` evaluates without publishing.
- `--repeats` and the stability metric land in P3b-27.

Refs: `.claude/skills/bandwise-builder/references/testing.md#evals-packagesevals`

#### P1-25 Build the cross-tenant suite generator

Labels: `QA / Evals` `bandwise:tenancy` `Security` | Estimate: 3 | State: Backlog | Blocked by: P1-15, P1-17

Tenant isolation is tested for every repository method, automatically.

Acceptance criteria:

- Generated from the repository list: with org A's context, a method cannot read or write org B's rows.
- With the repository's org filter bypassed, RLS alone returns zero rows.
- Route checks (org B's token on an org A resource returns 404) are added as routes land.

Refs: `.claude/skills/bandwise-builder/references/testing.md#cross-tenant-suite`

#### P1-26 Add the live smoke script for the smoke list models

Labels: `QA / Evals` `bandwise:models` | Estimate: 2 | State: Backlog | Blocked by: P1-09

Nightly smoke catches live System One changes the fixtures cannot.

Acceptance criteria:

- `pnpm smoke` is skipped without `TYPESAFE_API_KEY`. `--model <id>` runs one model.
- The smoke list is `jev-preview`, `jev-latest`, each pinned version in use and every registry model with status `preview` or `stable`.
- Per model: one call per question type in the profile and one two-stage run. Asserts the response shape, `usage.input_tokens > 0`, a versioned id in the response `model`, and total cost under $0.001.

Refs: `.claude/skills/bandwise-builder/references/testing.md#live-smoke-pnpm-smoke`

#### P1-27 Pass the Phase 1 exit gate

Labels: `QA / Evals` `bandwise:tenancy` `bandwise:models` | Estimate: 3 | State: Backlog | Blocked by: P1-05, P1-06, P1-07, P1-08, P1-10, P1-11, P1-14, P1-16, P1-19, P1-20, P1-22, P1-23, P1-24, P1-25, P1-26

Confirm Phase 1 is done before Phase 2 starts.

Acceptance criteria:

- A spec runs end to end against fixtures and returns a valid `RunResult` with bands, actions, cost and savings.
- Router and compiler at 100 percent branch coverage.
- Usage events are written for every run, each with the resolved model.
- The cross-tenant suite passes, including with the repository filter bypassed.
- `pnpm smoke` passes when `TYPESAFE_API_KEY` is set.
- Preflight limits come from the profile: a fake 16k profile blocks a 20k state.
- An unknown answer type is stored raw and never throws.
- `templates/question-set.example.json` lints with zero errors against the `jev-1.13.0` seed profile.
- `pnpm bandwise run --local` runs the demo spec with no network access and no `TYPESAFE_API_KEY`.
- The boundary lint rejects a deliberate import of the SDK transport from `packages/cli/src/local/**`.

Refs: `.claude/skills/bandwise-builder/references/phases/phase-1.md#exit-gate`

### Bandwise P2: Tenancy, auth, keys and billing

Auth and orgs, BYO keys, app and agent tokens with the device flow, runOperation with approvals and idempotency, the run route, rate limits, the Stripe foundation, platform admin and the console shell.

Lead role: Platform / Tenancy. Depends on: Bandwise P1: Core engine and data layer. Needs the Phase 1 schema and repositories, and ADR-002 (P0-18). Checklist: `.claude/skills/bandwise-builder/references/phases/phase-2.md`. 30 issues, 112 points.

#### P2-01 Wire auth per ADR-002: orgs, memberships, invites, roles, active org

Labels: `Platform / Tenancy` `bandwise:tenancy` `Security` | Estimate: 8 | State: Backlog | Blocked by: P0-18, P1-15

People sign in, belong to many orgs, and act in one active org at a time.

Acceptance criteria:

- The ADR-002 library signs users in. `organizations` and `memberships` hold five roles. Invites are 7-day token links. One user can hold many orgs and picks the active org.
- `org.create` (session only) makes the caller the owner.
- `member.list`, `member.invite`, `member.role_change` and `member.remove` exist as operations. Invites and removals count as role changes. Changing a member to or from owner needs the owner role.

Refs: `.claude/skills/bandwise-builder/references/phases/phase-2.md#platform--tenancy`, `.claude/skills/bandwise-builder/references/data-model.md#identity-and-tenancy`, `.claude/skills/bandwise-builder/references/data-model.md#roles`, `.claude/skills/bandwise-builder/references/management-api.md#identity-tokens-and-admin`

#### P2-02 Add the org switcher and /[orgSlug] routing

Labels: `Platform / Tenancy` `bandwise:tenancy` | Estimate: 3 | State: Backlog | Blocked by: P2-01

Every tenant page is scoped by its org slug.

Acceptance criteria:

- Every tenant page lives under `/[orgSlug]`, and switching org switches the tenant context.
- A user in three orgs sees no data from the other two (Playwright, SGR, Personal and Dallas style seed).

Refs: `.claude/skills/bandwise-builder/references/phases/phase-2.md#platform--tenancy`, `.claude/skills/bandwise-builder/references/data-model.md#tenancy-rules`

#### P2-03 Build the BYO key vault with envelope encryption and validation

Labels: `Platform / Tenancy` `Security` `bandwise:models` | Estimate: 5 | State: Backlog | Blocked by: P1-18, P1-09, P2-01

Org TypeSafe keys are stored encrypted and never leave the server.

Acceptance criteria:

- A per-org DEK (AES-256-GCM) is wrapped by KMS in production and `BANDWISE_KEK` in dev. Only `tenancy.KeyResolver` decrypts, plaintext is cached for at most 5 minutes, and the UI shows `key_last4` and a fingerprint only.
- Saving validates the key with `GET /v1/models` and stores the reachable names in `org_typesafe_keys.models`.
- `key.get`, `key.rotate` (also saves the first key) and `key.revoke` exist as operations. A 401 from TypeSafe marks the key invalid and emits `key.invalid`.
- KEK rotation re-wraps DEKs in a background job.

Refs: `.claude/skills/bandwise-builder/references/security.md#typesafe-keys`, `.claude/skills/bandwise-builder/references/management-api.md#identity-tokens-and-admin`, `.claude/skills/bandwise-builder/references/data-model.md#keys-and-agent-tokens`

#### P2-04 Add platform key mode

Labels: `Platform / Tenancy` `Security` | Estimate: 2 | State: Backlog | Blocked by: P2-03

Orgs without their own key can run on the platform key, metered and capped.

Acceptance criteria:

- An org can run on the platform TypeSafe key. Usage is metered to its Stripe subscription and capped by plan.
- An unpriced model returns `422 model_unpriced` in platform key mode.

Refs: `.claude/skills/bandwise-builder/references/security.md#typesafe-keys`, `.claude/skills/bandwise-builder/references/testing.md#model-registry-tests`

#### P2-05 Add app tokens: sk_live_, sk_test_ and pk_live_

Labels: `Platform / Tenancy` `Security` `bandwise:tenancy` | Estimate: 5 | State: Backlog | Blocked by: P2-01

Host apps call Bandwise with scoped, channel-bound tokens.

Acceptance criteria:

- Create (shown once, stored as sha256 with a pepper), scopes, set allowlist, origins, channel binding (production by default), expiry, revoke and `last_used_at`.
- `runs:write` and `feedback:write` exist only on `sk_` tokens. `pk_` tokens are run-only with an origin check.
- `app.list`, `app.create`, `app.update`, `app_token.create` and `app_token.revoke` exist as operations (admin). A token with a write scope is `high*` for agents, except `feedback:write` on an `sk_test_` token bound to staging.
- Revocation takes effect within 60 seconds.

Refs: `.claude/skills/bandwise-builder/references/security.md#app-tokens`, `.claude/skills/bandwise-builder/references/management-api.md#apps-and-integration`, `.claude/skills/bandwise-builder/references/data-model.md#keys-and-agent-tokens`

#### P2-06 Add agent tokens (sa_live_) with role ceiling, scopes and expiry

Labels: `Platform / Tenancy` `Security` `bandwise:headless` | Estimate: 5 | State: Backlog | Blocked by: P2-01

Agents act for one user in one org and never above that user's role.

Acceptance criteria:

- Created in settings with scopes from the final scope list, a role ceiling, a 90-day maximum expiry and an optional daily spend cap (`402 token_budget_exceeded`).
- Effective role is min(ceiling, current membership role), read on every request. Demoting the user removes the permission on the next request.
- A token mints only tokens with scopes it holds and never `admin:write`. A token can always revoke itself.
- `agent_token.list`, `agent_token.create`, `agent_token.revoke` and `actor.get` exist as operations.

Refs: `.claude/skills/bandwise-builder/references/security.md#agent-tokens`, `.claude/skills/bandwise-builder/references/management-api.md#identity-tokens-and-admin`, `.claude/skills/bandwise-builder/references/data-model.md#keys-and-agent-tokens`

#### P2-07 Build the device flow for agent tokens (RFC 8628)

Labels: `Platform / Tenancy` `Security` `bandwise:headless` | Estimate: 3 | State: Backlog | Blocked by: P2-06

The CLI, MCP server and Chrome extension get agent tokens without copying secrets.

Acceptance criteria:

- `POST /api/v1/auth/device/code` and `POST /api/v1/auth/device/token` are plain route handlers.
- The person approves in a console session and picks the org, scopes and a ceiling no higher than their own role.
- Codes are single use and expire after 10 minutes. The token records its client (cli, mcp or extension).

Refs: `.claude/skills/bandwise-builder/references/security.md#agent-tokens`, `.claude/skills/bandwise-builder/references/management-api.md#auth-device-flow`

#### P2-08 Implement runOperation steps: actor, validation, can() and If-Match

Labels: `Platform / Tenancy` `bandwise:headless` `Security` | Estimate: 8 | State: Backlog | Blocked by: P0-11, P1-08, P2-06

Every caller goes through the same operation pipeline.

Acceptance criteria:

- The runOperation steps run in the documented order: `400 invalid_request` with `details`, `403 insufficient_scope` in the caller's org, `404` across orgs or outside the set allowlist. Session-only operations refuse tokens.
- `If-Match`: `428` when missing, `412 precondition_failed` with `currentEtag` on mismatch.
- Dry runs run steps 1 to 6 and `op.preview`, and write nothing.
- Events for `op.emits` are written in the same transaction.
- Server Actions and generated route handlers are thin adapters over `runOperation`.

Refs: `.claude/skills/bandwise-builder/references/management-api.md#runoperation`, `.claude/skills/bandwise-builder/references/management-api.md#adapters`, `.claude/skills/bandwise-builder/references/management-api.md#draft-concurrency`, `.claude/skills/bandwise-builder/references/management-api.md#dry-runs`

#### P2-09 Add approval_requests and the approval step in runOperation

Labels: `Platform / Tenancy` `bandwise:headless` `Security` | Estimate: 5 | State: Backlog | Blocked by: P2-08

High-risk agent operations wait for a person.

Acceptance criteria:

- A high-risk agent call returns `202 { approval: { id, status, url, expiresAt } }`, stores the input, `input_hash` and `If-Match`, and emits `approval.requested`. A repeat call for the same operation and `input_hash` returns the same request.
- `approval.list`, `approval.get` and `approval.decide` (session only) exist as operations. An approved request runs its stored input unchanged with `approval_id`. A changed draft fails with 412 and nothing publishes.
- Requests expire after 7 days. Moves toward safety are never gated.

Refs: `.claude/skills/bandwise-builder/references/management-api.md#approvals`, `.claude/skills/bandwise-builder/references/security.md#approval-gate`

#### P2-10 Add the agentApprovals org setting and the always-gated list

Labels: `Platform / Tenancy` `Security` `bandwise:headless` | Estimate: 2 | State: Backlog | Blocked by: P2-09

Orgs choose how much agents may do without a person, within fixed limits.

Acceptance criteria:

- Values `required` (default), `production_only` and `off`.
- Always gated whatever the setting: key rotation or revocation, member role changes, PII and retention changes, org deletion, `admin:write` token creation and lowering `agentApprovals`.

Refs: `.claude/skills/bandwise-builder/references/security.md#approval-gate`, `.claude/skills/bandwise-builder/references/management-api.md#catalog`

#### P2-11 Add idempotency middleware on idempotency_keys

Labels: `Platform / Tenancy` `bandwise:headless` | Estimate: 3 | State: Backlog | Blocked by: P2-08

Retries from apps and agents never apply twice.

Acceptance criteria:

- `Idempotency-Key` is required on mutations from app and agent tokens (`400` when missing). Runs and feedback are the documented exceptions.
- Keys live 24 hours and are written in the operation's transaction. A replay returns the stored response with `Idempotent-Replayed: true`.
- The same key with a different body returns `422 idempotency_key_reused`.

Refs: `.claude/skills/bandwise-builder/references/management-api.md#idempotency-keys`

#### P2-12 Serve runs through set.run on POST /api/v1/sets/{ref}/run

Labels: `Platform / Tenancy` `bandwise:tenancy` `bandwise:models` | Estimate: 5 | State: Backlog | Blocked by: P2-05, P2-08, P1-02, P1-03, P1-19

Apps, agents and the console run sets through one operation.

Acceptance criteria:

- `set.run` takes a `RunRequest` and returns `RunResult`, or `RunDryRunResult` when `options.dryRun` is set, following the run data flow. Sessions, agent tokens and app tokens (on their bound channel) may call it.
- `slug@7` pins a version. `slug@draft` behaves as shadow and is refused for `sk_live_` and `pk_live_`. An `inactive` channel returns `409 set_not_live`.
- `Idempotency-Key` is accepted. A replay returns the original `runId` with no second action or usage event.
- Responses carry `ETag`, `X-Request-Id`, `X-RateLimit-Limit` and `X-RateLimit-Remaining`.

Refs: `.claude/skills/bandwise-builder/references/api.md#endpoints-run-surface`, `.claude/skills/bandwise-builder/references/management-api.md#runs-and-usage`, `.claude/skills/bandwise-builder/references/architecture.md#run-data-flow`, `.claude/skills/bandwise-builder/references/spec-schema.md#1-runrequest`

Note: Added: the catalog puts `set.run` in Phase 2, and the k6 exit checks need it, but phase-2.md has no line for it.

#### P2-13 Add browser token minting with ES256 and the JWKS route

Labels: `Platform / Tenancy` `Security` | Estimate: 3 | State: Backlog | Blocked by: P2-05

Browsers get short-lived tokens without ever holding an `sk_` token.

Acceptance criteria:

- `POST /api/v1/tokens/browser` (`browser_token.create`, `sk_` only) returns a 5-minute ES256 JWT bound to origin and set list, signed with `BANDWISE_JWT_SIGNING_KEY` and a `kid`.
- The JWKS is served at `/api/v1/.well-known/jwks.json`. On rotation the new `kid` is published before it signs, and the old one stays until its tokens expire.

Refs: `.claude/skills/bandwise-builder/references/security.md#app-tokens`, `.claude/skills/bandwise-builder/references/api.md#auth-modes`

#### P2-14 Add org_webhook_secrets, encrypted like TypeSafe keys

Labels: `Platform / Tenancy` `Security` | Estimate: 1 | State: Backlog | Blocked by: P2-03

Org webhook signing secrets exist before Phase 5 webhooks need them.

Acceptance criteria:

- Each org's webhook secret uses the same envelope encryption as `org_typesafe_keys` and is never logged.

Refs: `.claude/skills/bandwise-builder/references/security.md#typesafe-keys`, `.claude/skills/bandwise-builder/references/events.md#org-webhooks-phase-5`

#### P2-15 Split retention into state, answers and dataset settings

Labels: `Platform / Tenancy` `Security` `bandwise:tenancy` | Estimate: 2 | State: Backlog | Blocked by: P2-01

State, answers and datasets are kept on separate clocks.

Acceptance criteria:

- `state_retention_days` (default 30), `answers_retention_days` (default 180) and `dataset_retention_days` (defaults to the state retention; only an admin can raise it, audited).
- Retention changes are always gated for agents.

Refs: `.claude/skills/bandwise-builder/references/security.md#pii-and-data-handling`, `.claude/skills/bandwise-builder/references/effectiveness-loop.md#13-data-for-learning`

#### P2-16 Add rate limiters per org, token, eval bucket and model budget

Labels: `Platform / Tenancy` `bandwise:tenancy` `bandwise:models` | Estimate: 5 | State: Backlog | Blocked by: P1-18, P2-05, P2-06

One noisy org or agent cannot starve another.

Acceptance criteria:

- Limiters per org (plan) and per token, an eval bucket (25 percent of org RPM by default, lowest priority), and a global per-model budget from platform settings (about 1,000 RPM for `jev-1.13.0`) with per-org fair share.
- Limiter keys include the model and are prefixed `org:{orgId}:`.

Refs: `.claude/skills/bandwise-builder/references/security.md#rate-limits-for-agents-and-evals`, `.claude/skills/bandwise-builder/references/architecture.md#ports`, `.claude/skills/bandwise-builder/references/architecture.md#caching`

#### P2-17 Write audit rows inside withTenant for every mutation

Labels: `Platform / Tenancy` `Security` `bandwise:tenancy` | Estimate: 3 | State: Backlog | Blocked by: P2-08

Every change says who did it, through what, and who approved it.

Acceptance criteria:

- `audit_log` is append-only: the app's DB role has no UPDATE or DELETE on it.
- Every mutation writes exactly one row with `actor_type`, `client`, `actor_user_id`, `actor_token_id`, `approval_id` and `actor_role`. Impersonation writes `impersonator_id`.

Refs: `.claude/skills/bandwise-builder/references/security.md#audit`, `.claude/skills/bandwise-builder/references/data-model.md#invariants-tested`

#### P2-18 Build the platform admin route group with impersonation

Labels: `Platform / Tenancy` `Security` | Estimate: 5 | State: Backlog | Blocked by: P2-01, P2-17

The platform admin manages orgs and platform settings safely.

Acceptance criteria:

- A separate route group needs `platform_role = 'superadmin'` and MFA. Org tokens get 404.
- `platform_org.list`, `platform_org.suspend` (blocks runs within 30 seconds), `platform_org.set_entitlement`, `platform_settings.get|update` and `platform_price_book.get|update` exist as session-only operations.
- Impersonation is time-boxed, shows a banner and is audited.

Refs: `.claude/skills/bandwise-builder/references/security.md#platform-admin`, `.claude/skills/bandwise-builder/references/management-api.md#platform-platform-admin-only`

#### P2-19 Write plans.ts with plan limits

Labels: `Billing` | Estimate: 2 | State: Backlog | Blocked by: P0-09

Plan limits are one typed source.

Acceptance criteria:

- `plans.ts` sets runs per month, platform System One spend per month, RPM, seats, apps, sets, retention maximum, SSO and eval runs for each `PlanId`.

Refs: `.claude/skills/bandwise-builder/references/phases/phase-2.md#billing--savings`, `.claude/skills/bandwise-builder/references/architecture.md#core-contracts-packagescoresrccontracts`

#### P2-20 Set up Stripe products, meters, Checkout and Customer Portal

Labels: `Billing` | Estimate: 5 | State: Backlog | Blocked by: P2-19, P2-01, P0-18

Orgs subscribe and pay for System One spend.

Acceptance criteria:

- Meters bill System One cost in micro-USD (or one meter per model), never raw tokens at one rate.
- Checkout and the Customer Portal open from a console session. They are the documented console-only exception to headless parity.
- A billing upgrade works in Stripe test mode.

Refs: `.claude/skills/bandwise-builder/references/phases/phase-2.md#billing--savings`, `.claude/skills/bandwise-builder/references/savings-model.md#price-book`, `.claude/skills/bandwise-builder/references/testing.md#playwright`

#### P2-21 Handle Stripe webhooks with idempotency and read-only mode

Labels: `Billing` `Security` | Estimate: 3 | State: Backlog | Blocked by: P2-20

Billing events apply once, and failed payments degrade gracefully.

Acceptance criteria:

- Webhook signatures are verified, with a rejection test.
- An idempotency table makes a replayed webhook a no-op.
- A failed payment starts a grace period, then read-only mode.

Refs: `.claude/skills/bandwise-builder/references/phases/phase-2.md#billing--savings`, `.claude/skills/bandwise-builder/references/testing.md#security-tests`

#### P2-22 Build the meter outbox job to Stripe

Labels: `Billing` | Estimate: 3 | State: Backlog | Blocked by: P2-20, P1-19

Usage reaches Stripe exactly once per run.

Acceptance criteria:

- Every minute, the outbox pushes usage events to Stripe with the run id as the idempotency key.
- A replayed run pushes nothing.

Refs: `.claude/skills/bandwise-builder/references/architecture.md#background-jobs`, `.claude/skills/bandwise-builder/references/management-api.md#idempotency-keys`

#### P2-23 Carry the resolved model on usage events into metering

Labels: `Billing` `bandwise:models` | Estimate: 1 | State: Backlog | Blocked by: P1-19

Spend is priced by the model that answered.

Acceptance criteria:

- Usage events carry `model_resolved`, and metering and price lookups use it.

Refs: `.claude/skills/bandwise-builder/references/data-model.md#billing-and-usage`, `.claude/skills/bandwise-builder/references/savings-model.md#price-book`

#### P2-24 Add price book defaults and per-org overrides by versioned model

Labels: `Billing` `bandwise:models` `bandwise:tenancy` | Estimate: 3 | State: Backlog | Blocked by: P1-12, P2-18

Prices are data, keyed by the exact versioned model id.

Acceptance criteria:

- Platform default rows (`org_id` null) and org overrides, keyed by exact versioned model id. Alias rows are rejected with 400.
- An org override wins for its own org. `price_book.get` and `price_book.update` exist as operations.
- Cross-tenant test: org A cannot read or write org B's override, and both read the platform rows.

Refs: `.claude/skills/bandwise-builder/references/savings-model.md#price-book`, `.claude/skills/bandwise-builder/references/system-one-models.md#8-pricing`, `.claude/skills/bandwise-builder/references/data-model.md#billing-and-usage`

#### P2-25 Build the nightly usage_daily rollup

Labels: `Billing` `bandwise:tenancy` | Estimate: 3 | State: Backlog | Blocked by: P1-19

Quota, billing reconciliation and dashboards read one daily rollup.

Acceptance criteria:

- `usage_daily` rolls up runs, `system_one_input_tokens` and `system_one_cost_micro_usd` per org, set and model, nightly.
- Stripe test clock: 1,000 runs reconcile with `usage_daily` within 0.1 percent.

Refs: `.claude/skills/bandwise-builder/references/savings-model.md#rollups-usage_daily`, `.claude/skills/bandwise-builder/references/architecture.md#background-jobs`

Note: Added: the quota guard and the Stripe reconciliation exit check read `usage_daily`, but no phase-2.md line builds it.

#### P2-26 Add the quota guard on usage_daily plus a same-day Redis counter

Labels: `Billing` `bandwise:tenancy` | Estimate: 3 | State: Backlog | Blocked by: P2-19, P2-25

Plans cap usage without a slow query on every run.

Acceptance criteria:

- `QuotaGuard` reads `usage_daily` plus a same-day Redis counter and returns `quota_exceeded` or `token_budget_exceeded` per the port.
- It is checked in run step 7.

Refs: `.claude/skills/bandwise-builder/references/architecture.md#ports`, `.claude/skills/bandwise-builder/references/architecture.md#run-data-flow`

#### P2-27 Build the console shell and settings pages

Labels: `Console UI` `bandwise:tenancy` | Estimate: 5 | State: Backlog | Blocked by: P2-02, P2-08

The console has its frame and the settings every org needs.

Acceptance criteria:

- Layout, org switcher and nav.
- Settings pages for members, keys, apps, agent tokens, billing, retention, PII and agent approvals.
- Every page calls operations, never repositories.

Refs: `.claude/skills/bandwise-builder/references/phases/phase-2.md#console-ui`, `.claude/skills/bandwise-builder/references/management-api.md#adapters`

#### P2-28 Build the approvals inbox: list, approve and reject

Labels: `Console UI` `bandwise:headless` `Security` | Estimate: 3 | State: Backlog | Blocked by: P2-09, P2-27

People decide pending agent requests in the console.

Acceptance criteria:

- The inbox lists `approval.list` with a count badge.
- Approve or reject goes through `approval.decide` in a console session, and the stored input then runs.

Refs: `.claude/skills/bandwise-builder/references/management-api.md#approvals`

#### P2-29 Review keys, tokens, device flow and approvals for security

Labels: `Security review` `Security` | Estimate: 3 | State: Backlog | Blocked by: P2-03, P2-05, P2-06, P2-07, P2-09, P2-13

The Security reviewer signs off on the Phase 2 attack surface.

Acceptance criteria:

- Each PR touching keys, authz, app or agent tokens, approvals, the device flow or browser tokens has Security reviewer sign-off.
- The log scrubber test finds no `sk_`, `pk_`, `sa_live_` or TypeSafe key material in logs or responses.
- The default `agentApprovals` setting is reviewed, as PLAN.md requires before the first paying customer.

Refs: `.claude/skills/bandwise-builder/references/security.md`, `.claude/skills/bandwise-builder/references/testing.md#security-tests`, `docs/PLAN.md#before-the-first-paying-customer`

Note: Added: phase-2.md names the Security reviewer as an owner without a checklist line.

#### P2-30 Pass the Phase 2 exit gate

Labels: `QA / Evals` `bandwise:tenancy` `Security` | Estimate: 5 | State: Backlog | Blocked by: P2-04, P2-10, P2-11, P2-12, P2-14, P2-15, P2-16, P2-21, P2-22, P2-23, P2-24, P2-26, P2-28, P2-29

Confirm Phase 2 is done before Phase 3 starts.

Acceptance criteria:

- One user in three orgs (SGR, Personal, Dallas style seed) switches with no data leak (Playwright).
- One Playwright test per role proves its permissions.
- Demoting a user removes the matching permissions from their agent tokens on the next request.
- An agent token hitting a high-risk operation gets 202 and a pending approval. A person approves in the console and the stored input runs.
- Log scrubber test: no key material (`sk_`, `pk_`, `sa_live_`, TypeSafe keys) in logs or responses.
- k6: one org at its limit does not move another org's p95 latency.
- k6: a 5,000-case eval in org A does not move org A production p95 by more than 10 percent.
- Stripe test clock: subscribe, run 1,000 runs, and invoiced System One spend reconciles with `usage_daily` within 0.1 percent.
- Replaying a webhook is a no-op.

Refs: `.claude/skills/bandwise-builder/references/phases/phase-2.md#exit-gate`, `.claude/skills/bandwise-builder/references/testing.md#load-k6`

### Bandwise P3: Console and management API

Console screens on operations, the management API with parity, the bandwise CLI, MCP stdio, event feed, feedback API, audit sampling, rollout gates and auto-demote, model pages and reports.

Lead role: Console UI. Depends on: Bandwise P2: Tenancy, auth, keys and billing. Needs Phase 2 (auth, tokens, runOperation, approvals, the run route). Checklist: `.claude/skills/bandwise-builder/references/phases/phase-3.md`. 45 issues, 183 points.

#### P3-01 Register project, goal, template, set and draft operations

Labels: `Platform / Tenancy` `bandwise:headless` | Estimate: 5 | State: Backlog | Blocked by: P2-08, P2-11, P1-06

The set-building operations exist before any screen uses them.

Acceptance criteria:

- The Phase 3 rows under Projects and goals and under Sets and drafts have real input and output schemas and handlers.
- The draft ETag is its `spec_hash`. `draft.update` replaces the whole strict spec and requires `If-Match`. A `rollout` key fails with a message naming `rollout.change`.
- `draft.validate` returns `{ errors[], warnings[] }` in the error `details` shape and writes nothing.
- `template.list` returns `{ id, name, pattern, parameters }`. `set.create` without `fromVersion` copies the default model into the draft once.
- `set.update` changes `name`, `protected` (admin only), `labeling`, `dispatchActionsOnStaging`, `valueSettings` and `gateMargins`.

Refs: `.claude/skills/bandwise-builder/references/management-api.md#projects-and-goals`, `.claude/skills/bandwise-builder/references/management-api.md#sets-and-drafts`, `.claude/skills/bandwise-builder/references/management-api.md#draft-concurrency`, `.claude/skills/bandwise-builder/references/system-one-models.md#14-default-model`

Note: Split from the phase-3.md item "Every console capability registered as an operation with its /api/v1 route; the parity test passes" (P3-01 to P3-05), because it is far larger than 8 points.

#### P3-02 Register version, release and rollout operations with dry runs

Labels: `Platform / Tenancy` `bandwise:headless` `Security` | Estimate: 8 | State: Backlog | Blocked by: P3-01, P2-09, P1-07, P3-35

Publishing, rollback, promotion and rollout run through operations that gates and approvals guard.

Acceptance criteria:

- `version.list`, `version.get`, `version.diff` (`SpecDiff`), `set.publish`, `channel.rollback`, `channel.promote`, `release.list`, `rollout.get` and `rollout.change` work.
- Publish freezes the draft into version N+1 under `If-Match` and runs lints, including `interface.breaking` (consumers are apps with runs in the last 30 days until bindings land in P4b-13). An unchanged spec is a no-op unless `interfaceBump` is set.
- The eval gate is required when the production pointer is `controlled` or `full`: the same-snapshot regression gate in effectiveness-loop.md section 5.
- The `high*` rules for publish, promote and `rollout.change` apply. Moves toward safety are never gated. A failed gate returns `409 gate_not_met` with `gates`.
- `?dryRun=true` on publish, rollback, promote and rollout change returns `DryRunResult` and writes nothing. A replayed publish with the same `Idempotency-Key` creates no version.
- Each move writes `release_events` and an audit row, and bumps the pointer cache epoch, so the API serves a new version within 30 seconds.

Refs: `.claude/skills/bandwise-builder/references/management-api.md#versions-and-releases`, `.claude/skills/bandwise-builder/references/management-api.md#rollout`, `.claude/skills/bandwise-builder/references/management-api.md#dry-runs`, `.claude/skills/bandwise-builder/references/architecture.md#managed-live`, `.claude/skills/bandwise-builder/references/architecture.md#caching`, `.claude/skills/bandwise-builder/references/confidence-policy.md#default-gates-production-channel-editable-per-set-stricter-for-high-risk-sets`, `.claude/skills/bandwise-builder/references/effectiveness-loop.md#5-quality-targets-and-gates-phase-3`

Note: Split from the phase-3.md item "Every console capability registered as an operation with its /api/v1 route; the parity test passes" (P3-01 to P3-05), because it is far larger than 8 points.

#### P3-03 Register dataset, eval, compare and review operations

Labels: `Platform / Tenancy` `bandwise:headless` `Security` | Estimate: 5 | State: Backlog | Blocked by: P3-01, P1-24

Test-and-learn work runs through operations with the holdout rules enforced on the server.

Acceptance criteria:

- `dataset.list`, `dataset.create`, `dataset.import`, `dataset.cases`, `dataset.snapshot`, `dataset.export`, `eval.run` and `eval.get` (202 with `jobId` and `evalRunId`), `set.compare`, and `review.list`, `review.assign`, `review.resolve`, `review.dismiss` and `review.confirm` (session only).
- The server assigns each case's fixed split (40/40/20 from a hash of `state_hash`). The test split never appears in any response. Per-case calibration results come back only with `includeCases: true`, and those cases are burned.
- An agent resolving a kind `action` item leaves it `pending_confirmation` until a person calls `review.confirm`. Agent labels count toward nothing until confirmed.
- Evals and compares use the eval limiter bucket.

Refs: `.claude/skills/bandwise-builder/references/management-api.md#datasets-evals-and-jobs`, `.claude/skills/bandwise-builder/references/management-api.md#review-and-feedback`, `.claude/skills/bandwise-builder/references/management-api.md#holdout-rules-at-the-api`, `.claude/skills/bandwise-builder/references/effectiveness-loop.md#13-data-for-learning`

Note: Split from the phase-3.md item "Every console capability registered as an operation with its /api/v1 route; the parity test passes" (P3-01 to P3-05), because it is far larger than 8 points.

#### P3-04 Register run, usage, report, audit, alert, model and org operations

Labels: `Platform / Tenancy` `bandwise:headless` `bandwise:models` | Estimate: 5 | State: Backlog | Blocked by: P2-08

Read surfaces and the remaining Phase 3 operations exist for the console, CLI and MCP.

Acceptance criteria:

- `set.manifest` (no instructions, criteria or thresholds), `run.list` (catalog filters, no state), `run.get` (with its review items and their resolution), `usage.get`, `report.get` (csv and pdf), `alert.list`, `audit.list` (csv), `model.list` (`isDefault` on the default model), `model.get`, `portfolio.get` (session only) and `org.delete` (owner, always gated).
- `platform_model.list`, `platform_model.create`, `platform_model.update` and `platform_report.get` are superadmin session only, and org tokens get 404.

Refs: `.claude/skills/bandwise-builder/references/management-api.md#runs-and-usage`, `.claude/skills/bandwise-builder/references/management-api.md#reports-audit-and-events`, `.claude/skills/bandwise-builder/references/management-api.md#models`, `.claude/skills/bandwise-builder/references/management-api.md#platform-platform-admin-only`, `.claude/skills/bandwise-builder/references/management-api.md#identity-tokens-and-admin`

Note: Split from the phase-3.md item "Every console capability registered as an operation with its /api/v1 route; the parity test passes" (P3-01 to P3-05), because it is far larger than 8 points.

#### P3-05 Enforce the full parity test in CI

Labels: `QA / Evals` `bandwise:headless` | Estimate: 3 | State: Backlog | Blocked by: P0-12

No capability can exist only in the console.

Acceptance criteria:

- The test fails when an operation has no route or no OpenAPI path, when a curated MCP tool or CLI command maps to no operation or to a session-only one, or when code under `app/(org)/**` or `app/(platform)/**` imports a repository.
- A token calling a session-only operation gets `403 insufficient_scope`.

Refs: `.claude/skills/bandwise-builder/references/management-api.md#openapi-and-the-parity-test`, `.claude/skills/bandwise-builder/references/testing.md#headless-api-tests`

Note: Split from the phase-3.md item "Every console capability registered as an operation with its /api/v1 route; the parity test passes" (P3-01 to P3-05), because it is far larger than 8 points.

#### P3-06 Build goals CRUD with a QualityTarget and business KPI

Labels: `Console UI` | Estimate: 3 | State: Backlog | Blocked by: P3-01

Every set belongs to a goal with a typed quality target.

Acceptance criteria:

- Create and edit goals. Picking a tier (low, standard, high) fills `QualityTarget` with that tier's defaults, and each field stays editable.
- A free-text business KPI is stored in `goals.business_kpi`.

Refs: `.claude/skills/bandwise-builder/references/effectiveness-loop.md#5-quality-targets-and-gates-phase-3`, `.claude/skills/bandwise-builder/references/confidence-policy.md#quality-targets`

#### P3-07 Build the set list and create flow, seeding two templates

Labels: `Console UI` | Estimate: 3 | State: Backlog | Blocked by: P3-01

People start a set from blank or from a template.

Acceptance criteria:

- Set list and create from blank or a template.
- The document evaluator and email urgency templates are seeded, each tagged with a pattern and building a `Partial<QuestionSetSpec>` that includes `input.schema`. Templates never set `model`.

Refs: `.claude/skills/bandwise-builder/references/definition-studio.md#template-library-seeded`, `.claude/skills/bandwise-builder/references/deploy-and-codegen.md#3-pattern-advisor`, `.claude/skills/bandwise-builder/references/system-one-models.md#14-default-model`

#### P3-08 Build the question editor with form and JSON modes and live lints

Labels: `Console UI` | Estimate: 8 | State: Backlog | Blocked by: P3-01, P1-06

People edit questions with instant validation.

Acceptance criteria:

- Form mode and JSON mode over the draft, with live zod validation and lints shown at their JSON Pointer.
- Structured instructions and criteria. Backtick path autocomplete from `input.schema`.
- Saves go through `draft.update` with `If-Match` and show a 412 conflict clearly.

Refs: `.claude/skills/bandwise-builder/references/spec-schema.md`, `.claude/skills/bandwise-builder/references/architecture.md#lints-packagescoresrclints`, `.claude/skills/bandwise-builder/references/definition-studio.md#working-rules-for-question-writing`

#### P3-09 Build the model picker from model.list

Labels: `Console UI` `bandwise:models` | Estimate: 2 | State: Backlog | Blocked by: P3-04, P3-08

People pick a model from the registry, not a free-text box.

Acceptance criteria:

- Shows each model's status, limits and weaknesses from `model.list`.
- Moving models are marked, and `model.alias_past_shadow` shows when the set is past shadow.

Refs: `.claude/skills/bandwise-builder/references/system-one-models.md#3-modelprofile-contract`, `.claude/skills/bandwise-builder/references/system-one-models.md#4-pinned-or-moving`

#### P3-10 Build the options editor for choice, score and noul

Labels: `Console UI` | Estimate: 3 | State: Backlog | Blocked by: P3-08

Options, levels and criteria are easy to get right.

Acceptance criteria:

- Choice options up to 255 with a "none" suggestion, score levels 2 to 10 in order, and noul true and false criteria.
- The 255 and 2 to 10 limits are API-wide rules. Other limits come from the model profile.

Refs: `.claude/skills/bandwise-builder/references/system-one-api-contract.md#api-wide-rules`, `.claude/skills/bandwise-builder/references/architecture.md#lints-packagescoresrclints`

#### P3-11 Build the policy editor with band sliders and live preview

Labels: `Console UI` | Estimate: 5 | State: Backlog | Blocked by: P3-08

People tune bands and actions and see the effect right away.

Acceptance criteria:

- Per-question thresholds, noul settings, per-option overrides, the top-choice preset and band-to-action mapping.
- A live preview on sample state shows each decision's band and `effectiveAction`.
- Lint errors such as `policy.thresholds_order` show inline.

Refs: `.claude/skills/bandwise-builder/references/confidence-policy.md#policy-shape`, `.claude/skills/bandwise-builder/references/confidence-policy.md#preset-top-choice-only`, `.claude/skills/bandwise-builder/references/confidence-policy.md#band-algorithm`

#### P3-12 Build the input schema editor, redact paths and preflight meter

Labels: `Console UI` `Security` | Estimate: 3 | State: Backlog | Blocked by: P3-08, P1-05

People shape and protect state before it reaches the model.

Acceptance criteria:

- Edit `input.schema` and `redactPaths`, with `redact.path_unknown` shown.
- A token preflight meter against the profile limits warns at 80 percent.
- The adapter picker stays hidden until Phase 5 (P5-03), so sets run on raw JSON state.

Refs: `.claude/skills/bandwise-builder/references/architecture.md#run-data-flow`, `.claude/skills/bandwise-builder/references/security.md#pii-and-data-handling`, `.claude/skills/bandwise-builder/references/system-one-models.md#7-limits-as-data`

#### P3-13 Build the publish flow with lints, eval gate and dry-run preview

Labels: `Console UI` `bandwise:headless` | Estimate: 5 | State: Backlog | Blocked by: P3-02, P3-32

Publishing shows exactly what will change and what blocks it.

Acceptance criteria:

- The dialog sends `If-Match` with the draft ETag.
- It shows lints (including the model lints and `interface.breaking`), the eval gate result when production is `controlled` or `full`, changelog, channel choice and the dry-run preview (diff, lints, gates, `approvalRequired`, `interfaceChange`).

Refs: `.claude/skills/bandwise-builder/references/management-api.md#dry-runs`, `.claude/skills/bandwise-builder/references/management-api.md#versions-and-releases`, `.claude/skills/bandwise-builder/references/architecture.md#managed-live`

#### P3-14 Build version history, diffs, release events, rollback and promote

Labels: `Console UI` | Estimate: 3 | State: Backlog | Blocked by: P3-02

People see every version and move pointers in one click.

Acceptance criteria:

- History per set, version diffs from `version.diff`, and a release events timeline.
- One-click rollback and promote, each through its operation.

Refs: `.claude/skills/bandwise-builder/references/management-api.md#versions-and-releases`

#### P3-15 Build per-channel rollout control with gate status

Labels: `Console UI` | Estimate: 3 | State: Backlog | Blocked by: P3-02

People move a set through rollout stages with the gates in view.

Acceptance criteria:

- A status chip, timeline and gate checklist per channel (`inactive`, `shadow`, `controlled`, `full`, `paused`) through `rollout.change`.
- Gate results show required and actual values. Every change is audited.

Refs: `.claude/skills/bandwise-builder/references/confidence-policy.md#rollout-stages-per-set-per-channel`, `.claude/skills/bandwise-builder/references/management-api.md#rollout`

#### P3-16 Add the jobs endpoint GET /api/v1/jobs/{id}

Labels: `Platform / Tenancy` `bandwise:headless` | Estimate: 3 | State: Backlog | Blocked by: P2-08, P0-18

Long work runs as jobs that any client can poll.

Acceptance criteria:

- Long work returns `202 { jobId }`. `GET /api/v1/jobs/{id}` returns `{ id, kind, status, result?, error?, createdAt, finishedAt? }` with `Retry-After` while running.
- Kinds `eval`, `compare`, `calibrate`, `improve`, `try_model`, `policy_suggest` and `export` on the ADR-005 jobs runner.
- A finished job emits `job.completed`, and an eval job also emits `eval.completed`.

Refs: `.claude/skills/bandwise-builder/references/management-api.md#jobs`

#### P3-17 Send approval emails and the 24-hour reminder

Labels: `Platform / Tenancy` `bandwise:headless` `Security` | Estimate: 2 | State: Backlog | Blocked by: P2-09

People learn about pending agent requests without watching the console.

Acceptance criteria:

- On `approval.requested`, email every member whose role can decide, plus the token's own user, with the operation, reason and console URL.
- A request still pending after 24 hours is emailed once more.

Refs: `.claude/skills/bandwise-builder/references/management-api.md#approvals`, `.claude/skills/bandwise-builder/references/architecture.md#background-jobs`

Note: management-api.md specifies these emails. The matching line under the phase-3.md approvals item is a pending edit.

#### P3-18 Build the approvals decision UI with diff, gates and dry run

Labels: `Console UI` `bandwise:headless` `Security` | Estimate: 3 | State: Backlog | Blocked by: P2-28, P3-02

Approvers see everything they need to decide.

Acceptance criteria:

- Each request shows the stored input, a diff, gate results and the dry-run preview.
- Approve or reject goes through `approval.decide`. The requesting token and user are shown.

Refs: `.claude/skills/bandwise-builder/references/management-api.md#approvals`, `.claude/skills/bandwise-builder/references/phases/phase-3.md#headless-parity`

#### P3-19 Build agent token management for admins

Labels: `Console UI` `Security` `bandwise:headless` | Estimate: 2 | State: Backlog | Blocked by: P2-27, P2-06

Admins can see and revoke every agent token in the org.

Acceptance criteria:

- Admins see every member's tokens with scopes, ceiling, client, last use and expiry, and can revoke any of them.
- Members manage their own tokens.

Refs: `.claude/skills/bandwise-builder/references/security.md#agent-tokens`, `.claude/skills/bandwise-builder/references/management-api.md#identity-tokens-and-admin`

#### P3-20 Serve the event feed GET /api/v1/events

Labels: `Platform / Tenancy` `bandwise:headless` | Estimate: 3 | State: Backlog | Blocked by: P2-08

Agents with no public URL read events through a cursor feed.

Acceptance criteria:

- A cursor feed per events.md, filterable by type. Events are pruned after 30 days.
- An `sk_` app token with `events:read` sees only `review.created`, `review.sla_breached` and `review.resolved` for runs made with that app's tokens.

Refs: `.claude/skills/bandwise-builder/references/events.md#pull-feed-phase-3`, `.claude/skills/bandwise-builder/references/events.md#catalog`

#### P3-21 Serve the feedback API with a server-derived source

Labels: `Platform / Tenancy` `bandwise:headless` `Security` | Estimate: 3 | State: Backlog | Blocked by: P2-08, P2-12

Apps report outcomes so precision can be measured in every rollout stage.

Acceptance criteria:

- `POST /api/v1/feedback` (`feedback.report`) takes 1 to 1,000 `FeedbackReport` items matched by `runId` or `externalRef`, each idempotent on its own key, with `created`, `duplicate` or `error` per item.
- The server sets the source: `app` for `sk_` tokens, `agent` for agent tokens. A body `source` that differs returns `400 invalid_request`. Agent rows count toward nothing until a person confirms them.
- `pk_` and browser tokens are refused.

Refs: `.claude/skills/bandwise-builder/references/api.md#feedback`, `.claude/skills/bandwise-builder/references/effectiveness-loop.md#3-truth-sources-phase-3`

#### P3-22 Build the bandwise CLI foundation: login, profiles, status, bandwise api

Labels: `Integrations` `bandwise:headless` | Estimate: 5 | State: Backlog | Blocked by: P2-07, P0-12

Agents and CI drive Bandwise from a published CLI.

Acceptance criteria:

- `bandwise login` (device flow) and `logout`, named profiles per org, and `status` (`actor.get`). Credentials resolve from `--profile`, then `BANDWISE_TOKEN`, then the config profile, then the default profile.
- `--json` on every command. No prompts without a TTY (`--yes`). Exit codes 0, 1, 2 and 3 (approval pending).
- Mutations send a generated `Idempotency-Key` and retry safely. Errors print `code`, `message` and each `details` item.
- `bandwise api <operationId>` and `bandwise api --list` are built from `openapi.json` and refuse session-only operations.
- The CLI never touches the database, never calls TypeSafe and never stores a TypeSafe key.

Refs: `.claude/skills/bandwise-builder/references/headless-and-agents.md#bandwisecli`, `.claude/skills/bandwise-builder/references/headless-and-agents.md#profiles`, `.claude/skills/bandwise-builder/references/headless-and-agents.md#any-operation-bandwise-api`

Note: Split from the phase-3.md @bandwise/cli item (P3-22 to P3-24), because it is larger than 8 points.

#### P3-23 Add the Phase 3 named CLI commands

Labels: `Integrations` `bandwise:headless` | Estimate: 5 | State: Backlog | Blocked by: P3-22, P3-01, P3-02, P3-03, P3-04, P3-21

Common operations have named commands.

Acceptance criteria:

- Every Phase 3 row in the command tables (identity and admin; goals, sets and releases; datasets, evals and runs; review, feedback, reports and events) maps to its operation.
- Approval-gated commands exit 3 until a person approves.
- The parity test covers each command's mapping.

Refs: `.claude/skills/bandwise-builder/references/headless-and-agents.md#identity-and-admin`, `.claude/skills/bandwise-builder/references/headless-and-agents.md#goals-sets-and-releases`, `.claude/skills/bandwise-builder/references/headless-and-agents.md#datasets-evals-and-runs`, `.claude/skills/bandwise-builder/references/headless-and-agents.md#review-feedback-reports-and-events`

Note: Split from the phase-3.md @bandwise/cli item (P3-22 to P3-24), because it is larger than 8 points.

#### P3-24 Add specs as code: spec pull, push, diff, validate, datasets push

Labels: `Integrations` `bandwise:headless` | Estimate: 5 | State: Backlog | Blocked by: P3-22, P3-01, P3-03

Specs live in the customer repo and publish without an app redeploy.

Acceptance criteria:

- Repo layout `bandwise.config.json`, `bandwise/sets/<slug>.json` and `bandwise/datasets/<slug>/<name>.jsonl`. `.bandwise/specs.json` keeps the draft ETag for `If-Match`.
- `spec pull`, `push` (with `--create`), `diff` and `validate` map to their operations. Versions record `source` and `source_ref`.
- `datasets push` sends only new lines and stops with exit 1 when earlier lines changed.

Refs: `.claude/skills/bandwise-builder/references/headless-and-agents.md#specs-as-code`, `.claude/skills/bandwise-builder/references/headless-and-agents.md#datasets-evals-and-runs`

Note: Split from the phase-3.md @bandwise/cli item (P3-22 to P3-24), because it is larger than 8 points.

#### P3-25 Ship the MCP stdio server with the Phase 3 curated tools

Labels: `Integrations` `bandwise:headless` | Estimate: 8 | State: Backlog | Blocked by: P3-01, P3-02, P3-03, P3-04, P3-20, P3-21, P2-07

Agents manage Bandwise through MCP with the same rules as the CLI.

Acceptance criteria:

- `packages/mcp-server` runs over stdio and authenticates with an agent token (`BANDWISE_TOKEN` or a profile), never an `sk_` token or a TypeSafe key.
- Every Phase 3 curated tool maps to its operation, with JSON Schema from the zod input and `readOnlyHint` and `destructiveHint` from the registry.
- A gated call returns the pending approval and its URL. One server entry per profile.

Refs: `.claude/skills/bandwise-builder/references/headless-and-agents.md#mcp-server`

#### P3-26 Regenerate OpenAPI and MSW mocks from the registry

Labels: `Platform / Tenancy` `bandwise:headless` `bandwise:contract` | Estimate: 2 | State: Backlog | Blocked by: P3-01, P3-02, P3-03, P3-04

Clients build against real shapes, not placeholders.

Acceptance criteria:

- `openapi.json` and the MSW handlers regenerate from the registry with no placeholder shapes left for Phase 2 and Phase 3 operations.
- The snapshot test passes, and the Embed Kit builds against the mocks.

Refs: `.claude/skills/bandwise-builder/references/management-api.md#openapi-and-the-parity-test`, `.claude/skills/bandwise-builder/references/api.md`

#### P3-27 Build the playground with structural and behavioral diffs

Labels: `Console UI` | Estimate: 5 | State: Backlog | Blocked by: P3-03, P3-14

People compare two versions before they publish.

Acceptance criteria:

- Pick two versions and one state or a dataset. Show the structural diff, the behavioral diff, a flipped cases table and the cost delta.
- Runs through `set.compare` in the eval limiter bucket.

Refs: `.claude/skills/bandwise-builder/references/phases/phase-3.md#test-and-learn`, `.claude/skills/bandwise-builder/references/management-api.md#datasets-evals-and-jobs`

#### P3-28 Build the runs explorer and run detail

Labels: `Console UI` | Estimate: 3 | State: Backlog | Blocked by: P3-04

People find any run and see what happened in it.

Acceptance criteria:

- `run.list` filters by set, version, channel, source, status, band, action and date range.
- Run detail shows per-stage payloads and answers. State shows only when the set stored it.

Refs: `.claude/skills/bandwise-builder/references/management-api.md#runs-and-usage`

#### P3-29 Build the review queue for action and label items

Labels: `Console UI` | Estimate: 5 | State: Backlog | Blocked by: P3-03

Reviewers work one queue for decisions and labels.

Acceptance criteria:

- Kind `action` and `label` items show the reason each was picked. Assign, resolve, dismiss, add to dataset and SLA timers work.
- Agent resolutions wait in `pending_confirmation` until a person confirms them.
- Resolving an item can add a dataset case.

Refs: `.claude/skills/bandwise-builder/references/effectiveness-loop.md#4-labeling-policy-phase-3`, `.claude/skills/bandwise-builder/references/management-api.md#review-and-feedback`

#### P3-30 Build the audit sampler per the labeling policy

Labels: `Quality / Learning` | Estimate: 5 | State: Backlog | Blocked by: P1-19, P0-10

A random audit sample keeps precision honest in every rollout stage.

Acceptance criteria:

- `selectForLabeling` in `packages/core/src/learning` takes injected randomness. Audit picks come first, uniform per band, and store the rate used, lowering it for the rest of the day when the budget runs short.
- Targeted picks carry `sample_rate` null and never feed gates or health precision.
- `RunSink` writes label items in the run's transaction. Label items never block the caller or change `effectiveAction`.
- A seeded run stream with a known precision gives the same estimate at any audit rate, within its interval.

Refs: `.claude/skills/bandwise-builder/references/effectiveness-loop.md#4-labeling-policy-phase-3`, `.claude/skills/bandwise-builder/references/architecture.md#ports`, `.claude/skills/bandwise-builder/references/effectiveness-loop.md#tests-this-loop-needs`

#### P3-31 Build dataset screens with fixed splits and snapshots

Labels: `Console UI` | Estimate: 3 | State: Backlog | Blocked by: P3-03

People build and freeze datasets without ever seeing the test split.

Acceptance criteria:

- Create datasets, import JSONL, and browse drafting and calibration cases (never test) with each case's split shown.
- Take snapshots (`dataset_snapshots`).

Refs: `.claude/skills/bandwise-builder/references/effectiveness-loop.md#13-data-for-learning`, `.claude/skills/bandwise-builder/references/management-api.md#datasets-evals-and-jobs`

#### P3-32 Build eval runs on snapshots with calibration charts

Labels: `Console UI` `bandwise:models` | Estimate: 5 | State: Backlog | Blocked by: P3-03, P3-16

People see how a version and model perform on a fixed snapshot.

Acceptance criteria:

- Start `eval.run` on a `snapshotId` with an optional model.
- Show per-question and per-band metrics with Wilson lower bounds, the reliability table and calibration charts.
- Each eval run records its model and snapshot.

Refs: `.claude/skills/bandwise-builder/references/testing.md#evals-packagesevals`, `.claude/skills/bandwise-builder/references/confidence-policy.md#calibration-targets-evals`

#### P3-33 Build the Definition Studio operations and server holdout rules

Labels: `Platform / Tenancy` `bandwise:headless` `Security` | Estimate: 8 | State: Backlog | Blocked by: P3-03, P1-10

Studio sessions work the same for people and agents, with holdout enforced by the server.

Acceptance criteria:

- `studio_sessions` and the `studio.*` operations: list, create, get, add_examples, draft_definition, decompose, calibrate, request_labels and promote.
- Drafting and decomposing call `llm-client` with the drafting split only.
- Calibration is aggregate by default, and `includeCases: true` burns those cases. The test split is never returned. Promotion returns pass or fail and aggregate metrics.
- `studio.request_labels` creates label items with reason `studio`. Any member with `sets:write` can resume a session.

Refs: `.claude/skills/bandwise-builder/references/definition-studio.md#headless-studio-and-holdout-rules`, `.claude/skills/bandwise-builder/references/management-api.md#definition-studio`

Note: Split by lane from the phase-3.md Definition Studio item (P3-33, P3-34).

#### P3-34 Build the Definition Studio wizard

Labels: `Console UI` | Estimate: 5 | State: Backlog | Blocked by: P3-33

People turn a fuzzy question into narrow checks tested against their own judgment.

Acceptance criteria:

- The six wizard steps run on the `studio.*` operations: capture intent (with the 10-second fit test), draft a definition, decompose into checks, combine, calibrate and promote.
- Playwright covers the Studio happy path.

Refs: `.claude/skills/bandwise-builder/references/definition-studio.md#wizard-steps`, `.claude/skills/bandwise-builder/references/definition-studio.md#fit-test-first-the-10-second-rule`, `.claude/skills/bandwise-builder/references/testing.md#playwright`

Note: Split by lane from the phase-3.md Definition Studio item (P3-33, P3-34).

#### P3-35 Build the gate evaluator with Wilson lower bounds

Labels: `Quality / Learning` | Estimate: 5 | State: Backlog | Blocked by: P0-10

Rollout and publish gates use lower bounds, never point estimates.

Acceptance criteria:

- Pure gate logic in `packages/core/src/learning` covers each move in confidence-policy.md and compares the 95 percent Wilson lower bound (Kish effective sample size for weighted audit rows) with the goal's `QualityTarget`.
- Below `minLabeledHigh` a gate returns `insufficient_data`, never pass.
- The same-snapshot regression gate uses `gate_margins.coverageDrop` and `gate_margins.reviewLoadRise` (defaults 0.02 and 0.10).
- Precision counts only the truth rows defined in effectiveness-loop.md section 2. Results are `GateResult` items.

Refs: `.claude/skills/bandwise-builder/references/effectiveness-loop.md#5-quality-targets-and-gates-phase-3`, `.claude/skills/bandwise-builder/references/effectiveness-loop.md#2-definitions`, `.claude/skills/bandwise-builder/references/confidence-policy.md#default-gates-production-channel-editable-per-set-stricter-for-high-risk-sets`, `.claude/skills/bandwise-builder/references/testing.md#evals-packagesevals`

#### P3-36 Run the hourly gate evaluator and auto-demote job

Labels: `Quality / Learning` | Estimate: 5 | State: Backlog | Blocked by: P3-35, P3-02

Live sets that stop meeting their target step down on their own.

Acceptance criteria:

- Hourly, per production channel. Emits `rollout.gate_met` when the next stage's gates are met.
- Auto-demote moves `full` to `controlled` and `controlled` to `shadow` through `rollout.change` as the system actor, and never sets `paused`. Triggers: the precision lower bound below target over 7 days, band-mix PSI above 0.2 against the baseline, or a resolved model change.
- Emits `rollout.auto_demoted` and `alert.raised` (`precision_below_target`, `band_drift`).
- An injected precision drop demotes a `full` set to `controlled`.

Refs: `.claude/skills/bandwise-builder/references/confidence-policy.md#auto-demote`, `.claude/skills/bandwise-builder/references/effectiveness-loop.md#15-jobs`

#### P3-37 Warn when a live set has no truth source

Labels: `Quality / Learning` | Estimate: 2 | State: Backlog | Blocked by: P3-36, P3-21, P3-30

A set with nothing to measure against never looks healthy by accident.

Acceptance criteria:

- A set with no app feedback and no audit sample shows the warning on `rollout.get` and in the console.
- It raises `alert.raised` with kind `no_truth_source`, and its precision-based auto-demote is marked inactive.

Refs: `.claude/skills/bandwise-builder/references/effectiveness-loop.md#5-quality-targets-and-gates-phase-3`, `.claude/skills/bandwise-builder/references/confidence-policy.md#auto-demote`

#### P3-38 Build the platform admin Models page

Labels: `Console UI` `bandwise:models` | Estimate: 3 | State: Backlog | Blocked by: P3-04, P1-20

The platform admin reviews new models before any org can publish on them.

Acceptance criteria:

- Review unreviewed models and set status, limits, question types, weaknesses, `supersedes` and `retireAt` through `platform_model.update`.
- Every write is audited.

Refs: `.claude/skills/bandwise-builder/references/system-one-models.md#5-lifecycle`, `.claude/skills/bandwise-builder/references/system-one-models.md#12-recipe-add-a-new-system-one-model`

#### P3-39 Build the org model list

Labels: `Console UI` `bandwise:models` | Estimate: 2 | State: Backlog | Blocked by: P3-04

Org members see which models they can use and how each behaves.

Acceptance criteria:

- `model.list` shows each reachable model with status, pinned or moving, limits and the default.
- The registry sync, alias probe and contract watch jobs already run from Phase 1 (P1-20).

Refs: `.claude/skills/bandwise-builder/references/system-one-models.md#14-default-model`, `.claude/skills/bandwise-builder/references/management-api.md#models`

#### P3-40 Enforce model lints at publish

Labels: `Platform / Tenancy` `bandwise:models` | Estimate: 2 | State: Backlog | Blocked by: P3-02, P1-06

No set reaches a channel on a model that is not ready for it.

Acceptance criteria:

- `set.publish` and `channel.promote` pass a `PublishCtx` with `reachableModels` and `allowPreviewModels`, so every model lint always runs at publish.
- A set cannot be published on an unreviewed model.

Refs: `.claude/skills/bandwise-builder/references/architecture.md#lints-packagescoresrclints`, `.claude/skills/bandwise-builder/references/system-one-models.md#7-limits-as-data`

#### P3-41 Build savings and usage dashboards for org, project and set

Labels: `Console UI` | Estimate: 5 | State: Backlog | Blocked by: P3-04, P2-25

Admins see what System One cost and saved.

Acceptance criteria:

- From `usage.get`: runs, System One spend and savings by kind, labeled as estimates with their assumptions shown.
- Would-be savings from suppressed runs show apart.

Refs: `.claude/skills/bandwise-builder/references/savings-model.md#rollups-usage_daily`, `.claude/skills/bandwise-builder/references/savings-model.md#honesty-rules`

#### P3-42 Build the standard reports with CSV export and monthly PDF

Labels: `Billing` | Estimate: 5 | State: Backlog | Blocked by: P3-04, P2-25

Every standard report is available in the console, as CSV, as PDF and headless.

Acceptance criteria:

- `usage-and-cost`, `savings-and-roi`, `band-distribution`, `review-queue`, `human-agreement`, `model-upgrades` and `rate-headroom` through `report.get` with csv and pdf. `effectiveness` follows once set health lands (P3b-06).
- The portfolio view loops over each org with that org's own tenant context. The platform admin sees the reports across orgs.

Refs: `.claude/skills/bandwise-builder/references/savings-model.md#standard-admin-reports`

#### P3-43 Add the model upgrades report and alias-moved and deprecation alerts

Labels: `Billing` `bandwise:models` | Estimate: 3 | State: Backlog | Blocked by: P3-42, P1-20

Admins learn when a model moves or retires.

Acceptance criteria:

- Alias-moved (`model.alias_moved`) and deprecation alerts show in the console and go out by email.
- The `model-upgrades` report lists pinned sets behind the latest stable model and alias sets whose resolved model changed. Eval deltas arrive in Phase 3b (P3b-21).

Refs: `.claude/skills/bandwise-builder/references/savings-model.md#standard-admin-reports`, `.claude/skills/bandwise-builder/references/system-one-models.md#6-detection`

#### P3-44 Build the audit log viewer with filters and CSV export

Labels: `Console UI` `Security` | Estimate: 2 | State: Backlog | Blocked by: P3-04

Admins answer who changed what, through which client, and who approved it.

Acceptance criteria:

- `audit.list` filters by action, user, token and date range, with CSV export. A CSV export is itself audited.
- Rows show actor type, client, approval id and the impersonator when present.

Refs: `.claude/skills/bandwise-builder/references/security.md#audit`, `.claude/skills/bandwise-builder/references/management-api.md#reports-audit-and-events`

#### P3-45 Pass the Phase 3 exit gate

Labels: `QA / Evals` `bandwise:headless` `Security` | Estimate: 5 | State: Backlog | Blocked by: P3-05, P3-06, P3-07, P3-09, P3-10, P3-11, P3-12, P3-13, P3-15, P3-17, P3-18, P3-19, P3-23, P3-24, P3-25, P3-26, P3-27, P3-28, P3-29, P3-31, P3-34, P3-37, P3-38, P3-39, P3-40, P3-41, P3-43, P3-44

Confirm Phase 3 is done. Phases 3b, 4 and 4b then run in parallel.

Acceptance criteria:

- Playwright: create a set, publish, set the production rollout to `shadow`, call it through the API, publish v2, the API serves v2 within 30 seconds with no redeploy, roll back, and the API serves v1.
- With production at `controlled`, medium and low band answers on gating decisions create review items of kind `action`, and resolving one can add a dataset case.
- Headless gate: an agent with only an agent token, using only the CLI or MCP, creates a set from a template, edits and validates the draft (fixing JSON lint errors), runs an eval, publishes to staging, promotes to production, sets the production rollout to shadow, resolves review items and reads the savings report. With the set marked protected, it requests a production publish of v2, which stays pending until a person approves it in the console, and rolls back through the API.
- Replaying a publish with the same `Idempotency-Key` creates no new version.
- A viewer cannot mutate anything. An agent token without a scope gets `403 insufficient_scope` in its own org and `404` across orgs.
- Every mutation writes an audit row with actor type, client and approval id.
- An injected precision drop auto-demotes a `full` set to `controlled`.
- A set cannot be published on an unreviewed model.

Refs: `.claude/skills/bandwise-builder/references/phases/phase-3.md#exit-gate`, `.claude/skills/bandwise-builder/references/headless-and-agents.md#a-manage-from-template-to-production-with-approval-phase-3`

### Bandwise P3b: Effectiveness loop

Policy replay and threshold suggestions, set health, proposals, champion/challenger, model upgrades, Studio improve mode and quality-adjusted value.

Lead role: Quality / Learning. Depends on: Bandwise P3: Console and management API. Starts when Phase 3 lands. Runs in parallel with P4 and P4b. Checklist: `.claude/skills/bandwise-builder/references/phases/phase-3b.md`. 31 issues, 102 points.

#### P3b-01 Build policy replay in packages/core/src/learning

Labels: `Quality / Learning` | Estimate: 5 | State: Backlog | Blocked by: P1-03

Candidate policies are scored on stored answers at no System One cost.

Acceptance criteria:

- Re-routes stored answers under a candidate policy with zero System One calls (the transport's call count stays 0).
- On fixtures, replay under a policy matches a live run with that policy.
- Replay reads the stored `checks` and never re-runs them, so a purged run replays the same relevance as long as no condition reads `input`.

Refs: `.claude/skills/bandwise-builder/references/effectiveness-loop.md#6-policy-replay-and-the-threshold-suggester-phase-3b`, `.claude/skills/bandwise-builder/references/testing.md#policy-replay-tests`

#### P3b-02 Build suggestThresholds returning ThresholdProposal

Labels: `Quality / Learning` | Estimate: 5 | State: Backlog | Blocked by: P3b-01, P3-35

Thresholds are suggested from labels, with the target as a hard floor.

Acceptance criteria:

- Picks the loosest threshold whose Wilson lower bound meets `highPrecision` or `mediumPrecision`, and never proposes one that misses it.
- Returns `insufficientData` below the label minimum, with `proposed` equal to `current`.
- Covers choice and score thresholds, `perOption` overrides with enough labels, and noul `trueAt`, `falseAt` and `reviewMargin`. Leaves composite `levelThresholds` alone.
- Reads only counted truth rows and the drafting and calibration splits, never the test split.

Refs: `.claude/skills/bandwise-builder/references/effectiveness-loop.md#6-policy-replay-and-the-threshold-suggester-phase-3b`, `.claude/skills/bandwise-builder/references/testing.md#policy-replay-tests`

Note: Split by lane from the phase-3b.md threshold suggester item (P3b-02 to P3b-05): Quality / Learning writes the logic, Platform the operation, Console UI the editor action, Integrations the CLI and MCP surface.

#### P3b-03 Add the policy.suggest operation as a job

Labels: `Platform / Tenancy` `bandwise:headless` | Estimate: 3 | State: Backlog | Blocked by: P3b-02, P3-16

Anyone can request threshold suggestions through the API.

Acceptance criteria:

- `POST /api/v1/sets/{ref}/policy-suggestions` returns `202 { jobId }` and replays with zero System One calls.
- With `apply: true` it writes the suggested thresholds to the draft through `draft.update`, needs `sets:write` and `If-Match`, and fails with `412` if the draft changed.

Refs: `.claude/skills/bandwise-builder/references/management-api.md#health-tuning-and-proposals-phase-3b`

Note: Split by lane from the phase-3b.md threshold suggester item (P3b-02 to P3b-05): Quality / Learning writes the logic, Platform the operation, Console UI the editor action, Integrations the CLI and MCP surface.

#### P3b-04 Add "Suggest from labels" to the policy editor

Labels: `Console UI` | Estimate: 2 | State: Backlog | Blocked by: P3b-03, P3-11

People tune thresholds from their own labels in the editor.

Acceptance criteria:

- Shows the curve with precision, lower bound, coverage and net value per candidate threshold.
- Applying writes the draft only.

Refs: `.claude/skills/bandwise-builder/references/effectiveness-loop.md#6-policy-replay-and-the-threshold-suggester-phase-3b`

Note: Split by lane from the phase-3b.md threshold suggester item (P3b-02 to P3b-05): Quality / Learning writes the logic, Platform the operation, Console UI the editor action, Integrations the CLI and MCP surface.

#### P3b-05 Add MCP suggest_thresholds and bandwise tune

Labels: `Integrations` `bandwise:headless` | Estimate: 2 | State: Backlog | Blocked by: P3b-03, P3-23, P3-25

Agents tune thresholds headlessly.

Acceptance criteria:

- `bandwise tune <slug> [--apply]` and MCP `suggest_thresholds` (with `apply`) map to `policy.suggest`.
- `--apply` sends `If-Match` from `.bandwise/specs.json` or `draft.get`. The parity test covers both.

Refs: `.claude/skills/bandwise-builder/references/headless-and-agents.md#effectiveness-loop`, `.claude/skills/bandwise-builder/references/headless-and-agents.md#mcp-server`

Note: Split by lane from the phase-3b.md threshold suggester item (P3b-02 to P3b-05): Quality / Learning writes the logic, Platform the operation, Console UI the editor action, Integrations the CLI and MCP surface.

#### P3b-06 Build the question_daily rollup and SetHealth

Labels: `Quality / Learning` | Estimate: 5 | State: Backlog | Blocked by: P3-35, P3-30

Each set, version and question reports its health against its target.

Acceptance criteria:

- A nightly `question_daily` rollup feeds `SetHealth` per set, version and question.
- Status order `no_truth_source`, `drifting`, `insufficient_data`, `below_target`, `ok`, against a baseline of the first 14 days after the last promotion. There is no single score.
- A hash-only set says plainly that review shows no content and replay is unavailable.

Refs: `.claude/skills/bandwise-builder/references/effectiveness-loop.md#7-set-health-phase-3b`, `.claude/skills/bandwise-builder/references/data-model.md#rollups`

#### P3b-07 Add the health.get and health.list operations

Labels: `Platform / Tenancy` `bandwise:headless` | Estimate: 2 | State: Backlog | Blocked by: P3b-06

Set health is readable through the API.

Acceptance criteria:

- `GET /api/v1/sets/{ref}/health` and `GET /api/v1/health` (worst first by status order, then by review load), scope `reports:read`.

Refs: `.claude/skills/bandwise-builder/references/management-api.md#health-tuning-and-proposals-phase-3b`

#### P3b-08 Build the Health tab and the org "Needs attention" list

Labels: `Console UI` | Estimate: 3 | State: Backlog | Blocked by: P3b-07

People see which sets need attention first.

Acceptance criteria:

- The set page has a Health tab with per-question metrics and flags.
- The org "Needs attention" list shows sets worst first.

Refs: `.claude/skills/bandwise-builder/references/effectiveness-loop.md#7-set-health-phase-3b`

#### P3b-09 Add MCP get_set_health and bandwise health

Labels: `Integrations` `bandwise:headless` | Estimate: 1 | State: Backlog | Blocked by: P3b-07, P3-23, P3-25

Agents read set health headlessly.

Acceptance criteria:

- `bandwise health [<slug>]` and MCP `get_set_health` map to `health.get` and `health.list`.

Refs: `.claude/skills/bandwise-builder/references/headless-and-agents.md#effectiveness-loop`, `.claude/skills/bandwise-builder/references/headless-and-agents.md#mcp-server`

#### P3b-10 Add the proposals table and proposal operations

Labels: `Platform / Tenancy` `bandwise:headless` | Estimate: 3 | State: Backlog | Blocked by: P3-01

Recommendations and improvements share one queue that people and agents work.

Acceptance criteria:

- `proposals` holds the eight kinds with `evidence`, `metrics_delta`, `rationale` and `draft_version_id`. One open proposal per set, kind and decision. Open proposals expire after 30 days or when the evidence no longer applies.
- `proposal.list`, `proposal.accept` (applies the patch through `draft.update` with `If-Match`; `label_more` and `demote` return the operation to call) and `proposal.reject`.
- Each new proposal emits `proposal.created`.

Refs: `.claude/skills/bandwise-builder/references/effectiveness-loop.md#8-proposals-phase-3b`, `.claude/skills/bandwise-builder/references/management-api.md#health-tuning-and-proposals-phase-3b`

#### P3b-11 Build the weekly threshold-refit job and health-rule proposals

Labels: `Quality / Learning` | Estimate: 3 | State: Backlog | Blocked by: P3b-02, P3b-06, P3b-10

The loop suggests improvements on its own schedule.

Acceptance criteria:

- Weekly `tune_thresholds` proposals when coverage can rise at the same guaranteed precision or precision is below target.
- Nightly health rules open `label_more`, `demote`, `add_none_option` and stability proposals per effectiveness-loop.md sections 8 and 12.

Refs: `.claude/skills/bandwise-builder/references/effectiveness-loop.md#15-jobs`, `.claude/skills/bandwise-builder/references/effectiveness-loop.md#8-proposals-phase-3b`, `.claude/skills/bandwise-builder/references/effectiveness-loop.md#12-stability-phase-3b`

#### P3b-12 Build the proposals inbox

Labels: `Console UI` | Estimate: 3 | State: Backlog | Blocked by: P3b-10

People review and accept proposals in one place.

Acceptance criteria:

- Lists proposals with evidence, metric deltas and rationale.
- Accepting creates a draft only. Nothing publishes on its own.

Refs: `.claude/skills/bandwise-builder/references/effectiveness-loop.md#8-proposals-phase-3b`

#### P3b-13 Add MCP proposal tools, update_set and bandwise proposals

Labels: `Integrations` `bandwise:headless` | Estimate: 2 | State: Backlog | Blocked by: P3b-10, P3-23, P3-25

Agents work the proposal queue headlessly.

Acceptance criteria:

- `bandwise proposals list|accept|reject` and MCP `list_proposals` and `decide_proposal` map to the proposal operations.
- MCP `update_set` maps to `set.update`, so an agent can act on an accepted `label_more` proposal.

Refs: `.claude/skills/bandwise-builder/references/headless-and-agents.md#effectiveness-loop`, `.claude/skills/bandwise-builder/references/headless-and-agents.md#mcp-server`, `.claude/skills/bandwise-builder/references/headless-and-agents.md#c-improve-a-live-set-phase-3b`

#### P3b-14 Add the experiments table and experiment operations

Labels: `Platform / Tenancy` `bandwise:headless` `Security` | Estimate: 5 | State: Backlog | Blocked by: P3-02

Champion and challenger comparisons are first-class records.

Acceptance criteria:

- `experiments` (kind `version`, `model` or `policy`), `release_pointers.active_experiment_id`, and `runs.experiment_id` and `arm`. At most one experiment per set and channel.
- `experiment.start` (`samplePct` from 0 to 1, default 0.1; above 0.25 it is high risk for agents), `experiment.get`, `experiment.promote` (high; moves the pointer, writes `experiment_promote`, emits `release.promoted` and `experiment.decided`) and `experiment.stop` (toward safety, callable by the system actor).

Refs: `.claude/skills/bandwise-builder/references/management-api.md#experiments-phase-3b`, `.claude/skills/bandwise-builder/references/effectiveness-loop.md#9-experiments-phase-3b`

#### P3b-15 Dual-run the challenger on a sample after the champion responds

Labels: `Platform / Tenancy` | Estimate: 5 | State: Backlog | Blocked by: P3b-14

Challengers are tested on real traffic without touching the caller.

Acceptance criteria:

- After the champion's result returns, the console run service calls `sampleChallenger` from `core/learning` and runs the challenger off the latency path.
- The challenger run has `arm` challenger, books experiment cost and no savings, dispatches no actions, creates no action review items and never changes `effectiveAction`.
- Disagreements create label items with reason `challenger_diff`. Policy experiments replay instead of dual-running.

Refs: `.claude/skills/bandwise-builder/references/architecture.md#run-data-flow`, `.claude/skills/bandwise-builder/references/effectiveness-loop.md#9-experiments-phase-3b`

#### P3b-16 Start an experiment on production publish of controlled or full sets

Labels: `Platform / Tenancy` `bandwise:headless` `Security` | Estimate: 3 | State: Backlog | Blocked by: P3b-14

New versions of live sets prove themselves before they take over.

Acceptance criteria:

- For `set.publish` and `channel.promote` to production at `controlled` or `full` without `skipExperiment`, the pointer stays on the champion, the new version becomes the challenger, and the response includes `experimentId`.
- `skipExperiment` needs the admin role and is always gated for agents.

Refs: `.claude/skills/bandwise-builder/references/management-api.md#versions-and-releases`, `.claude/skills/bandwise-builder/references/architecture.md#managed-live`, `.claude/skills/bandwise-builder/references/management-api.md#tests-this-surface-needs`

#### P3b-17 Build the experiment scorer job and the promotion rule

Labels: `Quality / Learning` | Estimate: 5 | State: Backlog | Blocked by: P3b-14, P3b-01, P3-35

Experiments end with a clear, safe result.

Acceptance criteria:

- Runs hourly while an experiment runs and decides nothing before `min_runs` and `min_labeled`.
- Stops the experiment (as the system actor) when the challenger cannot win or after 30 days, and emits `experiment.decided`.
- Promotion rule on the same labeled runs: the challenger's high-band lower bound is at least the champion's, and its coverage drops by no more than `gate_margins.coverageDrop`. Net value is shown and never overrides them.

Refs: `.claude/skills/bandwise-builder/references/effectiveness-loop.md#9-experiments-phase-3b`, `.claude/skills/bandwise-builder/references/effectiveness-loop.md#15-jobs`

#### P3b-18 Add MCP experiment tools and bandwise experiments commands

Labels: `Integrations` `bandwise:headless` | Estimate: 2 | State: Backlog | Blocked by: P3b-14, P3-23, P3-25

Agents run experiments headlessly, with approval for promotion.

Acceptance criteria:

- `bandwise experiments start|get|promote|stop` and MCP `start_experiment`, `get_experiment` and `decide_experiment` map to the experiment operations.
- Promotion by an agent returns a pending approval (exit 3).

Refs: `.claude/skills/bandwise-builder/references/headless-and-agents.md#effectiveness-loop`, `.claude/skills/bandwise-builder/references/headless-and-agents.md#mcp-server`

#### P3b-19 Add the set.try_model operation as a job

Labels: `Platform / Tenancy` `bandwise:models` `bandwise:headless` | Estimate: 5 | State: Backlog | Blocked by: P3b-02, P3b-10, P3-03, P3-16

Any set can be tried on a new model with evidence before anyone switches.

Acceptance criteria:

- `POST /api/v1/sets/{ref}/try-model` builds a candidate spec (production with only the model changed), evals both on the same snapshot, re-tunes thresholds on the candidate's answers, and opens a `model_upgrade` proposal.
- It never writes the set's draft. Only `proposal.accept` does.
- It supports `?dryRun=true` and uses the eval limiter bucket.

Refs: `.claude/skills/bandwise-builder/references/management-api.md#models`, `.claude/skills/bandwise-builder/references/effectiveness-loop.md#10-new-system-one-models-phase-3b`, `.claude/skills/bandwise-builder/references/system-one-models.md#11-new-model-upgrade-flow`

Note: effectiveness-loop.md section 10 still says try-model clones production into a draft. management-api.md (it never writes the draft) wins; that wording fix is pending.

#### P3b-20 Build the model-upgrade candidates job

Labels: `Quality / Learning` `bandwise:models` | Estimate: 3 | State: Backlog | Blocked by: P1-20, P3-43

Every set that could move to a new model is listed when that model is ready.

Acceptance criteria:

- Runs when a model becomes `stable` (or `preview` for orgs that allow preview models). It spends nothing.
- A live set is a candidate when it is pinned to an older model in the same family or to a model in the new model's `supersedes`, and the new model's `questionTypes` cover the set's question types. Candidates found only through `supersedes` are marked cross-family.

Refs: `.claude/skills/bandwise-builder/references/system-one-models.md#6-detection`, `.claude/skills/bandwise-builder/references/effectiveness-loop.md#10-new-system-one-models-phase-3b`

#### P3b-21 Add eval deltas to model.upgrades and the model-upgrades report

Labels: `Billing` `bandwise:models` | Estimate: 2 | State: Backlog | Blocked by: P3b-20, P3b-19

Admins compare upgrade options with evidence.

Acceptance criteria:

- `model.upgrades` (`GET /api/v1/model-upgrades`) and the `model-upgrades` report show eval and experiment deltas per pinned set and the cross-family marker.
- Sets still pinned to a deprecated model are listed.

Refs: `.claude/skills/bandwise-builder/references/savings-model.md#standard-admin-reports`, `.claude/skills/bandwise-builder/references/management-api.md#models`

Note: Split by lane from the phase-3b.md item for the Model upgrades page and report (P3b-21, P3b-22).

#### P3b-22 Build the Model upgrades page

Labels: `Console UI` `bandwise:models` | Estimate: 3 | State: Backlog | Blocked by: P3b-21

People act on model upgrades from one page.

Acceptance criteria:

- Lists candidate sets per new model with eval deltas, and starts try-model from each row.

Refs: `.claude/skills/bandwise-builder/references/system-one-models.md#11-new-model-upgrade-flow`

Note: Split by lane from the phase-3b.md item for the Model upgrades page and report (P3b-21, P3b-22).

#### P3b-23 Add MCP try_model and bandwise upgrade list and try

Labels: `Integrations` `bandwise:models` `bandwise:headless` | Estimate: 2 | State: Backlog | Blocked by: P3b-19, P3b-21, P3-23, P3-25

Agents run model upgrades headlessly.

Acceptance criteria:

- `bandwise upgrade list` maps to `model.upgrades`, `bandwise upgrade try <slug> --model <id>` and MCP `try_model` map to `set.try_model`.

Refs: `.claude/skills/bandwise-builder/references/headless-and-agents.md#effectiveness-loop`, `.claude/skills/bandwise-builder/references/headless-and-agents.md#d-a-new-system-one-model-phase-3b`

#### P3b-24 Build the set.improve job with typed edits and holdout rules

Labels: `Quality / Learning` `bandwise:headless` | Estimate: 8 | State: Backlog | Blocked by: P3-33, P3b-10, P1-10

Published sets get better wording without leaking the test split.

Acceptance criteria:

- Opens a Studio session on a published set. Claude, through `llm-client`, proposes `ImproveEdit` items from the drafting split only.
- Each candidate is scored on the calibration split under the session cost cap and the eval bucket. Only the best is confirmed once on the test split, with aggregate metrics only.
- The output is a proposal (`question_fix`, `add_none_option`, `split_question` or `narrow_state`) with a draft diff and metric deltas. Accepting writes the draft. Nothing publishes.

Refs: `.claude/skills/bandwise-builder/references/effectiveness-loop.md#11-improve-mode-phase-3b`, `.claude/skills/bandwise-builder/references/definition-studio.md#improve-mode`, `.claude/skills/bandwise-builder/references/management-api.md#definition-studio`

Note: Split by lane from the phase-3b.md improve mode item (P3b-24 to P3b-26).

#### P3b-25 Build the Studio improve screen

Labels: `Console UI` | Estimate: 3 | State: Backlog | Blocked by: P3b-24, P3-34

People run improve mode from the Studio.

Acceptance criteria:

- Shows disagreements per question, candidate edits with calibration scores, and the resulting proposal with its diff and deltas.

Refs: `.claude/skills/bandwise-builder/references/effectiveness-loop.md#11-improve-mode-phase-3b`

Note: Split by lane from the phase-3b.md improve mode item (P3b-24 to P3b-26).

#### P3b-26 Add bandwise improve and MCP improve_set

Labels: `Integrations` `bandwise:headless` | Estimate: 1 | State: Backlog | Blocked by: P3b-24, P3-23, P3-25

Agents start improve mode headlessly.

Acceptance criteria:

- `bandwise improve <slug> [--wait]` and MCP `improve_set` map to `set.improve`.

Refs: `.claude/skills/bandwise-builder/references/headless-and-agents.md#effectiveness-loop`, `.claude/skills/bandwise-builder/references/headless-and-agents.md#mcp-server`

Note: Split by lane from the phase-3b.md improve mode item (P3b-24 to P3b-26).

#### P3b-27 Add eval repeats and a per-question stability metric

Labels: `QA / Evals` | Estimate: 3 | State: Backlog | Blocked by: P1-24, P3-03

Evals measure how stable each question's answer is.

Acceptance criteria:

- `--repeats <k>` and `eval.run` `repeats` are off by default. When on, k = 3 on a 10 percent sample of cases within the eval cost cap.
- Each repeat adds a throwaway `uid` field after validation, outside `input.schema`.
- Stability is the share of repeated cases whose value and band stay the same. Eval metrics record it and set health shows it.

Refs: `.claude/skills/bandwise-builder/references/effectiveness-loop.md#12-stability-phase-3b`, `.claude/skills/bandwise-builder/references/testing.md#evals-packagesevals`

#### P3b-28 Copy labeled and feedback runs into dataset_cases before purge

Labels: `Platform / Tenancy` `Security` `bandwise:tenancy` | Estimate: 3 | State: Backlog | Blocked by: P3-03, P2-15

Labels outlive the state they were made on.

Acceptance criteria:

- The nightly retention job copies runs picked for labeling or with feedback into `dataset_cases` (`source = 'production'`), redacted per `pii_mode`, with answers, `version_id` and `model_resolved`, before state is purged.
- Dataset cases follow `dataset_retention_days`.

Refs: `.claude/skills/bandwise-builder/references/effectiveness-loop.md#13-data-for-learning`, `.claude/skills/bandwise-builder/references/security.md#pii-and-data-handling`

#### P3b-29 Add the dataset.features endpoint for drafting and calibration

Labels: `Platform / Tenancy` `Security` | Estimate: 2 | State: Backlog | Blocked by: P3-03

Analysts and agents get features without the test split.

Acceptance criteria:

- `GET /api/v1/datasets/{id}/features?version=N` returns per-question probabilities, noul values and normalized scores joined with labels, for the drafting and calibration splits only.
- A test proves no test-split case is returned.

Refs: `.claude/skills/bandwise-builder/references/management-api.md#datasets-evals-and-jobs`, `.claude/skills/bandwise-builder/references/management-api.md#holdout-rules-at-the-api`

#### P3b-30 Compute quality-adjusted value in rollups, health and ROI

Labels: `Billing` | Estimate: 3 | State: Backlog | Blocked by: P3b-06, P3-42

Savings account for wrong auto decisions and review cost.

Acceptance criteria:

- Quality-adjusted value follows the formula and per-set `value_settings` in savings-model.md.
- It shows next to gross savings in the `savings-and-roi` report and in set health. Quality / Learning supplies the precision inputs.

Refs: `.claude/skills/bandwise-builder/references/savings-model.md#quality-adjusted-value`, `.claude/skills/bandwise-builder/references/effectiveness-loop.md#14-quality-adjusted-value`

#### P3b-31 Pass the Phase 3b exit gate

Labels: `QA / Evals` `bandwise:headless` | Estimate: 5 | State: Backlog | Blocked by: P3b-04, P3b-05, P3b-08, P3b-09, P3b-11, P3b-12, P3b-13, P3b-15, P3b-16, P3b-17, P3b-18, P3b-22, P3b-23, P3b-25, P3b-26, P3b-27, P3b-28, P3b-29, P3b-30

Confirm the effectiveness loop works end to end.

Acceptance criteria:

- On a seeded set with 500 labeled fixture runs, an agent using only MCP tools gets a threshold suggestion, applies it to a draft, runs a challenger, and promotes it after admin approval.
- Registering a new stable model lists every pinned candidate set on the Model upgrades page, and try-model produces an eval comparison and a proposal.
- Injected drift triggers auto-demote and an alert event.
- No endpoint returns a test-split case.

Refs: `.claude/skills/bandwise-builder/references/phases/phase-3b.md#exit-gate`

### Bandwise P4: Embed kit

@bandwise/client (edge-safe, typed run, feedback), @bandwise/react, integration recipes and the example app.

Lead role: Embed Kit. Depends on: Bandwise P3: Console and management API. Can start during Phase 3 against the MSW mocks (P3-26); the exit gate needs the real Phase 3 API. Runs in parallel with P3b and P4b. Checklist: `.claude/skills/bandwise-builder/references/phases/phase-4.md`. 10 issues, 32 points.

#### P4-01 Build @bandwise/client with run, run&lt;T&gt;, reportFeedback and route helpers

Labels: `Embed Kit` `bandwise:headless` | Estimate: 5 | State: Backlog | Blocked by: P3-26

Host apps call Bandwise from their servers with one small client.

Acceptance criteria:

- `createClient({ baseUrl, token }).run(setRef, state)`, a generic `run<T>()` for generated clients, and `reportFeedback()`.
- `Idempotency-Key` support, the optional `Bandwise-Interface` header and `requestId` exposure.
- `createRunRoute()` for Next.js and an Express handler.

Refs: `.claude/skills/bandwise-builder/references/phases/phase-4.md`, `.claude/skills/bandwise-builder/references/deploy-and-codegen.md#10-integration-recipes-phase-4`, `.claude/skills/bandwise-builder/references/api.md#endpoints-run-surface`

#### P4-02 Keep @bandwise/client fetch-only and test it in the edge runtime

Labels: `Embed Kit` | Estimate: 2 | State: Backlog | Blocked by: P4-01

The client runs on Node, Vercel Edge, Cloudflare Workers and Deno.

Acceptance criteria:

- No Node built-ins.
- CI runs the client tests under `@edge-runtime/vm`.

Refs: `.claude/skills/bandwise-builder/references/phases/phase-4.md`

#### P4-03 Handle 429 with Retry-After in a single retry layer

Labels: `Embed Kit` | Estimate: 2 | State: Backlog | Blocked by: P4-01

Rate limits slow callers down without retry storms.

Acceptance criteria:

- Bounded retries honor `Retry-After`, in one retry layer only.
- A retried run reuses its `Idempotency-Key`.

Refs: `.claude/skills/bandwise-builder/references/phases/phase-4.md`, `.claude/skills/bandwise-builder/references/management-api.md#idempotency-keys`

#### P4-04 Mint browser tokens through POST /api/v1/tokens/browser

Labels: `Embed Kit` `Security` | Estimate: 2 | State: Backlog | Blocked by: P4-01, P2-13

Browsers run sets with short-lived tokens.

Acceptance criteria:

- A server helper mints an ES256 JWT bound to origin and set list.
- The browser never sees an `sk_` token.

Refs: `.claude/skills/bandwise-builder/references/security.md#app-tokens`, `.claude/skills/bandwise-builder/references/architecture.md#embed-kit`

#### P4-05 Support publishable pk_ mode

Labels: `Embed Kit` `Security` | Estimate: 2 | State: Backlog | Blocked by: P4-01

Simple browser embeds work with a publishable token.

Acceptance criteria:

- `pk_live_` tokens are run-only with an origin allowlist.
- `ReviewQueue` and `SavingsCard` refuse Mode B.

Refs: `.claude/skills/bandwise-builder/references/architecture.md#embed-kit`, `.claude/skills/bandwise-builder/references/security.md#app-tokens`

#### P4-06 Build @bandwise/react components and headless hooks

Labels: `Embed Kit` | Estimate: 8 | State: Backlog | Blocked by: P4-01

Apps show System One decisions with ready-made, accessible components.

Acceptance criteria:

- `QuestionSetRunner`, `ConfidenceBadge`, `ProbabilityBars`, `ScoreGauge`, `ReviewQueue` and `SavingsCard`, plus headless hooks. Renderers are picked by each question type module's `uiKind`.
- `ReviewQueue` and `SavingsCard` require Mode A, with `createReviewRoutes()` and `createUsageRoute()` server helpers.
- Never imports server code. Under 15 kB gzip. Renders every question type in the core registry and all three bands.

Refs: `.claude/skills/bandwise-builder/references/architecture.md#embed-kit`, `.claude/skills/bandwise-builder/references/phases/phase-4.md`

#### P4-07 Add theming through CSS variables with accessible defaults

Labels: `Embed Kit` | Estimate: 2 | State: Backlog | Blocked by: P4-06

Components match the host app's look and work for everyone.

Acceptance criteria:

- Every component is themeable through CSS variables.
- Defaults are accessible.

Refs: `.claude/skills/bandwise-builder/references/architecture.md#embed-kit`

#### P4-08 Build apps/example-embed using both modes

Labels: `Embed Kit` | Estimate: 3 | State: Backlog | Blocked by: P4-06, P4-04, P4-05

One example app proves both embed modes end to end.

Acceptance criteria:

- Mode A (server proxy with `sk_`) and Mode B (`pk_` or browser JWT) both work.
- The E2E suite passes in both modes on the fixture transport.

Refs: `.claude/skills/bandwise-builder/references/architecture.md#embed-kit`, `.claude/skills/bandwise-builder/references/testing.md#playwright`

#### P4-09 Write integration recipes for Next.js, Express, curl and httpx

Labels: `Docs` `bandwise:docs` | Estimate: 3 | State: Backlog | Blocked by: P4-01

Developers copy a working recipe for their stack.

Acceptance criteria:

- Next.js route handler, Express, plain HTTP (curl) and Python httpx recipes, each branching on `effectiveAction` and `route`.
- The `escalate_to_llm` branch acts on `r.decisions[id].escalation.value`. Feedback examples send no `source` field.
- The recipes match the shipped client.

Refs: `.claude/skills/bandwise-builder/references/deploy-and-codegen.md#10-integration-recipes-phase-4`, `.claude/skills/bandwise-builder/references/confidence-policy.md#escalation`, `.claude/skills/bandwise-builder/references/api.md#feedback`

Note: The escalation and feedback wording in deploy-and-codegen.md section 10 is a pending edit; follow confidence-policy.md and effectiveness-loop.md.

#### P4-10 Pass the Phase 4 exit gate

Labels: `QA / Evals` `Security` | Estimate: 3 | State: Backlog | Blocked by: P4-02, P4-03, P4-07, P4-08, P4-09

Confirm the embed kit is safe and small.

Acceptance criteria:

- `example-embed` E2E passes in both modes.
- The CI bundle scan finds no key patterns in client output.
- `@bandwise/react` is under 15 kB gzip.
- Components render every question type in the core registry and all three bands.
- Client tests pass in the edge runtime.
- Revoking a token blocks it within 60 seconds.

Refs: `.claude/skills/bandwise-builder/references/phases/phase-4.md#exit-gate`, `.claude/skills/bandwise-builder/references/testing.md#security-tests`

### Bandwise P4b: Integrate and deploy

Opportunities, TypeScript codegen, app bindings, bandwise init, codegen and check, and the interface-breaking guard. Python and the standalone export stay behind ADR-009.

Lead role: Integrations. Depends on: Bandwise P3: Console and management API. Starts when Phase 3 lands and runs in parallel with P3b and P4. The TypeScript target builds against the @bandwise/client types (P4-01) until that package lands. Checklist: `.claude/skills/bandwise-builder/references/phases/phase-4b.md`. 23 issues, 69 points.

#### P4b-01 Add app profile fields language, framework and repo_url

Labels: `Platform / Tenancy` | Estimate: 1 | State: Backlog | Blocked by: P2-05

Apps carry what codegen and opportunities need.

Acceptance criteria:

- `apps` gains `language`, `framework` and `repo_url`, editable through `app.update`.

Refs: `.claude/skills/bandwise-builder/references/data-model.md#apps-and-integration`, `.claude/skills/bandwise-builder/references/deploy-and-codegen.md#apps`

#### P4b-02 Add app_opportunities and the opportunity operations

Labels: `Platform / Tenancy` `bandwise:headless` | Estimate: 3 | State: Backlog | Blocked by: P4b-01, P0-10

Decision points in an app are recorded as opportunities.

Acceptance criteria:

- `opportunity.list`, `opportunity.create` and `opportunity.update` under `/apps/{id}/opportunities`, using the `Opportunity` contract.
- Opportunities hold summaries only, never source code.

Refs: `.claude/skills/bandwise-builder/references/deploy-and-codegen.md#opportunity-contract`, `.claude/skills/bandwise-builder/references/deploy-and-codegen.md#producers`, `.claude/skills/bandwise-builder/references/management-api.md#apps-and-integration`

#### P4b-03 Build the console "Describe your app" form

Labels: `Console UI` | Estimate: 3 | State: Backlog | Blocked by: P4b-02, P1-10

People get proposed decision points from a description of their app.

Acceptance criteria:

- `llm-client` drafts opportunities from a description and pasted snippets.
- Snippets are not stored.

Refs: `.claude/skills/bandwise-builder/references/deploy-and-codegen.md#producers`, `.claude/skills/bandwise-builder/references/phases/phase-4b.md#apps-and-opportunities`

#### P4b-04 Add MCP opportunity tools, create_app and bandwise opportunities

Labels: `Integrations` `bandwise:headless` | Estimate: 2 | State: Backlog | Blocked by: P4b-02, P3-23, P3-25

Agents record and act on opportunities headlessly.

Acceptance criteria:

- `bandwise opportunities add|list|accept|reject` map to the opportunity operations.
- MCP `add_opportunity`, `update_opportunity` and `create_app` map to their operations. Summaries only.

Refs: `.claude/skills/bandwise-builder/references/headless-and-agents.md#app-integration`, `.claude/skills/bandwise-builder/references/headless-and-agents.md#mcp-server`

#### P4b-05 Add the pattern enum and the pattern advisor to the drafting prompt

Labels: `Integrations` | Estimate: 2 | State: Backlog | Blocked by: P4b-02

Each opportunity maps to a known System One pattern.

Acceptance criteria:

- Opportunities and templates carry a pattern from one enum.
- The opportunity drafting prompt includes the pattern advisor table.

Refs: `.claude/skills/bandwise-builder/references/deploy-and-codegen.md#3-pattern-advisor`

#### P4b-06 Prefill the Definition Studio from an Opportunity

Labels: `Console UI` | Estimate: 2 | State: Backlog | Blocked by: P4b-02, P3-34

Building a set from an opportunity starts with the right context.

Acceptance criteria:

- The Studio fills the intent sentence, state fields and seed examples from the chosen `Opportunity`.

Refs: `.claude/skills/bandwise-builder/references/definition-studio.md#1-capture-intent`, `.claude/skills/bandwise-builder/references/deploy-and-codegen.md#1-integrate-flow`

#### P4b-07 Build the packages/codegen TypeScript target

Labels: `Integrations` `bandwise:contract` | Estimate: 5 | State: Backlog | Blocked by: P1-07

Apps call sets through typed code derived from the spec.

Acceptance criteria:

- Pure: `SetInterface` plus manifest in, files out. Imports only core contracts.
- Generated code calls `@bandwise/client`'s `run<T>()`, built against its types until P4-01 lands.
- One read-only generated file per set. One snapshot per seeded template. Generated TypeScript passes `tsc --noEmit`.

Refs: `.claude/skills/bandwise-builder/references/deploy-and-codegen.md#6-codegen`, `.claude/skills/bandwise-builder/references/deploy-and-codegen.md#typescript-output`, `.claude/skills/bandwise-builder/references/testing.md#codegen-tests`

#### P4b-08 Add the set.codegen operation and route

Labels: `Platform / Tenancy` `bandwise:headless` | Estimate: 3 | State: Backlog | Blocked by: P4b-07, P4b-11, P3-04

Generated code is available from the API.

Acceptance criteria:

- `GET /api/v1/sets/{ref}/codegen` takes `lang`, `channel`, `version`, `appId` and `target`, and returns `{ files, lock, bindingId? }`.
- With `appId` it also records a binding and checks `apps:write`. A channel with no published version returns `404 not_found`.
- `target=standalone` returns 404 until the ADR-009 Standalone section is accepted.

Refs: `.claude/skills/bandwise-builder/references/deploy-and-codegen.md#surfaces`, `.claude/skills/bandwise-builder/references/management-api.md#apps-and-integration`

Note: Split by lane from the phase-4b.md codegen surfaces item (P4b-08 to P4b-10).

#### P4b-09 Add bandwise codegen and MCP generate_client

Labels: `Integrations` `bandwise:headless` | Estimate: 3 | State: Backlog | Blocked by: P4b-08, P3-22

Developers and agents write generated code into the app repo.

Acceptance criteria:

- `bandwise codegen <slug> --lang ts [--channel <c>] [--version <n>] [--app <id>]` writes `bandwise/generated/<slug>.ts` and records a binding.
- MCP `generate_client` returns the files and the lock entry for the agent to write.

Refs: `.claude/skills/bandwise-builder/references/deploy-and-codegen.md#surfaces`, `.claude/skills/bandwise-builder/references/deploy-and-codegen.md#8-delivering-code-into-an-app-repo`

Note: Split by lane from the phase-4b.md codegen surfaces item (P4b-08 to P4b-10).

#### P4b-10 Add the console "Use in your app" tab

Labels: `Console UI` | Estimate: 2 | State: Backlog | Blocked by: P4b-08

People copy generated code and record a binding from the console.

Acceptance criteria:

- Shows the generated file for the app's language, copy and download buttons and the plain HTTP snippet.
- "Use in app" records a binding through `binding.create`.

Refs: `.claude/skills/bandwise-builder/references/deploy-and-codegen.md#surfaces`

Note: Split by lane from the phase-4b.md codegen surfaces item (P4b-08 to P4b-10).

#### P4b-11 Add app_set_bindings and the binding operations

Labels: `Platform / Tenancy` `bandwise:headless` | Estimate: 3 | State: Backlog | Blocked by: P4b-01

Bandwise knows which app uses which set, where and through what code.

Acceptance criteria:

- `binding.list`, `binding.create` and `binding.remove`. A new binding for the same app, set and channel sets `removed_at` on the previous row, so the table is the deploy history.
- Audit actions `binding.create` and `binding.remove`, and event `binding.created`.

Refs: `.claude/skills/bandwise-builder/references/deploy-and-codegen.md#7-app-bindings`, `.claude/skills/bandwise-builder/references/management-api.md#apps-and-integration`

Note: Split by lane from the phase-4b.md app bindings item (P4b-11, P4b-12).

#### P4b-12 Build the app page and the set Consumers panel

Labels: `Console UI` | Estimate: 3 | State: Backlog | Blocked by: P4b-11

People see what each app uses and who consumes each set.

Acceptance criteria:

- The app page shows sets in use, channel, served version, interface major and last run.
- The set page and the publish dialog show a Consumers panel: bindings plus apps with runs in the last 30 days.

Refs: `.claude/skills/bandwise-builder/references/deploy-and-codegen.md#7-app-bindings`

Note: Split by lane from the phase-4b.md app bindings item (P4b-11, P4b-12).

#### P4b-13 Make interface.breaking use bindings plus recent app runs

Labels: `Core Engine` `bandwise:contract` | Estimate: 3 | State: Backlog | Blocked by: P4b-11, P1-06, P1-07

A publish that would break a live app fails loudly.

Acceptance criteria:

- Consumers per channel are live bindings plus apps with runs in the last 30 days, passed in `PublishCtx.served`.
- Only `interfaceBump` with an audited reason clears the lint.
- Publishing a version that removes a route output a bound production app uses fails unless the major is bumped.

Refs: `.claude/skills/bandwise-builder/references/deploy-and-codegen.md#5-set-interface-and-compatibility`, `.claude/skills/bandwise-builder/references/architecture.md#lints-packagescoresrclints`

#### P4b-14 Enforce the Bandwise-Interface header on runs

Labels: `Platform / Tenancy` `bandwise:contract` | Estimate: 2 | State: Backlog | Blocked by: P2-12

An app built against an old interface never gets a silent mismatch.

Acceptance criteria:

- A `Bandwise-Interface` major that differs from the version's returns `409 interface_mismatch`.
- The server never falls back to an older version.

Refs: `.claude/skills/bandwise-builder/references/api.md#run-request`, `.claude/skills/bandwise-builder/references/deploy-and-codegen.md#5-set-interface-and-compatibility`

#### P4b-15 Build bandwise init

Labels: `Integrations` `bandwise:headless` `Security` | Estimate: 3 | State: Backlog | Blocked by: P4b-01, P3-22, P4-01

One command sets up an app repo.

Acceptance criteria:

- Runs the six steps in deploy-and-codegen.md: create the app, create an `sk_test_` token with `run` and `feedback:write` bound to staging (no approval needed), write `bandwise.config.json`, add `@bandwise/client`, and with `--set` generate one typed call site in a new file.
- It never writes the token secret to a tracked file.
- It needs an admin ceiling. `--app <appId>` skips app and token creation.

Refs: `.claude/skills/bandwise-builder/references/deploy-and-codegen.md#bandwise-init`, `.claude/skills/bandwise-builder/references/management-api.md#catalog`

#### P4b-16 Write .bandwise/lock.json from bandwise codegen

Labels: `Integrations` | Estimate: 2 | State: Backlog | Blocked by: P4b-09

The repo records exactly what was generated and from which interface.

Acceptance criteria:

- One lock entry per set with slug, channel, version, `interfaceMajor`, `interfaceHash`, `generatorVersion` and `fileHashes`.

Refs: `.claude/skills/bandwise-builder/references/deploy-and-codegen.md#8-delivering-code-into-an-app-repo`

#### P4b-17 Build bandwise check with exit code 2 on drift

Labels: `Integrations` | Estimate: 2 | State: Backlog | Blocked by: P4b-16

Customer CI catches interface drift and hand edits.

Acceptance criteria:

- Exit 0 when the lock matches the live major and every file hash, with a notice for additive changes.
- Exit 2 when the live major differs from the lock or a generated file was edited, deleted or is missing.
- Exit 1 on auth, network or unknown set.

Refs: `.claude/skills/bandwise-builder/references/deploy-and-codegen.md#8-delivering-code-into-an-app-repo`

#### P4b-18 Decide the ADR-009 Python section

Labels: `Architect` `bandwise:adr` | Estimate: 1 | State: Backlog | Blocked by: P0-06

Nick decides whether a second toolchain is worth it.

Acceptance criteria:

- The ADR-009 Python section is accepted or rejected, with the reason recorded.

Refs: `docs/adr/009-app-integration-and-deploy-targets.md`, `.claude/skills/bandwise-builder/references/deploy-and-codegen.md#python-output-behind-adr-009`

Note: Added: phase-4b.md gates the Python work on this decision without a checklist line for it.

#### P4b-19 Build the Python client, Python codegen and examples/fastapi

Labels: `Integrations` | Estimate: 8 | State: Backlog | Blocked by: P4b-18, P4b-07

Python apps get the same typed path as TypeScript apps.

Acceptance criteria:

- `packages/client-py` is generated from `openapi.json`.
- The Python codegen target produces files that pass pyright.
- `examples/fastapi` runs against it.
- Starts only after the ADR-009 Python section is accepted.

Refs: `.claude/skills/bandwise-builder/references/deploy-and-codegen.md#python-output-behind-adr-009`, `.claude/skills/bandwise-builder/references/testing.md#codegen-tests`

#### P4b-20 Decide the ADR-009 Standalone section

Labels: `Architect` `bandwise:adr` `Security` | Estimate: 1 | State: Backlog | Blocked by: P0-06

Nick decides whether a lock-in-free path that skips managed controls ships.

Acceptance criteria:

- The ADR-009 Standalone section is accepted or rejected, with Security reviewer input and the reason recorded.

Refs: `docs/adr/009-app-integration-and-deploy-targets.md`, `.claude/skills/bandwise-builder/references/deploy-and-codegen.md#9-standalone-export-behind-adr-009-last-in-phase-4b`

Note: Added: phase-4b.md gates the standalone export on this decision without a checklist line for it.

#### P4b-21 Build the standalone export and POST /api/v1/runs/ingest

Labels: `Integrations` `Security` | Estimate: 8 | State: Backlog | Blocked by: P4b-20, P4b-07

Customers can run a set on their own key and still report back.

Acceptance criteria:

- Exports `typesafe/<slug>.questions.ts` (or `.py`) with a band and route helper golden-tested against the core router table.
- The code reads the customer's own key from their server env. Bandwise never exports a stored key.
- `run.ingest` (`runs:write`) keeps the ledger, review and calibration working for exported sets.
- Starts only after the ADR-009 Standalone section is accepted. The Security reviewer signs off.

Refs: `.claude/skills/bandwise-builder/references/deploy-and-codegen.md#9-standalone-export-behind-adr-009-last-in-phase-4b`, `.claude/skills/bandwise-builder/references/api.md#endpoints-run-surface`, `.claude/skills/bandwise-builder/references/testing.md#codegen-tests`

#### P4b-22 Review codegen output and bandwise init tokens for security

Labels: `Security review` `Security` | Estimate: 2 | State: Backlog | Blocked by: P4b-07, P4b-09, P4b-15

The Security reviewer signs off on code and tokens that reach customer repos.

Acceptance criteria:

- Generated code and the `bandwise init` token flow are reviewed.
- The bundle scan covers generated browser code.

Refs: `.claude/skills/bandwise-builder/references/security.md`, `.claude/skills/bandwise-builder/references/testing.md#security-tests`

Note: Added: phase-4b.md names the Security reviewer as an owner. Standalone sign-off is part of P4b-21.

#### P4b-23 Pass the Phase 4b exit gate

Labels: `QA / Evals` `bandwise:headless` | Estimate: 5 | State: Backlog | Blocked by: P4b-03, P4b-04, P4b-05, P4b-06, P4b-10, P4b-12, P4b-13, P4b-14, P4b-17, P4b-22

Confirm an agent can wire a set into an app with no console clicks.

Acceptance criteria:

- In a sample Next.js repo with no System One code, an agent using only the CLI or MCP and an agent token records an opportunity, builds a set, publishes it to staging, generates and wires the typed client, and, with the set marked protected, requests promotion to production, which a person approves. The console app page then shows the binding.
- Publishing a version that removes a route output a bound production app uses fails the lint unless the major is bumped with a reason.
- `bandwise check` exits 2 after a generated file is edited or the live interface major changes.
- Generated TypeScript passes `tsc --noEmit` for every seeded template.

Refs: `.claude/skills/bandwise-builder/references/phases/phase-4b.md#exit-gate`, `.claude/skills/bandwise-builder/references/headless-and-agents.md#b-set-up-an-app-phase-4b`

### Bandwise P5: Plugins and templates

Plugin SDK, built-in adapters and actions, the remaining templates, plugin enablement, org event webhooks and the GitHub Action.

Lead role: Extensions. Depends on: Bandwise P4: Embed kit. Needs Phase 4. The GitHub Action also needs bandwise check from P4b. Checklist: `.claude/skills/bandwise-builder/references/phases/phase-5.md`. 11 issues, 41 points.

#### P5-01 Build plugin-sdk with definePlugin and the plugin interfaces

Labels: `Extensions` `bandwise:contract` | Estimate: 5 | State: Backlog | Blocked by: P0-09

Adapters, templates and actions plug in through one typed SDK.

Acceptance criteria:

- `definePlugin()`, `InputAdapter`, `QuestionTemplate` and `ActionHandler`, matching `templates/plugin.template.ts`.
- A build-time registry with no remote code loading.

Refs: `.claude/skills/bandwise-builder/templates/plugin.template.ts`, `.claude/skills/bandwise-builder/references/phases/phase-5.md`

#### P5-02 Build the built-in input adapters

Labels: `Extensions` `Security` | Estimate: 5 | State: Backlog | Blocked by: P5-01

Sets accept common inputs without custom code.

Acceptance criteria:

- JSON, plain text, email, HTML to text, CSV row, webhook payload and web page (selection, readable text, per-site selectors).
- Run step 3 runs the configured adapter, and adapter output is treated as untrusted state.

Refs: `.claude/skills/bandwise-builder/references/phases/phase-5.md`, `.claude/skills/bandwise-builder/references/architecture.md#run-data-flow`, `.claude/skills/bandwise-builder/references/security.md#state-is-untrusted`

#### P5-03 Add the adapter picker to the input editor

Labels: `Console UI` | Estimate: 2 | State: Backlog | Blocked by: P5-02, P3-12

People choose an input adapter per set.

Acceptance criteria:

- The input editor shows the adapter picker that Phase 3 hid, listing the enabled adapters.
- Sets without an adapter keep running on raw JSON state.

Refs: `.claude/skills/bandwise-builder/references/phases/phase-3.md#managed-questions-and-managed-live`

Note: Phase 3 hides the picker. The matching line in phase-5.md is a pending edit.

#### P5-04 Build the built-in actions: webhook, Slack, email and review item

Labels: `Extensions` `Security` | Estimate: 5 | State: Backlog | Blocked by: P5-01

Auto decisions can act on the outside world safely.

Acceptance criteria:

- Webhook (HMAC signed), Slack, email and create review item.
- Side-effect handlers do not dispatch for staging runs unless the set sets `dispatchActionsOnStaging`.
- Handlers are idempotent under retry by `runId:decisionId`.
- `escalate_to_llm` is not a plugin action: core owns it from Phase 1.

Refs: `.claude/skills/bandwise-builder/references/phases/phase-5.md`, `.claude/skills/bandwise-builder/references/confidence-policy.md#escalation`, `.claude/skills/bandwise-builder/references/confidence-policy.md#actions`

Note: phase-5.md still lists "escalate to LLM" as a built-in action. Removing it is a pending edit; confidence-policy.md wins.

#### P5-05 Seed the remaining nine templates, each tagged with a pattern

Labels: `Extensions` | Estimate: 5 | State: Backlog | Blocked by: P5-01, P4b-05

Common decisions start from a tested template.

Acceptance criteria:

- Each template builds a `Partial<QuestionSetSpec>` that includes `input.schema` and never sets `model`.
- Each creates a working set from the console and passes a fixture run.
- Each has a codegen snapshot.

Refs: `.claude/skills/bandwise-builder/references/definition-studio.md#template-library-seeded`, `.claude/skills/bandwise-builder/references/deploy-and-codegen.md#3-pattern-advisor`, `.claude/skills/bandwise-builder/references/testing.md#codegen-tests`

#### P5-06 Add per-org plugin enablement with encrypted config

Labels: `Extensions` `Security` `bandwise:tenancy` | Estimate: 3 | State: Backlog | Blocked by: P5-01, P2-03

Each org turns plugins on and configures them safely.

Acceptance criteria:

- `plugin.list`, `plugin.get` and `plugin.update` (admin).
- Plugin config is encrypted like keys.
- The `action.handler_unknown` lint reads the enabled handlers.

Refs: `.claude/skills/bandwise-builder/references/management-api.md#identity-tokens-and-admin`, `.claude/skills/bandwise-builder/references/architecture.md#lints-packagescoresrclints`

#### P5-07 Build the plugin conformance test suite

Labels: `Extensions` | Estimate: 3 | State: Backlog | Blocked by: P5-01

Every plugin meets the same bar.

Acceptance criteria:

- A suite every plugin must pass, including idempotency under retry for actions.
- The built-ins pass it.

Refs: `.claude/skills/bandwise-builder/references/phases/phase-5.md`

#### P5-08 Add an example third-party plugin in examples/

Labels: `Extensions` `bandwise:docs` | Estimate: 2 | State: Backlog | Blocked by: P5-07

Plugin authors copy a working example.

Acceptance criteria:

- An example plugin in `examples/` passes the conformance suite.

Refs: `.claude/skills/bandwise-builder/references/phases/phase-5.md`, `.claude/skills/bandwise-builder/templates/plugin.template.ts`

#### P5-09 Deliver org event webhooks with HMAC signatures and retries

Labels: `Platform / Tenancy` `Security` | Estimate: 5 | State: Backlog | Blocked by: P3-20, P2-14

Orgs with a public URL receive events as they happen.

Acceptance criteria:

- `webhook_endpoints` with `webhook.list`, `webhook.create` and `webhook.delete`.
- Deliveries are HMAC signed with `org_webhook_secrets` and retried.
- A signature rejection test passes.

Refs: `.claude/skills/bandwise-builder/references/events.md#org-webhooks-phase-5`, `.claude/skills/bandwise-builder/references/testing.md#security-tests`

#### P5-10 Publish a GitHub Action for bandwise check and spec diff comments

Labels: `Integrations` `bandwise:headless` | Estimate: 3 | State: Backlog | Blocked by: P4b-17, P3-24

Customer PRs show spec diffs and fail on interface drift.

Acceptance criteria:

- The Action runs `bandwise check` and comments `bandwise spec diff` on PRs, using an agent token with `sets:read`.
- It lives in `examples/` or is published.

Refs: `.claude/skills/bandwise-builder/references/headless-and-agents.md#specs-as-code`, `.claude/skills/bandwise-builder/references/deploy-and-codegen.md#8-delivering-code-into-an-app-repo`

#### P5-11 Pass the Phase 5 exit gate

Labels: `QA / Evals` | Estimate: 3 | State: Backlog | Blocked by: P5-03, P5-04, P5-05, P5-06, P5-08, P5-09, P5-10

Confirm plugins and templates are ready.

Acceptance criteria:

- Built-ins pass the conformance tests.
- Every template creates a working set from the console and passes a fixture run.
- Action handlers are idempotent under retry (`runId:decisionId`).

Refs: `.claude/skills/bandwise-builder/references/phases/phase-5.md#exit-gate`

### Bandwise P6: Chrome extension

WXT MV3 extension with evaluate page and action picker modes, signed in with the device flow.

Lead role: Extensions. Depends on: Bandwise P5: Plugins and templates. Needs the Phase 5 web page adapter. Runs in parallel with P7. Checklist: `.claude/skills/bandwise-builder/references/phases/phase-6.md`. 9 issues, 30 points.

#### P6-01 Scaffold the WXT MV3 extension with activeTab and storage only

Labels: `Extensions` `Security` | Estimate: 2 | State: Backlog | Blocked by: P0-07

The extension starts with the smallest permission set.

Acceptance criteria:

- WXT, MV3, permissions `activeTab` and `storage` only.

Refs: `.claude/skills/bandwise-builder/references/phases/phase-6.md`, `.claude/skills/bandwise-builder/references/security.md#extensions`

#### P6-02 Sign in with the device flow and keep the token in session storage

Labels: `Extensions` `Security` `bandwise:headless` | Estimate: 3 | State: Backlog | Blocked by: P6-01, P2-07

The extension acts for one user with a narrow agent token.

Acceptance criteria:

- Sign in uses the device flow and receives an agent token with client `extension` and scopes `run`, `sets:read`, `review:read` and `review:write`.
- The token lives in `chrome.storage.session`. No TypeSafe key is anywhere in the extension.

Refs: `.claude/skills/bandwise-builder/references/phases/phase-6.md`, `.claude/skills/bandwise-builder/references/security.md#agent-tokens`, `.claude/skills/bandwise-builder/references/security.md#extensions`

#### P6-03 Add the org and set picker

Labels: `Extensions` | Estimate: 2 | State: Backlog | Blocked by: P6-02

Users choose which org and set the extension runs.

Acceptance criteria:

- Pick an org profile and a set the token can run.

Refs: `.claude/skills/bandwise-builder/references/phases/phase-6.md`

#### P6-04 Build evaluate page mode with the web page adapter

Labels: `Extensions` `Security` | Estimate: 5 | State: Backlog | Blocked by: P6-03, P5-02, P4-06

Users evaluate a page with a set and see the confidence.

Acceptance criteria:

- Extracts the selection, readable text or custom per-site selectors through the web page adapter, then previews and redacts state.
- Nothing is sent before the user clicks.
- Shows `ConfidenceBadge` and `ProbabilityBars` in a side panel and sends medium and low to review.
- Works on three sample pages.

Refs: `.claude/skills/bandwise-builder/references/phases/phase-6.md`, `.claude/skills/bandwise-builder/references/security.md#state-is-untrusted`

#### P6-05 Build action picker mode

Labels: `Extensions` `Security` | Estimate: 8 | State: Backlog | Blocked by: P6-04

One Choice picks the next UI action on a page, with no screenshots.

Acceptance criteria:

- The page becomes a numbered list of clickable elements, and one Choice picks the action and element.
- Per-option probabilities are shown. A small LLM handles typing only. No screenshots.
- Completes one scripted task on an allowlisted test site.

Refs: `.claude/skills/bandwise-builder/references/phases/phase-6.md`, `.claude/skills/bandwise-builder/references/definition-studio.md#template-library-seeded`

#### P6-06 Enforce the autonomy rule for extension clicks

Labels: `Extensions` `Security` | Estimate: 3 | State: Backlog | Blocked by: P6-05

The extension clicks on its own only when it is safe to.

Acceptance criteria:

- It clicks on its own only for high-band answers on org-allowlisted sites, and only when the set's production rollout is `full`. Everything else waits for confirmation.
- An injected-instruction test page does not trigger an autonomous click.

Refs: `.claude/skills/bandwise-builder/references/phases/phase-6.md`, `.claude/skills/bandwise-builder/references/security.md#state-is-untrusted`

#### P6-07 Default web page adapter sets to high risk with adversarial cases

Labels: `Extensions` `Security` | Estimate: 2 | State: Backlog | Blocked by: P5-02, P3-06

Sets that read web pages start with the strictest targets.

Acceptance criteria:

- Sets using the web page adapter default to the high-risk tier.
- Their gate dataset includes adversarial cases.

Refs: `.claude/skills/bandwise-builder/references/security.md#state-is-untrusted`, `.claude/skills/bandwise-builder/references/confidence-policy.md#default-thresholds-by-risk-tier`

#### P6-08 Review the extension against the threat model

Labels: `Security review` `Security` | Estimate: 2 | State: Backlog | Blocked by: P6-02, P6-04, P6-05, P6-06

The Security reviewer signs off before the extension ships.

Acceptance criteria:

- Permissions, token storage, prompt injection handling and the autonomy rule are reviewed and signed off.

Refs: `.claude/skills/bandwise-builder/references/security.md#extensions`, `.claude/skills/bandwise-builder/references/security.md#state-is-untrusted`

Note: Added: phase-6.md names the Security reviewer as an owner without a checklist line.

#### P6-09 Pass the Phase 6 exit gate

Labels: `QA / Evals` `Security` | Estimate: 3 | State: Backlog | Blocked by: P6-07, P6-08

Confirm the extension is safe to ship.

Acceptance criteria:

- No TypeSafe key anywhere in the extension.
- Nothing is sent before the user clicks.
- Evaluate mode works on three sample pages. The action picker completes one scripted task on an allowlisted test site.
- An injected-instruction test page does not trigger an autonomous click.

Refs: `.claude/skills/bandwise-builder/references/phases/phase-6.md#exit-gate`

### Bandwise P7: MCP HTTP and Claude Code plugin

MCP HTTP transport, the Claude Code plugin with the bandwise-operator and bandwise-integrate skills, and a marketplace entry.

Lead role: Integrations. Depends on: Bandwise P3: Console and management API, Bandwise P3b: Effectiveness loop, Bandwise P4b: Integrate and deploy. Needs the Phase 3 operations and Phase 4b; the Phase 3b tools must exist. Runs in parallel with P6. Checklist: `.claude/skills/bandwise-builder/references/phases/phase-7.md`. 6 issues, 18 points.

#### P7-01 Add the MCP HTTP transport and any missing 3b and 4b tools

Labels: `Integrations` `bandwise:headless` | Estimate: 5 | State: Backlog | Blocked by: P3-25, P3b-05, P3b-09, P3b-13, P3b-18, P3b-23, P3b-26, P4b-04, P4b-09

Hosted agents reach Bandwise over MCP HTTP.

Acceptance criteria:

- `packages/mcp-server` serves the HTTP transport next to stdio.
- Every Phase 3b and 4b curated tool in headless-and-agents.md is present.

Refs: `.claude/skills/bandwise-builder/references/headless-and-agents.md#mcp-server`, `.claude/skills/bandwise-builder/references/phases/phase-7.md`

#### P7-02 Authenticate the MCP server with an agent token only

Labels: `Integrations` `Security` | Estimate: 2 | State: Backlog | Blocked by: P7-01

MCP never holds an app token or a TypeSafe key.

Acceptance criteria:

- Auth uses `BANDWISE_TOKEN` or a `bandwise login` profile.
- A test rejects an `sk_` app token. No TypeSafe key is ever read.

Refs: `.claude/skills/bandwise-builder/references/headless-and-agents.md#mcp-server`, `.claude/skills/bandwise-builder/references/security.md#agent-tokens`

#### P7-03 Package plugins/claude-code with bandwise-operator and bandwise-integrate

Labels: `Integrations` `bandwise:docs` `bandwise:headless` | Estimate: 5 | State: Backlog | Blocked by: P7-01

Customers install one Claude Code plugin to run Bandwise from a prompt.

Acceptance criteria:

- `.claude-plugin/plugin.json` and `.mcp.json` with one server entry per profile.
- `bandwise-operator` moves sets through rollout stages, reads disagreements and health, knows when an approval is needed, and tells app code to branch only on `effectiveAction` and `route`.
- `bandwise-integrate` loads the official `typesafe` skill, posts opportunity summaries (never source code), builds the set, then runs `bandwise codegen` and `bandwise check`.

Refs: `.claude/skills/bandwise-builder/references/headless-and-agents.md#customer-claude-code-skills-phase-7`, `.claude/skills/bandwise-builder/references/phases/phase-7.md`

#### P7-04 Keep the bandwise-builder skill out of the plugin

Labels: `Integrations` `Security` | Estimate: 1 | State: Backlog | Blocked by: P7-03

The internal builder skill never ships to customers.

Acceptance criteria:

- A packaging check fails if any file from `.claude/skills/bandwise-builder` is in the plugin output.

Refs: `.claude/skills/bandwise-builder/references/phases/phase-7.md`, `.claude/skills/bandwise-builder/SKILL.md`

#### P7-05 Publish a marketplace repo or local marketplace entry

Labels: `Integrations` `bandwise:docs` | Estimate: 2 | State: Backlog | Blocked by: P7-03

Customers install the plugin with one command.

Acceptance criteria:

- `claude plugin install` works from the marketplace entry.

Refs: `.claude/skills/bandwise-builder/references/phases/phase-7.md`

#### P7-06 Pass the Phase 7 exit gate

Labels: `QA / Evals` `bandwise:headless` | Estimate: 3 | State: Backlog | Blocked by: P7-02, P7-04, P7-05

Confirm Bandwise runs from a Claude Code prompt.

Acceptance criteria:

- `claude plugin install` works from the marketplace.
- In a sample repo, "set up Bandwise in this app" produces an opportunity, a set and a generated typed client.
- "Run the triage set on this text" returns a `RunResult` with bands.
- A prompt to publish to production on a protected or live set returns a pending approval until a person approves it.
- The MCP inspector passes.

Refs: `.claude/skills/bandwise-builder/references/phases/phase-7.md#exit-gate`

## 4. Machine-readable backlog

The project, milestones, and labels already exist in NSIMS. Create the issues in array order in project `Bandwise` with their `milestone`, `labels`, `estimate`, and `state`. Record each `localId` to `NSI-n` mapping, and add the `blockedBy` relations only after every issue exists, because a few issues (P3-02, P3-13, P4b-08) wait on a higher local ID. Before creating an issue, search the Bandwise project for its `Local ID:` line, so a rerun never duplicates work.

```json
{
  "version": 1,
  "generated": "2026-09-26",
  "source": "docs/linear-backlog.md",
  "workspace": "NSIMS",
  "team": {
    "name": "NSIMS",
    "key": "NSI"
  },
  "workflowStates": "Linear defaults. Uses Done, Todo and Backlog.",
  "estimateScale": "fibonacci",
  "labels": {
    "roleGroup": "Bandwise role (single select, one per issue)",
    "roles": [
      "Architect",
      "Core Engine",
      "Platform / Tenancy",
      "Billing",
      "Console UI",
      "Embed Kit",
      "QA / Evals",
      "Integrations",
      "Quality / Learning",
      "Extensions",
      "Security review",
      "Docs"
    ],
    "types": [
      "bandwise:contract",
      "bandwise:adr",
      "Security",
      "bandwise:tenancy",
      "bandwise:headless",
      "bandwise:models",
      "bandwise:docs"
    ],
    "always": [
      "agent-created"
    ]
  },
  "projects": [
    {
      "key": "P0",
      "name": "Bandwise P0: Skill and scaffold",
      "description": "Builder skill and plan (done), then the monorepo scaffold, frozen contracts, operation registry skeleton, OpenAPI, ADRs 002 to 010 and CI.",
      "leadRole": "Architect",
      "order": 1,
      "dependsOn": [],
      "dependsNote": "No dependencies. Blocks every other project.",
      "checklist": ".claude/skills/bandwise-builder/references/phases/phase-0.md",
      "milestone": "Phase 0: Skill, contracts, scaffold"
    },
    {
      "key": "P1",
      "name": "Bandwise P1: Core engine and data layer",
      "description": "Core run engine on fixtures, system-one-client, llm-client, the full schema with RLS, repositories, fixtures, the evals CLI and the local CLI.",
      "leadRole": "Core Engine",
      "order": 2,
      "dependsOn": [
        "Bandwise P0: Skill and scaffold"
      ],
      "dependsNote": "Needs the Phase 0 contracts (P0-09, P0-10).",
      "checklist": ".claude/skills/bandwise-builder/references/phases/phase-1.md",
      "milestone": "Phase 1: Core engine and data layer"
    },
    {
      "key": "P2",
      "name": "Bandwise P2: Tenancy, auth, keys and billing",
      "description": "Auth and orgs, BYO keys, app and agent tokens with the device flow, runOperation with approvals and idempotency, the run route, rate limits, the Stripe foundation, platform admin and the console shell.",
      "leadRole": "Platform / Tenancy",
      "order": 3,
      "dependsOn": [
        "Bandwise P1: Core engine and data layer"
      ],
      "dependsNote": "Needs the Phase 1 schema and repositories, and ADR-002 (P0-18).",
      "checklist": ".claude/skills/bandwise-builder/references/phases/phase-2.md",
      "milestone": "Phase 2: Tenancy, auth, keys, billing"
    },
    {
      "key": "P3",
      "name": "Bandwise P3: Console and management API",
      "description": "Console screens on operations, the management API with parity, the bandwise CLI, MCP stdio, event feed, feedback API, audit sampling, rollout gates and auto-demote, model pages and reports.",
      "leadRole": "Console UI",
      "order": 4,
      "dependsOn": [
        "Bandwise P2: Tenancy, auth, keys and billing"
      ],
      "dependsNote": "Needs Phase 2 (auth, tokens, runOperation, approvals, the run route).",
      "checklist": ".claude/skills/bandwise-builder/references/phases/phase-3.md",
      "milestone": "Phase 3: Console and management API"
    },
    {
      "key": "P3b",
      "name": "Bandwise P3b: Effectiveness loop",
      "description": "Policy replay and threshold suggestions, set health, proposals, champion/challenger, model upgrades, Studio improve mode and quality-adjusted value.",
      "leadRole": "Quality / Learning",
      "order": 5,
      "dependsOn": [
        "Bandwise P3: Console and management API"
      ],
      "dependsNote": "Starts when Phase 3 lands. Runs in parallel with P4 and P4b.",
      "checklist": ".claude/skills/bandwise-builder/references/phases/phase-3b.md",
      "milestone": "Phase 3b: Effectiveness loop"
    },
    {
      "key": "P4",
      "name": "Bandwise P4: Embed kit",
      "description": "@bandwise/client (edge-safe, typed run, feedback), @bandwise/react, integration recipes and the example app.",
      "leadRole": "Embed Kit",
      "order": 6,
      "dependsOn": [
        "Bandwise P3: Console and management API"
      ],
      "dependsNote": "Can start during Phase 3 against the MSW mocks (P3-26); the exit gate needs the real Phase 3 API. Runs in parallel with P3b and P4b.",
      "checklist": ".claude/skills/bandwise-builder/references/phases/phase-4.md",
      "milestone": "Phase 4: Embed kit"
    },
    {
      "key": "P4b",
      "name": "Bandwise P4b: Integrate and deploy",
      "description": "Opportunities, TypeScript codegen, app bindings, bandwise init, codegen and check, and the interface-breaking guard. Python and the standalone export stay behind ADR-009.",
      "leadRole": "Integrations",
      "order": 7,
      "dependsOn": [
        "Bandwise P3: Console and management API"
      ],
      "dependsNote": "Starts when Phase 3 lands and runs in parallel with P3b and P4. The TypeScript target builds against the @bandwise/client types (P4-01) until that package lands.",
      "checklist": ".claude/skills/bandwise-builder/references/phases/phase-4b.md",
      "milestone": "Phase 4b: Integrate and deploy"
    },
    {
      "key": "P5",
      "name": "Bandwise P5: Plugins and templates",
      "description": "Plugin SDK, built-in adapters and actions, the remaining templates, plugin enablement, org event webhooks and the GitHub Action.",
      "leadRole": "Extensions",
      "order": 8,
      "dependsOn": [
        "Bandwise P4: Embed kit"
      ],
      "dependsNote": "Needs Phase 4. The GitHub Action also needs bandwise check from P4b.",
      "checklist": ".claude/skills/bandwise-builder/references/phases/phase-5.md",
      "milestone": "Phase 5: Plugins and templates"
    },
    {
      "key": "P6",
      "name": "Bandwise P6: Chrome extension",
      "description": "WXT MV3 extension with evaluate page and action picker modes, signed in with the device flow.",
      "leadRole": "Extensions",
      "order": 9,
      "dependsOn": [
        "Bandwise P5: Plugins and templates"
      ],
      "dependsNote": "Needs the Phase 5 web page adapter. Runs in parallel with P7.",
      "checklist": ".claude/skills/bandwise-builder/references/phases/phase-6.md",
      "milestone": "Phase 6: Chrome extension"
    },
    {
      "key": "P7",
      "name": "Bandwise P7: MCP HTTP and Claude Code plugin",
      "description": "MCP HTTP transport, the Claude Code plugin with the bandwise-operator and bandwise-integrate skills, and a marketplace entry.",
      "leadRole": "Integrations",
      "order": 10,
      "dependsOn": [
        "Bandwise P3: Console and management API",
        "Bandwise P3b: Effectiveness loop",
        "Bandwise P4b: Integrate and deploy"
      ],
      "dependsNote": "Needs the Phase 3 operations and Phase 4b; the Phase 3b tools must exist. Runs in parallel with P6.",
      "checklist": ".claude/skills/bandwise-builder/references/phases/phase-7.md",
      "milestone": "Phase 7: Claude Code plugin and MCP"
    }
  ],
  "issues": [
    {
      "localId": "P0-01",
      "project": "Bandwise",
      "title": "Write the bandwise-builder skill and its references",
      "labels": [
        "Architect",
        "bandwise:docs",
        "agent-created"
      ],
      "estimate": 5,
      "state": "Done",
      "description": "The builder skill and every reference exist, so each agent works from one rulebook.\n\nAcceptance criteria:\n- `SKILL.md` stays under 300 lines and indexes every reference and phase file.\n- References cover architecture, contracts, the run and management APIs, data model, security, testing, phases and the team playbook.\n\nRefs:\n- `.claude/skills/bandwise-builder/SKILL.md`\n- `.claude/skills/bandwise-builder/references/team-playbook.md`\n\nLocal ID: P0-01 (docs/linear-backlog.md)",
      "blockedBy": [],
      "milestone": "Phase 0: Skill, contracts, scaffold",
      "linearId": "NSI-489"
    },
    {
      "localId": "P0-02",
      "project": "Bandwise",
      "title": "Write the root CLAUDE.md and README.md",
      "labels": [
        "Architect",
        "bandwise:docs",
        "agent-created"
      ],
      "estimate": 2,
      "state": "Done",
      "description": "Anyone opening the repo knows to load the skill and how the product works.\n\nAcceptance criteria:\n- `CLAUDE.md` tells agents to load the skill and lists commands, golden rules, env vars and writing rules.\n- `README.md` describes the product for a new reader.\n\nRefs:\n- `CLAUDE.md`\n- `README.md`\n\nLocal ID: P0-02 (docs/linear-backlog.md)",
      "blockedBy": [],
      "milestone": "Phase 0: Skill, contracts, scaffold",
      "linearId": "NSI-490"
    },
    {
      "localId": "P0-03",
      "project": "Bandwise",
      "title": "Write docs/PLAN.md and ADR-001",
      "labels": [
        "Architect",
        "bandwise:docs",
        "bandwise:adr",
        "agent-created"
      ],
      "estimate": 3,
      "state": "Done",
      "description": "The plan and the stack decision are on record.\n\nAcceptance criteria:\n- `docs/PLAN.md` covers why, scope, phases and team kickoff prompts.\n- ADR-001 records the stack. The auth library it left open is settled by ADR-002: Better Auth.\n\nRefs:\n- `docs/PLAN.md`\n- `docs/adr/001-stack.md#open-question-for-adr-002`\n\nLocal ID: P0-03 (docs/linear-backlog.md)",
      "blockedBy": [],
      "milestone": "Phase 0: Skill, contracts, scaffold",
      "linearId": "NSI-492"
    },
    {
      "localId": "P0-04",
      "project": "Bandwise",
      "title": "Draft ADRs 007 to 010 with status proposed",
      "labels": [
        "Architect",
        "bandwise:adr",
        "bandwise:headless",
        "bandwise:models",
        "bandwise:contract",
        "agent-created"
      ],
      "estimate": 5,
      "state": "Done",
      "description": "The four decisions behind Nick's 2026-09-26 requirements are drafted before the contract freeze.\n\nAcceptance criteria:\n- ADR-007 headless parity, ADR-008 model registry and neutral naming, ADR-009 app integration and deploy targets, and ADR-010 rollout on pointers and the effectiveness loop exist with status proposed.\n\nRefs:\n- `docs/adr/007-headless-parity.md`\n- `docs/adr/008-system-one-model-registry.md`\n- `docs/adr/009-app-integration-and-deploy-targets.md`\n- `docs/adr/010-rollout-pointers-and-effectiveness-loop.md`\n\nLocal ID: P0-04 (docs/linear-backlog.md)",
      "blockedBy": [],
      "milestone": "Phase 0: Skill, contracts, scaffold",
      "linearId": "NSI-494"
    },
    {
      "localId": "P0-05",
      "project": "Bandwise",
      "title": "Add templates: example question set, ADR and plugin",
      "labels": [
        "Architect",
        "bandwise:docs",
        "bandwise:contract",
        "agent-created"
      ],
      "estimate": 2,
      "state": "Done",
      "description": "Agents copy from working templates instead of guessing shapes.\n\nAcceptance criteria:\n- `templates/question-set.example.json`, `templates/adr.md` and `templates/plugin.template.ts` exist.\n- The example spec has no `rollout` key.\n\nRefs:\n- `.claude/skills/bandwise-builder/templates/question-set.example.json`\n- `.claude/skills/bandwise-builder/templates/adr.md`\n- `.claude/skills/bandwise-builder/templates/plugin.template.ts`\n\nLocal ID: P0-05 (docs/linear-backlog.md)",
      "blockedBy": [],
      "milestone": "Phase 0: Skill, contracts, scaffold",
      "linearId": "NSI-495"
    },
    {
      "localId": "P0-06",
      "project": "Bandwise",
      "title": "Review and accept ADRs 007 to 010 before the contract freeze",
      "labels": [
        "Architect",
        "bandwise:adr",
        "bandwise:contract",
        "bandwise:headless",
        "bandwise:models",
        "agent-created"
      ],
      "estimate": 3,
      "state": "Todo",
      "description": "Nick reviews and accepts ADRs 007 to 010, so the Phase 0 contracts freeze on accepted decisions.\n\nAcceptance criteria:\n- ADRs 007, 008, 009 and 010 have status accepted.\n- The ADR-009 Python and Standalone sections stay proposed (decided later in P4b-18 and P4b-20).\n- ADR-001's Amended-by line no longer says ADR-008 and ADR-009 are proposed.\n- Every contract name the ADRs use matches the reference files.\n\nRefs:\n- `docs/adr/007-headless-parity.md`\n- `docs/adr/008-system-one-model-registry.md`\n- `docs/adr/009-app-integration-and-deploy-targets.md`\n- `docs/adr/010-rollout-pointers-and-effectiveness-loop.md`\n- `.claude/skills/bandwise-builder/references/phases/phase-0.md#part-two-scaffold-and-contracts`\n\nNote: Split from the phase-0.md ADR item (P0-06, P0-18): ADRs 007 to 010 must be accepted before the contracts freeze, and ADR-002 must be decided before Phase 2 starts.\n\nLocal ID: P0-06 (docs/linear-backlog.md)",
      "blockedBy": [
        "P0-04"
      ],
      "milestone": "Phase 0: Skill, contracts, scaffold",
      "linearId": "NSI-497"
    },
    {
      "localId": "P0-07",
      "project": "Bandwise",
      "title": "Scaffold the pnpm workspace and turborepo with empty packages",
      "labels": [
        "Architect",
        "agent-created"
      ],
      "estimate": 3,
      "state": "Todo",
      "description": "Create the monorepo layout every role builds in.\n\nAcceptance criteria:\n- A pnpm workspace and `turbo.json` hold every app and package listed in architecture.md, each with a `package.json` and an empty `src`.\n- `pnpm i && pnpm turbo lint typecheck test build` passes on the empty scaffold.\n- No package name, path or code identifier says jev; model ids such as `jev-1.13.0` are data. The client package is `packages/system-one-client` (ADR-008).\n\nRefs:\n- `.claude/skills/bandwise-builder/references/architecture.md#packages-and-boundaries`\n- `.claude/skills/bandwise-builder/references/conventions.md#naming`\n\nLocal ID: P0-07 (docs/linear-backlog.md)",
      "blockedBy": [],
      "milestone": "Phase 0: Skill, contracts, scaffold",
      "linearId": "NSI-498"
    },
    {
      "localId": "P0-08",
      "project": "Bandwise",
      "title": "Add packages/config with strict tsconfig, boundary lint and vitest",
      "labels": [
        "Architect",
        "Security",
        "agent-created"
      ],
      "estimate": 3,
      "state": "Todo",
      "description": "Shared config makes the import boundaries a CI failure, not a review comment.\n\nAcceptance criteria:\n- `tsconfig` is strict. A shared vitest preset is used by every package.\n- `eslint-plugin-boundaries` encodes every rule in architecture.md: only `system-one-client` imports `@typesafe-ai/sdk`, only `llm-client` imports `@anthropic-ai/sdk`, only `db` imports `drizzle-orm`, only `tenancy` touches crypto and KMS, `react` never imports server code, `core` has no side effects, `codegen` imports only core contracts, and `mcp-server` calls `/api/v1` over HTTP only.\n- The `packages/cli/src/local/**` exception is encoded: it may import `core` and the fixture subpath export of `system-one-client`, never the SDK transport.\n- A fixture with a deliberate bad import fails lint, and a fixture for the `cli/src/local` exception passes.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/architecture.md#packages-and-boundaries`\n- `.claude/skills/bandwise-builder/references/conventions.md#typescript`\n\nLocal ID: P0-08 (docs/linear-backlog.md)",
      "blockedBy": [
        "P0-07"
      ],
      "milestone": "Phase 0: Skill, contracts, scaffold",
      "linearId": "NSI-500"
    },
    {
      "localId": "P0-09",
      "project": "Bandwise",
      "title": "Write the spec, policy, run and error contracts in zod",
      "labels": [
        "Architect",
        "bandwise:contract",
        "agent-created"
      ],
      "estimate": 8,
      "state": "Todo",
      "description": "Freeze the contracts that Phase 1 builds against.\n\nAcceptance criteria:\n- In `packages/core/src/contracts`, as zod: `QuestionSetSpec` (strict, no `rollout`), `TenantContext` (with the agent actor), `Channel`, `RolloutStage`, `PublishCtx`; `ConfidencePolicy` (discriminated union), `BandActions`, `ActionRef`; `RunRequest`, `RunDryRunResult`, `SystemOneRequest`, `SystemOneAnswer`, `SystemOneResponse`, `QuestionTypeModule`, `Condition`, `Check`, `FallbackConfig`, `EscalationConfig`, `SetInterface`; `RunResult`, `Decision`, `RunCost`; the error envelope v2, `ErrorDetail`, `GateResult` and `Manifest`.\n- Ports and store interfaces are TypeScript interfaces whose payloads are these zod types.\n- `templates/question-set.example.json` parses with the strict `QuestionSetSpec` schema.\n- The same spec plus a `rollout` key fails with rule `spec.unknown_key` at path `/rollout`.\n- A hand-written `RunResult` sample round-trips: parse, serialize and parse again give an equal value.\n- Names are neutral (`systemOne`, `system_one`) per ADR-008.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/phases/phase-0.md#part-two-scaffold-and-contracts`\n- `.claude/skills/bandwise-builder/references/architecture.md#core-contracts-packagescoresrccontracts`\n- `.claude/skills/bandwise-builder/references/architecture.md#ports`\n- `.claude/skills/bandwise-builder/references/architecture.md#store-interfaces`\n- `.claude/skills/bandwise-builder/references/confidence-policy.md#policy-shape`\n- `.claude/skills/bandwise-builder/references/spec-schema.md`\n- `.claude/skills/bandwise-builder/references/savings-model.md#standard-run-envelope-runresult`\n- `.claude/skills/bandwise-builder/references/api.md#error-envelope-v2`\n\nNote: Split from the phase-0.md contracts item (P0-09, P0-10), because it is larger than 8 points.\n\nLocal ID: P0-09 (docs/linear-backlog.md)",
      "blockedBy": [
        "P0-06",
        "P0-07"
      ],
      "milestone": "Phase 0: Skill, contracts, scaffold",
      "linearId": "NSI-502"
    },
    {
      "localId": "P0-10",
      "project": "Bandwise",
      "title": "Write the management, model, deploy, loop and event contracts",
      "labels": [
        "Architect",
        "bandwise:contract",
        "bandwise:headless",
        "bandwise:models",
        "agent-created"
      ],
      "estimate": 5,
      "state": "Todo",
      "description": "Freeze the contracts that the headless surface, the model registry, deploy and the effectiveness loop share.\n\nAcceptance criteria:\n- As zod: `OperationDef` and `DryRunResult` (management-api.md), `SpecDiff` (phase-0.md), `ModelProfile` (system-one-models.md), `DeployTarget` and `Opportunity` (deploy-and-codegen.md), `FeedbackReport`, `QualityTarget`, `SetHealth`, `ThresholdProposal` and `LabelingPolicy` (effectiveness-loop.md), and `EventEnvelope` plus `EventType` as the union of the event catalog (events.md).\n- `QualityTarget` has one definition, the one in effectiveness-loop.md that architecture.md's contract table points to.\n- Each contract has a parse test with one valid and one invalid sample.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/management-api.md#operation-registry`\n- `.claude/skills/bandwise-builder/references/management-api.md#dry-runs`\n- `.claude/skills/bandwise-builder/references/phases/phase-0.md#specdiff`\n- `.claude/skills/bandwise-builder/references/system-one-models.md#3-modelprofile-contract`\n- `.claude/skills/bandwise-builder/references/deploy-and-codegen.md#4-deploy-targets`\n- `.claude/skills/bandwise-builder/references/deploy-and-codegen.md#opportunity-contract`\n- `.claude/skills/bandwise-builder/references/effectiveness-loop.md#5-quality-targets-and-gates-phase-3`\n- `.claude/skills/bandwise-builder/references/events.md#eventenvelope`\n\nNote: Split from the phase-0.md contracts item (P0-09, P0-10), because it is larger than 8 points.\n\nLocal ID: P0-10 (docs/linear-backlog.md)",
      "blockedBy": [
        "P0-06",
        "P0-07"
      ],
      "milestone": "Phase 0: Skill, contracts, scaffold",
      "linearId": "NSI-504"
    },
    {
      "localId": "P0-11",
      "project": "Bandwise",
      "title": "Build the operation registry skeleton with stubbed handlers",
      "labels": [
        "Architect",
        "bandwise:headless",
        "bandwise:contract",
        "agent-created"
      ],
      "estimate": 5,
      "state": "Todo",
      "description": "Every management operation exists as a registry entry from day one, so OpenAPI and the parity test cover all of them.\n\nAcceptance criteria:\n- `apps/console/src/server/operations` holds `OperationDef`, a `runOperation` stub and one entry per operation in the management-api.md catalog, with handlers stubbed.\n- Entries whose shape is given have real zod input and output, for example `set.run`, `set.publish`, `eval.run`, `draft.validate`, `job.get` and `version.diff` (output `SpecDiff`).\n- Any input with no given shape is `z.object({}).passthrough()` and any such output is `z.unknown()`, each marked `// shape: Phase <n>, owner Platform / Tenancy` from the catalog's Phase column.\n- List operations take `limit` and `cursor` and return `{ data, nextCursor }`.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/phases/phase-0.md#part-two-scaffold-and-contracts`\n- `.claude/skills/bandwise-builder/references/management-api.md#catalog`\n- `.claude/skills/bandwise-builder/references/management-api.md#operation-registry`\n- `.claude/skills/bandwise-builder/references/management-api.md#conventions-for-every-route`\n\nLocal ID: P0-11 (docs/linear-backlog.md)",
      "blockedBy": [
        "P0-09",
        "P0-10"
      ],
      "milestone": "Phase 0: Skill, contracts, scaffold",
      "linearId": "NSI-506"
    },
    {
      "localId": "P0-12",
      "project": "Bandwise",
      "title": "Generate openapi.json from the registry and add the parity skeleton",
      "labels": [
        "Architect",
        "bandwise:headless",
        "bandwise:contract",
        "agent-created"
      ],
      "estimate": 3,
      "state": "Todo",
      "description": "One generated OpenAPI file feeds the CLI, the MCP server, MSW mocks and the embed kit.\n\nAcceptance criteria:\n- `packages/core/openapi.json` is generated from zod and the registry and committed. Each `operationId` is the operation id, with `x-bandwise-scope`, `x-bandwise-min-role`, `x-bandwise-risk` and `x-bandwise-actors`.\n- It has a path for every management operation.\n- The parity test skeleton runs in CI and fails when an operation has no path. The device flow (`/auth/`), the JWKS and `openapi.json` itself are the documented exceptions.\n- The OpenAPI snapshot test fails when the committed file differs from a fresh generation.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/management-api.md#openapi-and-the-parity-test`\n- `.claude/skills/bandwise-builder/references/management-api.md#auth-device-flow`\n- `.claude/skills/bandwise-builder/references/testing.md#layers`\n\nLocal ID: P0-12 (docs/linear-backlog.md)",
      "blockedBy": [
        "P0-11"
      ],
      "milestone": "Phase 0: Skill, contracts, scaffold",
      "linearId": "NSI-507"
    },
    {
      "localId": "P0-13",
      "project": "Bandwise",
      "title": "Seed ModelProfile rows for jev-1.13.0, jev-latest and jev-preview",
      "labels": [
        "Architect",
        "bandwise:models",
        "agent-created"
      ],
      "estimate": 2,
      "state": "Todo",
      "description": "Model facts start as data, not constants.\n\nAcceptance criteria:\n- `packages/core/src/models/catalog.ts` holds the three rows from the seed table, including `aliasTarget` and `supersedes`.\n- Every row parses as `ModelProfile`.\n- The alias rows point `aliasTarget` at `jev-1.13.0`.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/system-one-models.md#13-seed-table`\n- `.claude/skills/bandwise-builder/references/system-one-models.md#3-modelprofile-contract`\n\nLocal ID: P0-13 (docs/linear-backlog.md)",
      "blockedBy": [
        "P0-10"
      ],
      "milestone": "Phase 0: Skill, contracts, scaffold",
      "linearId": "NSI-509"
    },
    {
      "localId": "P0-14",
      "project": "Bandwise",
      "title": "Add the apps/console placeholder page and src/env.ts",
      "labels": [
        "Architect",
        "agent-created"
      ],
      "estimate": 1,
      "state": "Todo",
      "description": "The console app boots and reads env in one place.\n\nAcceptance criteria:\n- An App Router placeholder page renders.\n- All env access goes through `apps/console/src/env.ts` (t3-env), marked `server-only`.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/conventions.md#env`\n- `.claude/skills/bandwise-builder/references/conventions.md#nextjs`\n\nLocal ID: P0-14 (docs/linear-backlog.md)",
      "blockedBy": [
        "P0-07"
      ],
      "milestone": "Phase 0: Skill, contracts, scaffold",
      "linearId": "NSI-511"
    },
    {
      "localId": "P0-15",
      "project": "Bandwise",
      "title": "Add .env.example with every documented variable",
      "labels": [
        "Architect",
        "Security",
        "agent-created"
      ],
      "estimate": 1,
      "state": "Todo",
      "description": "Developers and agents see every variable without any secret in git.\n\nAcceptance criteria:\n- Lists `TYPESAFE_API_KEY`, `DATABASE_URL`, `AUTH_SECRET`, `BANDWISE_KEK`, `BANDWISE_JWT_SIGNING_KEY`, `SYSTEM_ONE_TRANSPORT`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `REDIS_URL` and `ANTHROPIC_API_KEY`, with no values.\n- No `.env*` file with values is committed.\n\nRefs:\n- `CLAUDE.md`\n- `.claude/skills/bandwise-builder/references/conventions.md#env`\n\nLocal ID: P0-15 (docs/linear-backlog.md)",
      "blockedBy": [
        "P0-07"
      ],
      "milestone": "Phase 0: Skill, contracts, scaffold",
      "linearId": "NSI-513"
    },
    {
      "localId": "P0-16",
      "project": "Bandwise",
      "title": "Add GitHub Actions CI for lint, typecheck, test and build",
      "labels": [
        "Architect",
        "agent-created"
      ],
      "estimate": 2,
      "state": "Todo",
      "description": "Every PR runs the same gate agents run locally.\n\nAcceptance criteria:\n- CI runs `pnpm i` and `pnpm turbo lint typecheck test build` on every PR and fails on any step.\n- CI needs no `TYPESAFE_API_KEY` and makes no live System One call.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/testing.md#layers`\n- `.claude/skills/bandwise-builder/references/team-playbook.md#working-rules`\n\nLocal ID: P0-16 (docs/linear-backlog.md)",
      "blockedBy": [
        "P0-08"
      ],
      "milestone": "Phase 0: Skill, contracts, scaffold",
      "linearId": "NSI-514"
    },
    {
      "localId": "P0-17",
      "project": "Bandwise",
      "title": "Add the PR template with contract, tenancy and security sections",
      "labels": [
        "Architect",
        "bandwise:docs",
        "agent-created"
      ],
      "estimate": 1,
      "state": "Todo",
      "description": "Every PR states its contract, tenancy and security impact.\n\nAcceptance criteria:\n- The template has Summary, Phase and checklist item, Contract impact, Tenancy impact, Security impact, Tests added and Docs updated.\n- It asks for the Linear issue key (for example `NSI-412`) in the PR title.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/team-playbook.md#pr-template-sections`\n- `.claude/skills/bandwise-builder/references/team-playbook.md#working-rules`\n\nLocal ID: P0-17 (docs/linear-backlog.md)",
      "blockedBy": [],
      "milestone": "Phase 0: Skill, contracts, scaffold",
      "linearId": "NSI-516"
    },
    {
      "localId": "P0-18",
      "project": "Bandwise",
      "title": "Draft and decide ADRs 002 to 006",
      "labels": [
        "Architect",
        "bandwise:adr",
        "Security",
        "bandwise:tenancy",
        "agent-created"
      ],
      "estimate": 5,
      "state": "Todo",
      "description": "Record the open infrastructure decisions before the phases that need them.\n\nAcceptance criteria:\n- ADR-002 picks the auth library: Better Auth with the organization, admin and two-factor plugins (accepted by Nick, 2026-09-26). It supports many orgs per user, invites, five roles and audited impersonation.\n- ADR-003 key vault, ADR-004 cache, ADR-005 jobs runner and ADR-006 billing model are written from `templates/adr.md` and saved in `docs/adr/` with a status line.\n\nRefs:\n- `docs/adr/001-stack.md#open-question-for-adr-002`\n- `.claude/skills/bandwise-builder/templates/adr.md`\n- `.claude/skills/bandwise-builder/references/security.md#typesafe-keys`\n- `.claude/skills/bandwise-builder/references/architecture.md#caching`\n- `.claude/skills/bandwise-builder/references/architecture.md#background-jobs`\n\nNote: Split from the phase-0.md ADR item (P0-06, P0-18): ADRs 007 to 010 must be accepted before the contracts freeze, and ADR-002 must be decided before Phase 2 starts.\n\nLocal ID: P0-18 (docs/linear-backlog.md)",
      "blockedBy": [],
      "milestone": "Phase 0: Skill, contracts, scaffold",
      "linearId": "NSI-517"
    },
    {
      "localId": "P0-19",
      "project": "Bandwise",
      "title": "Pass the Phase 0 exit gate",
      "labels": [
        "Architect",
        "bandwise:contract",
        "agent-created"
      ],
      "estimate": 2,
      "state": "Todo",
      "description": "Confirm Phase 0 is done before Phase 1 starts.\n\nAcceptance criteria:\n- `pnpm i && pnpm turbo lint typecheck test build` passes on the scaffold.\n- Boundary lint catches a deliberate bad import in a test fixture.\n- `openapi.json` has a path for every management operation, and the parity test skeleton runs.\n- The example spec parses as strict `QuestionSetSpec`. Adding a `rollout` key fails with rule `spec.unknown_key` at `/rollout`.\n- Every row in `catalog.ts` parses as `ModelProfile`. A sample `RunResult` round-trips through its zod schema.\n- ADRs 007 to 010 are accepted. Only the ADR-009 Python and Standalone sections stay proposed.\n- Fresh-agent checks pass: \"add a question set feature\" names spec-schema.md, architecture.md and phases/phase-3.md; \"let an agent publish a set\" names management-api.md, security.md and headless-and-agents.md; \"add a new System One model\" names system-one-models.md.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/phases/phase-0.md#exit-gate`\n\nLocal ID: P0-19 (docs/linear-backlog.md)",
      "blockedBy": [
        "P0-12",
        "P0-13",
        "P0-14",
        "P0-15",
        "P0-16",
        "P0-17",
        "P0-18"
      ],
      "milestone": "Phase 0: Skill, contracts, scaffold",
      "linearId": "NSI-518"
    },
    {
      "localId": "P1-01",
      "project": "Bandwise",
      "title": "Build the spec compiler with noul, choice and score modules",
      "labels": [
        "Core Engine",
        "bandwise:contract",
        "agent-created"
      ],
      "estimate": 5,
      "state": "Backlog",
      "description": "Each spec stage compiles to a System One request through one module per question type.\n\nAcceptance criteria:\n- Each `QuestionSetSpec` stage compiles to a `SystemOneRequest` through the `QuestionTypeModule` files in `packages/core/src/question-types`.\n- No per-type logic lives outside `question-types`, so a new type is one module plus a renderer.\n- An answer of unknown type is stored raw with warning `unknown_answer_type`, band `low` and `effectiveAction` `fallback`, and never throws.\n- 100 percent branch coverage.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/spec-schema.md#9-questiontypemodule-and-systemoneanswer`\n- `.claude/skills/bandwise-builder/references/system-one-api-contract.md#request`\n- `.claude/skills/bandwise-builder/references/system-one-api-contract.md#question-types`\n\nLocal ID: P1-01 (docs/linear-backlog.md)",
      "blockedBy": [
        "P0-09"
      ],
      "milestone": "Phase 1: Core engine and data layer",
      "linearId": "NSI-491"
    },
    {
      "localId": "P1-02",
      "project": "Bandwise",
      "title": "Build the stage orchestrator: checks, when, stateFrom and batch split",
      "labels": [
        "Core Engine",
        "bandwise:contract",
        "agent-created"
      ],
      "estimate": 5,
      "state": "Backlog",
      "description": "Runs execute stages in order with pure checks and merged state.\n\nAcceptance criteria:\n- Evaluates `spec.checks` with no System One call and skips a stage whose `when` fails.\n- Merges `answers.<qid> = { value, band }` per `stateFrom`.\n- Splits a stage into parallel batches when it exceeds the profile limits.\n- A question in a skipped stage has no `answers` entry and gets the skipped decision shape in testing.md.\n- `runQuestionSet` runs end to end with a fixture transport and in-memory stores.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/spec-schema.md#4-spec-stages-and-merged-state`\n- `.claude/skills/bandwise-builder/references/spec-schema.md#2-condition`\n- `.claude/skills/bandwise-builder/references/spec-schema.md#3-check`\n- `.claude/skills/bandwise-builder/references/architecture.md#run-data-flow`\n- `.claude/skills/bandwise-builder/references/testing.md#router-tests`\n\nLocal ID: P1-02 (docs/linear-backlog.md)",
      "blockedBy": [
        "P1-01"
      ],
      "milestone": "Phase 1: Core engine and data layer",
      "linearId": "NSI-493"
    },
    {
      "localId": "P1-03",
      "project": "Bandwise",
      "title": "Build the confidence router per the normative table",
      "labels": [
        "Core Engine",
        "bandwise:contract",
        "agent-created"
      ],
      "estimate": 8,
      "state": "Backlog",
      "description": "Bands, actions and effective actions follow the one normative table, enforced only in core.\n\nAcceptance criteria:\n- Covers per-option overrides, noul bands, relevance (`relevantWhen`), composites (level and band), routes (first match wins, then `defaultRoute`), run band and `overallAction` with the order `review > fallback > escalate_to_llm > auto`.\n- `effectiveAction` follows the stage by band by action table on production and staging. Staging dispatches no side-effect handler unless `dispatchActionsOnStaging`. `Decision.executed` follows its rule.\n- `escalate_to_llm` calls `ports.llm` in run step 10. `Decision.value` keeps the System One answer and the LLM result goes in `Decision.escalation`. A missing port, a failure or a timeout gives `effectiveAction` `review` and warning `escalation_failed`.\n- Table-driven tests: one row per normative table row, band edges for every type, relevance, skipped and empty decisions, composites and conservative ordering. 100 percent branch coverage.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/confidence-policy.md#effective-action-by-rollout-stage-normative`\n- `.claude/skills/bandwise-builder/references/confidence-policy.md#band-algorithm`\n- `.claude/skills/bandwise-builder/references/confidence-policy.md#escalation`\n- `.claude/skills/bandwise-builder/references/spec-schema.md#5-relevantwhen`\n- `.claude/skills/bandwise-builder/references/spec-schema.md#6-routes`\n- `.claude/skills/bandwise-builder/references/spec-schema.md#10-composite-terms-level-and-band`\n- `.claude/skills/bandwise-builder/references/testing.md#router-tests`\n\nLocal ID: P1-03 (docs/linear-backlog.md)",
      "blockedBy": [
        "P0-09"
      ],
      "milestone": "Phase 1: Core engine and data layer",
      "linearId": "NSI-496"
    },
    {
      "localId": "P1-04",
      "project": "Bandwise",
      "title": "Implement cost and savings math for all three kinds",
      "labels": [
        "Core Engine",
        "bandwise:models",
        "agent-created"
      ],
      "estimate": 5,
      "state": "Backlog",
      "description": "Every run reports honest cost and savings in integer micro-USD.\n\nAcceptance criteria:\n- Money math uses integer micro-USD and one `round_half_up` per term. Test vector: 318 input tokens on `jev-1.13.0` at 42,000 micro-USD per Mtok cost 13 micro-USD.\n- Each call is priced by its own `modelResolved`. Calls that resolve to different models set warning `model_resolved_mixed`.\n- Decision counterfactual, escalation avoided and context pruned are computed. Only decisions with `effectiveAction` `auto` count toward savings. Shadow, eval, staging and experiment runs report `savingsUsd` 0 with a `savingsSuppressed` reason.\n- An unpriced model gives cost `null` and warning `model_unpriced` in BYO key mode.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/savings-model.md#money-math`\n- `.claude/skills/bandwise-builder/references/savings-model.md#the-three-kinds-of-savings`\n- `.claude/skills/bandwise-builder/references/savings-model.md#honesty-rules`\n- `.claude/skills/bandwise-builder/references/testing.md#cost-and-savings-tests`\n\nLocal ID: P1-04 (docs/linear-backlog.md)",
      "blockedBy": [
        "P0-09"
      ],
      "milestone": "Phase 1: Core engine and data layer",
      "linearId": "NSI-499"
    },
    {
      "localId": "P1-05",
      "project": "Bandwise",
      "title": "Add token preflight from ModelProfile limits",
      "labels": [
        "Core Engine",
        "bandwise:models",
        "agent-created"
      ],
      "estimate": 2,
      "state": "Backlog",
      "description": "Oversized requests fail fast, with limits read from the model profile.\n\nAcceptance criteria:\n- Limits come from the profile (`statePlusLongestQuestionTokens`, `requestTokens`), never constants. A moving name uses the profile of its last observed resolved model.\n- Warns at 80 percent and fails fast with `preflight_too_large`.\n- A fake 16k profile blocks a 20k state, and the `jev-1.13.0` profile lets the same state through.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/system-one-models.md#7-limits-as-data`\n- `.claude/skills/bandwise-builder/references/architecture.md#run-data-flow`\n- `.claude/skills/bandwise-builder/references/testing.md#model-registry-tests`\n\nLocal ID: P1-05 (docs/linear-backlog.md)",
      "blockedBy": [
        "P0-09",
        "P0-13"
      ],
      "milestone": "Phase 1: Core engine and data layer",
      "linearId": "NSI-501"
    },
    {
      "localId": "P1-06",
      "project": "Bandwise",
      "title": "Implement lints with stable rule ids, including model and weakness lints",
      "labels": [
        "Core Engine",
        "bandwise:models",
        "bandwise:contract",
        "agent-created"
      ],
      "estimate": 5,
      "state": "Backlog",
      "description": "Specs get the same pure lint results in the editor and at publish.\n\nAcceptance criteria:\n- `lint(spec, profile, publishCtx?)` returns `{ rule, severity, path, message }` with `path` as a JSON Pointer, for every rule in the lint and weakness tables.\n- Lints that need a `PublishCtx` field are skipped when it is absent.\n- Each model lint fires on a minimal bad spec and stays quiet on a clean one. Weakness lints fire only when the profile lists the weakness.\n- `templates/question-set.example.json` lints with zero errors against the `jev-1.13.0` seed profile.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/architecture.md#lints-packagescoresrclints`\n- `.claude/skills/bandwise-builder/references/architecture.md#model-weakness-lints`\n- `.claude/skills/bandwise-builder/references/system-one-models.md#10-weaknesses`\n- `.claude/skills/bandwise-builder/references/testing.md#model-registry-tests`\n\nLocal ID: P1-06 (docs/linear-backlog.md)",
      "blockedBy": [
        "P0-09",
        "P0-13"
      ],
      "milestone": "Phase 1: Core engine and data layer",
      "linearId": "NSI-503"
    },
    {
      "localId": "P1-07",
      "project": "Bandwise",
      "title": "Implement interfaceOf and diffInterface",
      "labels": [
        "Core Engine",
        "bandwise:contract",
        "agent-created"
      ],
      "estimate": 3,
      "state": "Backlog",
      "description": "Interface changes between versions are computed, so breaking changes fail loudly later.\n\nAcceptance criteria:\n- `interfaceOf(spec)` returns a `SetInterface`.\n- `diffInterface(from, to)` returns `{ breaking, additive }`, with a table test for each change type in spec-schema.md section 11.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/spec-schema.md#11-setinterface`\n- `.claude/skills/bandwise-builder/references/deploy-and-codegen.md#5-set-interface-and-compatibility`\n\nLocal ID: P1-07 (docs/linear-backlog.md)",
      "blockedBy": [
        "P0-09"
      ],
      "milestone": "Phase 1: Core engine and data layer",
      "linearId": "NSI-505"
    },
    {
      "localId": "P1-08",
      "project": "Bandwise",
      "title": "Write the authz.ts role matrix",
      "labels": [
        "Core Engine",
        "Security",
        "bandwise:tenancy",
        "agent-created"
      ],
      "estimate": 2,
      "state": "Backlog",
      "description": "One `can()` decides every permission for every caller.\n\nAcceptance criteria:\n- `can(ctx, action, resource)` in `packages/core/src/authz.ts` covers the five roles, scopes and resource rules such as protected sets needing an admin to publish.\n- For agent tokens the effective role is min(role ceiling, membership role), and both scope and role are required.\n- A table test covers each role and scope.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/data-model.md#roles`\n- `.claude/skills/bandwise-builder/references/security.md#authorization`\n- `.claude/skills/bandwise-builder/references/security.md#agent-tokens`\n\nLocal ID: P1-08 (docs/linear-backlog.md)",
      "blockedBy": [
        "P0-09"
      ],
      "milestone": "Phase 1: Core engine and data layer",
      "linearId": "NSI-508"
    },
    {
      "localId": "P1-09",
      "project": "Bandwise",
      "title": "Build system-one-client with SDK and fixture transports",
      "labels": [
        "Core Engine",
        "bandwise:models",
        "Security",
        "agent-created"
      ],
      "estimate": 8,
      "state": "Backlog",
      "description": "One package owns every System One call, its errors and its fixtures.\n\nAcceptance criteria:\n- `SdkTransport` is the only importer of `@typesafe-ai/sdk`. Every client has an explicit `baseURL`, `defaultModel`, `logLevel: 'warn'` and a scrubbing logger.\n- Errors map to `system_one_*` codes, and every row of the errors table has a unit test, including 400, 403, 404, 408, `APIUserAbortError` and a timeout.\n- Per-surface timeouts and retry budgets configure the SDK's own retries, with no second retry loop. Request ids are captured. Clients are cached per org.\n- Model list and alias probe helpers exist.\n- `FixtureTransport` ships as its own subpath export that never imports `@typesafe-ai/sdk`.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/system-one-api-contract.md#errors`\n- `.claude/skills/bandwise-builder/references/system-one-api-contract.md#js-sdk-usage`\n- `.claude/skills/bandwise-builder/references/architecture.md#latency-budgets`\n- `.claude/skills/bandwise-builder/references/security.md#typesafe-keys`\n- `.claude/skills/bandwise-builder/references/testing.md#fixtures`\n\nLocal ID: P1-09 (docs/linear-backlog.md)",
      "blockedBy": [
        "P0-09"
      ],
      "milestone": "Phase 1: Core engine and data layer",
      "linearId": "NSI-510"
    },
    {
      "localId": "P1-10",
      "project": "Bandwise",
      "title": "Build llm-client with the LlmTransport port and a fixture transport",
      "labels": [
        "Core Engine",
        "agent-created"
      ],
      "estimate": 2,
      "state": "Backlog",
      "description": "Studio drafting, improve mode, opportunity drafting and escalation share one metered LLM port.\n\nAcceptance criteria:\n- `llm-client` is the only importer of `@anthropic-ai/sdk`.\n- `LlmTransport.complete` matches architecture.md and returns model and token counts for metering.\n- A fixture transport serves tests. Model ids come from the claude-api skill, not guesses.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/architecture.md#ports`\n- `.claude/skills/bandwise-builder/references/architecture.md#packages-and-boundaries`\n\nLocal ID: P1-10 (docs/linear-backlog.md)",
      "blockedBy": [
        "P0-09"
      ],
      "milestone": "Phase 1: Core engine and data layer",
      "linearId": "NSI-512"
    },
    {
      "localId": "P1-11",
      "project": "Bandwise",
      "title": "Build bandwise run --local in packages/cli/src/local",
      "labels": [
        "Integrations",
        "bandwise:headless",
        "agent-created"
      ],
      "estimate": 3,
      "state": "Backlog",
      "description": "A developer runs a spec locally with no network and no key.\n\nAcceptance criteria:\n- `pnpm bandwise run --local spec.json state.json` runs `templates/question-set.example.json` on the fixture transport, with no network access and no `TYPESAFE_API_KEY`.\n- The code lives in `packages/cli/src/local/**`, imports only `core` and the fixture subpath of `system-one-client`, and loads through a dynamic import.\n- The boundary lint rejects a deliberate import of the SDK transport from `packages/cli/src/local/**`.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/phases/phase-1.md#integrations`\n- `.claude/skills/bandwise-builder/references/architecture.md#packages-and-boundaries`\n- `.claude/skills/bandwise-builder/references/headless-and-agents.md#datasets-evals-and-runs`\n\nLocal ID: P1-11 (docs/linear-backlog.md)",
      "blockedBy": [
        "P1-02",
        "P1-03",
        "P1-09",
        "P0-08"
      ],
      "milestone": "Phase 1: Core engine and data layer",
      "linearId": "NSI-515"
    },
    {
      "localId": "P1-12",
      "project": "Bandwise",
      "title": "Write the full Drizzle schema with RLS in migration 0001",
      "labels": [
        "Platform / Tenancy",
        "bandwise:tenancy",
        "bandwise:models",
        "agent-created"
      ],
      "estimate": 8,
      "state": "Backlog",
      "description": "Tenancy is in the schema from the first migration.\n\nAcceptance criteria:\n- Every table in data-model.md exists, with `org_id`, an RLS policy from the template and an `org_id` index on every tenant table, in migration 0001.\n- The platform tables `system_one_models` (seeded from `catalog.ts`) and `model_alias_observations` have no `org_id`.\n- Money columns are integer micro-USD. Rollout exists only on `release_pointers`.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/data-model.md#tables`\n- `.claude/skills/bandwise-builder/references/data-model.md#rls-policy-template`\n- `.claude/skills/bandwise-builder/references/data-model.md#platform-tables-no-org_id`\n- `.claude/skills/bandwise-builder/references/data-model.md#migrations`\n\nLocal ID: P1-12 (docs/linear-backlog.md)",
      "blockedBy": [
        "P0-09"
      ],
      "milestone": "Phase 1: Core engine and data layer",
      "linearId": "NSI-519"
    },
    {
      "localId": "P1-13",
      "project": "Bandwise",
      "title": "Implement withTenant with transaction-local set_config",
      "labels": [
        "Platform / Tenancy",
        "bandwise:tenancy",
        "agent-created"
      ],
      "estimate": 2,
      "state": "Backlog",
      "description": "Every query runs inside one tenant context.\n\nAcceptance criteria:\n- `withTenant(ctx, fn)` opens a transaction and sets `app.org_id` transaction-locally.\n- All DB access goes through it.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/data-model.md#tenancy-rules`\n- `.claude/skills/bandwise-builder/references/data-model.md#rls-policy-template`\n\nLocal ID: P1-13 (docs/linear-backlog.md)",
      "blockedBy": [
        "P1-12"
      ],
      "milestone": "Phase 1: Core engine and data layer",
      "linearId": "NSI-520"
    },
    {
      "localId": "P1-14",
      "project": "Bandwise",
      "title": "Add the RLS setting test for app.org_id",
      "labels": [
        "Platform / Tenancy",
        "bandwise:tenancy",
        "Security",
        "agent-created"
      ],
      "estimate": 1,
      "state": "Backlog",
      "description": "A wrong RLS setting name fails CI.\n\nAcceptance criteria:\n- A schema scan fails on any policy or `withTenant` call that uses a setting name other than `app.org_id`.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/testing.md#security-tests`\n- `.claude/skills/bandwise-builder/references/data-model.md#rls-policy-template`\n\nLocal ID: P1-14 (docs/linear-backlog.md)",
      "blockedBy": [
        "P1-12",
        "P1-13"
      ],
      "milestone": "Phase 1: Core engine and data layer",
      "linearId": "NSI-521"
    },
    {
      "localId": "P1-15",
      "project": "Bandwise",
      "title": "Add repositories for every table with no raw db export",
      "labels": [
        "Platform / Tenancy",
        "bandwise:tenancy",
        "agent-created"
      ],
      "estimate": 5,
      "state": "Backlog",
      "description": "All data access goes through tenant-scoped repositories.\n\nAcceptance criteria:\n- One repository per table. `packages/db` exports no raw `db` handle.\n- Every repository method runs inside `withTenant`.\n- Adding a repository without adding it to the cross-tenant suite fails CI.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/data-model.md#migrations`\n- `.claude/skills/bandwise-builder/references/testing.md#cross-tenant-suite`\n\nLocal ID: P1-15 (docs/linear-backlog.md)",
      "blockedBy": [
        "P1-13"
      ],
      "milestone": "Phase 1: Core engine and data layer",
      "linearId": "NSI-523"
    },
    {
      "localId": "P1-16",
      "project": "Bandwise",
      "title": "Add the immutability trigger on published versions",
      "labels": [
        "Platform / Tenancy",
        "agent-created"
      ],
      "estimate": 1,
      "state": "Backlog",
      "description": "Published versions can never change.\n\nAcceptance criteria:\n- A DB trigger rejects any update to a published version's spec, and a test proves it.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/data-model.md#invariants-tested`\n\nLocal ID: P1-16 (docs/linear-backlog.md)",
      "blockedBy": [
        "P1-12"
      ],
      "milestone": "Phase 1: Core engine and data layer",
      "linearId": "NSI-526"
    },
    {
      "localId": "P1-17",
      "project": "Bandwise",
      "title": "Add the two-org seed",
      "labels": [
        "Platform / Tenancy",
        "bandwise:tenancy",
        "agent-created"
      ],
      "estimate": 2,
      "state": "Backlog",
      "description": "Tests start from two orgs with real-looking data.\n\nAcceptance criteria:\n- A seed creates two orgs, each with members, a goal, a set and runs.\n- The cross-tenant suite and Playwright use it.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/data-model.md#identity-and-tenancy`\n- `.claude/skills/bandwise-builder/references/testing.md#cross-tenant-suite`\n\nLocal ID: P1-17 (docs/linear-backlog.md)",
      "blockedBy": [
        "P1-15"
      ],
      "milestone": "Phase 1: Core engine and data layer",
      "linearId": "NSI-527"
    },
    {
      "localId": "P1-18",
      "project": "Bandwise",
      "title": "Add dev implementations: local KEK vault, in-memory limiter and quota",
      "labels": [
        "Platform / Tenancy",
        "Security",
        "agent-created"
      ],
      "estimate": 3,
      "state": "Backlog",
      "description": "Everyone can run the stack locally with no cloud services.\n\nAcceptance criteria:\n- A `KeyResolver` backed by a `BANDWISE_KEK` envelope vault for dev, with an encrypt and decrypt round-trip test.\n- In-memory `RateLimiter` and `QuotaGuard` match the port signatures.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/architecture.md#ports`\n- `.claude/skills/bandwise-builder/references/security.md#typesafe-keys`\n- `.claude/skills/bandwise-builder/references/testing.md#security-tests`\n\nLocal ID: P1-18 (docs/linear-backlog.md)",
      "blockedBy": [
        "P0-09"
      ],
      "milestone": "Phase 1: Core engine and data layer",
      "linearId": "NSI-530"
    },
    {
      "localId": "P1-19",
      "project": "Bandwise",
      "title": "Implement RunSink over the repositories",
      "labels": [
        "Platform / Tenancy",
        "bandwise:tenancy",
        "bandwise:models",
        "agent-created"
      ],
      "estimate": 3,
      "state": "Backlog",
      "description": "A run and everything it creates are written in one transaction.\n\nAcceptance criteria:\n- `RunSink.persist` writes the run, action review items, usage events with the resolved model and the `model_alias_observations` update in one transaction. Label items join once the audit sampler lands (P3-30).\n- A new `model_requested` to `model_resolved` pair emits `model.alias_moved` once.\n- Usage events exist for every successful run.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/architecture.md#ports`\n- `.claude/skills/bandwise-builder/references/architecture.md#run-data-flow`\n- `.claude/skills/bandwise-builder/references/data-model.md#runs-partitioned-by-month`\n\nNote: Added: phase-1.md has no line for RunSink, but the Phase 1 exit gate needs usage events for every run.\n\nLocal ID: P1-19 (docs/linear-backlog.md)",
      "blockedBy": [
        "P1-15"
      ],
      "milestone": "Phase 1: Core engine and data layer",
      "linearId": "NSI-532"
    },
    {
      "localId": "P1-20",
      "project": "Bandwise",
      "title": "Run the registry sync, alias probe and contract watch jobs",
      "labels": [
        "Platform / Tenancy",
        "bandwise:models",
        "agent-created"
      ],
      "estimate": 5,
      "state": "Backlog",
      "description": "New models, moved aliases and TypeSafe contract changes are detected from Phase 1.\n\nAcceptance criteria:\n- Registry sync (nightly) lists `/v1/models` per org key, stores the reachable names in `org_typesafe_keys.models`, inserts unseen names as `unreviewed` and alerts the platform admin. An unseen `foo-2.0.0` is covered by a test.\n- The alias probe sends a one-noul request for idle aliases and records the response `model`.\n- Contract watch (nightly) diffs TypeSafe's `openapi.json`, `llms.txt` and `models.md` against committed snapshots, then alerts and opens an issue for the Architect on a change.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/architecture.md#background-jobs`\n- `.claude/skills/bandwise-builder/references/system-one-models.md#6-detection`\n- `.claude/skills/bandwise-builder/references/testing.md#model-registry-tests`\n\nNote: phase-3.md says these jobs run from Phase 1. The matching Platform line in phase-1.md is a pending edit.\n\nLocal ID: P1-20 (docs/linear-backlog.md)",
      "blockedBy": [
        "P1-09",
        "P1-15",
        "P1-18"
      ],
      "milestone": "Phase 1: Core engine and data layer",
      "linearId": "NSI-536"
    },
    {
      "localId": "P1-21",
      "project": "Bandwise",
      "title": "Record the minimum fixture set, including an alias-resolved response",
      "labels": [
        "QA / Evals",
        "bandwise:models",
        "agent-created"
      ],
      "estimate": 3,
      "state": "Backlog",
      "description": "Tests run on recorded System One responses, never live calls.\n\nAcceptance criteria:\n- Fixtures live in `packages/system-one-client/fixtures/*.json` as `{ request, response, openapiVersion }`.\n- The set covers one of each question type, a multi-stage run, a choice with a none option chosen, a noul near 0.5, `jev-latest` answered by `jev-1.13.0`, and 401, 422, 429 and 529 errors.\n- `pnpm fixtures:record [--model <id>]` re-records and scrubs headers and ids.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/testing.md#fixtures`\n\nLocal ID: P1-21 (docs/linear-backlog.md)",
      "blockedBy": [
        "P1-09"
      ],
      "milestone": "Phase 1: Core engine and data layer",
      "linearId": "NSI-540"
    },
    {
      "localId": "P1-22",
      "project": "Bandwise",
      "title": "Add the fixture contract test against zod",
      "labels": [
        "QA / Evals",
        "bandwise:contract",
        "agent-created"
      ],
      "estimate": 2,
      "state": "Backlog",
      "description": "A changed System One shape fails CI, and new fields pass.\n\nAcceptance criteria:\n- Every fixture response validates against the passthrough answer schemas.\n- The test fails when the committed contract snapshot's `openapi.json` version is newer than the fixtures' version. PR CI needs no network.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/testing.md#fixtures`\n\nLocal ID: P1-22 (docs/linear-backlog.md)",
      "blockedBy": [
        "P1-21"
      ],
      "milestone": "Phase 1: Core engine and data layer",
      "linearId": "NSI-541"
    },
    {
      "localId": "P1-23",
      "project": "Bandwise",
      "title": "Add the pinned-classification table test",
      "labels": [
        "QA / Evals",
        "bandwise:models",
        "agent-created"
      ],
      "estimate": 1,
      "state": "Backlog",
      "description": "Pinned versus moving comes from the registry only.\n\nAcceptance criteria:\n- `jev-latest`, `jev-preview`, `jev` and `jev-1.13` are moving, `jev-1.13.0` is pinned, and an unseen `foo-2.0.0` is moving.\n- Classification reads the registry `kind` only, never a pattern match.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/testing.md#model-registry-tests`\n- `.claude/skills/bandwise-builder/references/system-one-models.md#4-pinned-or-moving`\n\nLocal ID: P1-23 (docs/linear-backlog.md)",
      "blockedBy": [
        "P0-13"
      ],
      "milestone": "Phase 1: Core engine and data layer",
      "linearId": "NSI-543"
    },
    {
      "localId": "P1-24",
      "project": "Bandwise",
      "title": "Build the packages/evals CLI",
      "labels": [
        "QA / Evals",
        "bandwise:models",
        "agent-created"
      ],
      "estimate": 5,
      "state": "Backlog",
      "description": "Internal evals score a version on a dataset with the metrics the gates use.\n\nAcceptance criteria:\n- `pnpm eval --org <slug> --set <slug> --version <n> --dataset <name> [--snapshot <id>] [--model <id>]` runs. Without `--snapshot` it takes a new snapshot.\n- Metrics per question (accuracy, MAE, Brier, confusion matrix) and per band (precision with its 95 percent Wilson lower bound, coverage, review load, ECE), plus cost and latency.\n- `eval_runs` record `model` and `snapshot_id`. `--model` evaluates without publishing.\n- `--repeats` and the stability metric land in P3b-27.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/testing.md#evals-packagesevals`\n\nLocal ID: P1-24 (docs/linear-backlog.md)",
      "blockedBy": [
        "P1-02",
        "P1-03",
        "P1-04",
        "P1-15"
      ],
      "milestone": "Phase 1: Core engine and data layer",
      "linearId": "NSI-546"
    },
    {
      "localId": "P1-25",
      "project": "Bandwise",
      "title": "Build the cross-tenant suite generator",
      "labels": [
        "QA / Evals",
        "bandwise:tenancy",
        "Security",
        "agent-created"
      ],
      "estimate": 3,
      "state": "Backlog",
      "description": "Tenant isolation is tested for every repository method, automatically.\n\nAcceptance criteria:\n- Generated from the repository list: with org A's context, a method cannot read or write org B's rows.\n- With the repository's org filter bypassed, RLS alone returns zero rows.\n- Route checks (org B's token on an org A resource returns 404) are added as routes land.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/testing.md#cross-tenant-suite`\n\nLocal ID: P1-25 (docs/linear-backlog.md)",
      "blockedBy": [
        "P1-15",
        "P1-17"
      ],
      "milestone": "Phase 1: Core engine and data layer",
      "linearId": "NSI-549"
    },
    {
      "localId": "P1-26",
      "project": "Bandwise",
      "title": "Add the live smoke script for the smoke list models",
      "labels": [
        "QA / Evals",
        "bandwise:models",
        "agent-created"
      ],
      "estimate": 2,
      "state": "Backlog",
      "description": "Nightly smoke catches live System One changes the fixtures cannot.\n\nAcceptance criteria:\n- `pnpm smoke` is skipped without `TYPESAFE_API_KEY`. `--model <id>` runs one model.\n- The smoke list is `jev-preview`, `jev-latest`, each pinned version in use and every registry model with status `preview` or `stable`.\n- Per model: one call per question type in the profile and one two-stage run. Asserts the response shape, `usage.input_tokens > 0`, a versioned id in the response `model`, and total cost under $0.001.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/testing.md#live-smoke-pnpm-smoke`\n\nLocal ID: P1-26 (docs/linear-backlog.md)",
      "blockedBy": [
        "P1-09"
      ],
      "milestone": "Phase 1: Core engine and data layer",
      "linearId": "NSI-551"
    },
    {
      "localId": "P1-27",
      "project": "Bandwise",
      "title": "Pass the Phase 1 exit gate",
      "labels": [
        "QA / Evals",
        "bandwise:tenancy",
        "bandwise:models",
        "agent-created"
      ],
      "estimate": 3,
      "state": "Backlog",
      "description": "Confirm Phase 1 is done before Phase 2 starts.\n\nAcceptance criteria:\n- A spec runs end to end against fixtures and returns a valid `RunResult` with bands, actions, cost and savings.\n- Router and compiler at 100 percent branch coverage.\n- Usage events are written for every run, each with the resolved model.\n- The cross-tenant suite passes, including with the repository filter bypassed.\n- `pnpm smoke` passes when `TYPESAFE_API_KEY` is set.\n- Preflight limits come from the profile: a fake 16k profile blocks a 20k state.\n- An unknown answer type is stored raw and never throws.\n- `templates/question-set.example.json` lints with zero errors against the `jev-1.13.0` seed profile.\n- `pnpm bandwise run --local` runs the demo spec with no network access and no `TYPESAFE_API_KEY`.\n- The boundary lint rejects a deliberate import of the SDK transport from `packages/cli/src/local/**`.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/phases/phase-1.md#exit-gate`\n\nLocal ID: P1-27 (docs/linear-backlog.md)",
      "blockedBy": [
        "P1-05",
        "P1-06",
        "P1-07",
        "P1-08",
        "P1-10",
        "P1-11",
        "P1-14",
        "P1-16",
        "P1-19",
        "P1-20",
        "P1-22",
        "P1-23",
        "P1-24",
        "P1-25",
        "P1-26"
      ],
      "milestone": "Phase 1: Core engine and data layer",
      "linearId": "NSI-552"
    },
    {
      "localId": "P2-01",
      "project": "Bandwise",
      "title": "Wire auth per ADR-002: orgs, memberships, invites, roles, active org",
      "labels": [
        "Platform / Tenancy",
        "bandwise:tenancy",
        "Security",
        "agent-created"
      ],
      "estimate": 8,
      "state": "Backlog",
      "description": "People sign in, belong to many orgs, and act in one active org at a time.\n\nAcceptance criteria:\n- The ADR-002 library signs users in. `organizations` and `memberships` hold five roles. Invites are 7-day token links. One user can hold many orgs and picks the active org.\n- `org.create` (session only) makes the caller the owner.\n- `member.list`, `member.invite`, `member.role_change` and `member.remove` exist as operations. Invites and removals count as role changes. Changing a member to or from owner needs the owner role.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/phases/phase-2.md#platform--tenancy`\n- `.claude/skills/bandwise-builder/references/data-model.md#identity-and-tenancy`\n- `.claude/skills/bandwise-builder/references/data-model.md#roles`\n- `.claude/skills/bandwise-builder/references/management-api.md#identity-tokens-and-admin`\n\nLocal ID: P2-01 (docs/linear-backlog.md)",
      "blockedBy": [
        "P0-18",
        "P1-15"
      ],
      "milestone": "Phase 2: Tenancy, auth, keys, billing",
      "linearId": "NSI-522"
    },
    {
      "localId": "P2-02",
      "project": "Bandwise",
      "title": "Add the org switcher and /[orgSlug] routing",
      "labels": [
        "Platform / Tenancy",
        "bandwise:tenancy",
        "agent-created"
      ],
      "estimate": 3,
      "state": "Backlog",
      "description": "Every tenant page is scoped by its org slug.\n\nAcceptance criteria:\n- Every tenant page lives under `/[orgSlug]`, and switching org switches the tenant context.\n- A user in three orgs sees no data from the other two (Playwright, SGR, Personal and Dallas style seed).\n\nRefs:\n- `.claude/skills/bandwise-builder/references/phases/phase-2.md#platform--tenancy`\n- `.claude/skills/bandwise-builder/references/data-model.md#tenancy-rules`\n\nLocal ID: P2-02 (docs/linear-backlog.md)",
      "blockedBy": [
        "P2-01"
      ],
      "milestone": "Phase 2: Tenancy, auth, keys, billing",
      "linearId": "NSI-524"
    },
    {
      "localId": "P2-03",
      "project": "Bandwise",
      "title": "Build the BYO key vault with envelope encryption and validation",
      "labels": [
        "Platform / Tenancy",
        "Security",
        "bandwise:models",
        "agent-created"
      ],
      "estimate": 5,
      "state": "Backlog",
      "description": "Org TypeSafe keys are stored encrypted and never leave the server.\n\nAcceptance criteria:\n- A per-org DEK (AES-256-GCM) is wrapped by KMS in production and `BANDWISE_KEK` in dev. Only `tenancy.KeyResolver` decrypts, plaintext is cached for at most 5 minutes, and the UI shows `key_last4` and a fingerprint only.\n- Saving validates the key with `GET /v1/models` and stores the reachable names in `org_typesafe_keys.models`.\n- `key.get`, `key.rotate` (also saves the first key) and `key.revoke` exist as operations. A 401 from TypeSafe marks the key invalid and emits `key.invalid`.\n- KEK rotation re-wraps DEKs in a background job.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/security.md#typesafe-keys`\n- `.claude/skills/bandwise-builder/references/management-api.md#identity-tokens-and-admin`\n- `.claude/skills/bandwise-builder/references/data-model.md#keys-and-agent-tokens`\n\nLocal ID: P2-03 (docs/linear-backlog.md)",
      "blockedBy": [
        "P1-18",
        "P1-09",
        "P2-01"
      ],
      "milestone": "Phase 2: Tenancy, auth, keys, billing",
      "linearId": "NSI-525"
    },
    {
      "localId": "P2-04",
      "project": "Bandwise",
      "title": "Add platform key mode",
      "labels": [
        "Platform / Tenancy",
        "Security",
        "agent-created"
      ],
      "estimate": 2,
      "state": "Backlog",
      "description": "Orgs without their own key can run on the platform key, metered and capped.\n\nAcceptance criteria:\n- An org can run on the platform TypeSafe key. Usage is metered to its Stripe subscription and capped by plan.\n- An unpriced model returns `422 model_unpriced` in platform key mode.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/security.md#typesafe-keys`\n- `.claude/skills/bandwise-builder/references/testing.md#model-registry-tests`\n\nLocal ID: P2-04 (docs/linear-backlog.md)",
      "blockedBy": [
        "P2-03"
      ],
      "milestone": "Phase 2: Tenancy, auth, keys, billing",
      "linearId": "NSI-528"
    },
    {
      "localId": "P2-05",
      "project": "Bandwise",
      "title": "Add app tokens: sk_live_, sk_test_ and pk_live_",
      "labels": [
        "Platform / Tenancy",
        "Security",
        "bandwise:tenancy",
        "agent-created"
      ],
      "estimate": 5,
      "state": "Backlog",
      "description": "Host apps call Bandwise with scoped, channel-bound tokens.\n\nAcceptance criteria:\n- Create (shown once, stored as sha256 with a pepper), scopes, set allowlist, origins, channel binding (production by default), expiry, revoke and `last_used_at`.\n- `runs:write` and `feedback:write` exist only on `sk_` tokens. `pk_` tokens are run-only with an origin check.\n- `app.list`, `app.create`, `app.update`, `app_token.create` and `app_token.revoke` exist as operations (admin). A token with a write scope is `high*` for agents, except `feedback:write` on an `sk_test_` token bound to staging.\n- Revocation takes effect within 60 seconds.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/security.md#app-tokens`\n- `.claude/skills/bandwise-builder/references/management-api.md#apps-and-integration`\n- `.claude/skills/bandwise-builder/references/data-model.md#keys-and-agent-tokens`\n\nLocal ID: P2-05 (docs/linear-backlog.md)",
      "blockedBy": [
        "P2-01"
      ],
      "milestone": "Phase 2: Tenancy, auth, keys, billing",
      "linearId": "NSI-529"
    },
    {
      "localId": "P2-06",
      "project": "Bandwise",
      "title": "Add agent tokens (sa_live_) with role ceiling, scopes and expiry",
      "labels": [
        "Platform / Tenancy",
        "Security",
        "bandwise:headless",
        "agent-created"
      ],
      "estimate": 5,
      "state": "Backlog",
      "description": "Agents act for one user in one org and never above that user's role.\n\nAcceptance criteria:\n- Created in settings with scopes from the final scope list, a role ceiling, a 90-day maximum expiry and an optional daily spend cap (`402 token_budget_exceeded`).\n- Effective role is min(ceiling, current membership role), read on every request. Demoting the user removes the permission on the next request.\n- A token mints only tokens with scopes it holds and never `admin:write`. A token can always revoke itself.\n- `agent_token.list`, `agent_token.create`, `agent_token.revoke` and `actor.get` exist as operations.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/security.md#agent-tokens`\n- `.claude/skills/bandwise-builder/references/management-api.md#identity-tokens-and-admin`\n- `.claude/skills/bandwise-builder/references/data-model.md#keys-and-agent-tokens`\n\nLocal ID: P2-06 (docs/linear-backlog.md)",
      "blockedBy": [
        "P2-01"
      ],
      "milestone": "Phase 2: Tenancy, auth, keys, billing",
      "linearId": "NSI-531"
    },
    {
      "localId": "P2-07",
      "project": "Bandwise",
      "title": "Build the device flow for agent tokens (RFC 8628)",
      "labels": [
        "Platform / Tenancy",
        "Security",
        "bandwise:headless",
        "agent-created"
      ],
      "estimate": 3,
      "state": "Backlog",
      "description": "The CLI, MCP server and Chrome extension get agent tokens without copying secrets.\n\nAcceptance criteria:\n- `POST /api/v1/auth/device/code` and `POST /api/v1/auth/device/token` are plain route handlers.\n- The person approves in a console session and picks the org, scopes and a ceiling no higher than their own role.\n- Codes are single use and expire after 10 minutes. The token records its client (cli, mcp or extension).\n\nRefs:\n- `.claude/skills/bandwise-builder/references/security.md#agent-tokens`\n- `.claude/skills/bandwise-builder/references/management-api.md#auth-device-flow`\n\nLocal ID: P2-07 (docs/linear-backlog.md)",
      "blockedBy": [
        "P2-06"
      ],
      "milestone": "Phase 2: Tenancy, auth, keys, billing",
      "linearId": "NSI-533"
    },
    {
      "localId": "P2-08",
      "project": "Bandwise",
      "title": "Implement runOperation steps: actor, validation, can() and If-Match",
      "labels": [
        "Platform / Tenancy",
        "bandwise:headless",
        "Security",
        "agent-created"
      ],
      "estimate": 8,
      "state": "Backlog",
      "description": "Every caller goes through the same operation pipeline.\n\nAcceptance criteria:\n- The runOperation steps run in the documented order: `400 invalid_request` with `details`, `403 insufficient_scope` in the caller's org, `404` across orgs or outside the set allowlist. Session-only operations refuse tokens.\n- `If-Match`: `428` when missing, `412 precondition_failed` with `currentEtag` on mismatch.\n- Dry runs run steps 1 to 6 and `op.preview`, and write nothing.\n- Events for `op.emits` are written in the same transaction.\n- Server Actions and generated route handlers are thin adapters over `runOperation`.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/management-api.md#runoperation`\n- `.claude/skills/bandwise-builder/references/management-api.md#adapters`\n- `.claude/skills/bandwise-builder/references/management-api.md#draft-concurrency`\n- `.claude/skills/bandwise-builder/references/management-api.md#dry-runs`\n\nLocal ID: P2-08 (docs/linear-backlog.md)",
      "blockedBy": [
        "P0-11",
        "P1-08",
        "P2-06"
      ],
      "milestone": "Phase 2: Tenancy, auth, keys, billing",
      "linearId": "NSI-534"
    },
    {
      "localId": "P2-09",
      "project": "Bandwise",
      "title": "Add approval_requests and the approval step in runOperation",
      "labels": [
        "Platform / Tenancy",
        "bandwise:headless",
        "Security",
        "agent-created"
      ],
      "estimate": 5,
      "state": "Backlog",
      "description": "High-risk agent operations wait for a person.\n\nAcceptance criteria:\n- A high-risk agent call returns `202 { approval: { id, status, url, expiresAt } }`, stores the input, `input_hash` and `If-Match`, and emits `approval.requested`. A repeat call for the same operation and `input_hash` returns the same request.\n- `approval.list`, `approval.get` and `approval.decide` (session only) exist as operations. An approved request runs its stored input unchanged with `approval_id`. A changed draft fails with 412 and nothing publishes.\n- Requests expire after 7 days. Moves toward safety are never gated.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/management-api.md#approvals`\n- `.claude/skills/bandwise-builder/references/security.md#approval-gate`\n\nLocal ID: P2-09 (docs/linear-backlog.md)",
      "blockedBy": [
        "P2-08"
      ],
      "milestone": "Phase 2: Tenancy, auth, keys, billing",
      "linearId": "NSI-535"
    },
    {
      "localId": "P2-10",
      "project": "Bandwise",
      "title": "Add the agentApprovals org setting and the always-gated list",
      "labels": [
        "Platform / Tenancy",
        "Security",
        "bandwise:headless",
        "agent-created"
      ],
      "estimate": 2,
      "state": "Backlog",
      "description": "Orgs choose how much agents may do without a person, within fixed limits.\n\nAcceptance criteria:\n- Values `required` (default), `production_only` and `off`.\n- Always gated whatever the setting: key rotation or revocation, member role changes, PII and retention changes, org deletion, `admin:write` token creation and lowering `agentApprovals`.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/security.md#approval-gate`\n- `.claude/skills/bandwise-builder/references/management-api.md#catalog`\n\nLocal ID: P2-10 (docs/linear-backlog.md)",
      "blockedBy": [
        "P2-09"
      ],
      "milestone": "Phase 2: Tenancy, auth, keys, billing",
      "linearId": "NSI-537"
    },
    {
      "localId": "P2-11",
      "project": "Bandwise",
      "title": "Add idempotency middleware on idempotency_keys",
      "labels": [
        "Platform / Tenancy",
        "bandwise:headless",
        "agent-created"
      ],
      "estimate": 3,
      "state": "Backlog",
      "description": "Retries from apps and agents never apply twice.\n\nAcceptance criteria:\n- `Idempotency-Key` is required on mutations from app and agent tokens (`400` when missing). Runs and feedback are the documented exceptions.\n- Keys live 24 hours and are written in the operation's transaction. A replay returns the stored response with `Idempotent-Replayed: true`.\n- The same key with a different body returns `422 idempotency_key_reused`.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/management-api.md#idempotency-keys`\n\nLocal ID: P2-11 (docs/linear-backlog.md)",
      "blockedBy": [
        "P2-08"
      ],
      "milestone": "Phase 2: Tenancy, auth, keys, billing",
      "linearId": "NSI-538"
    },
    {
      "localId": "P2-12",
      "project": "Bandwise",
      "title": "Serve runs through set.run on POST /api/v1/sets/{ref}/run",
      "labels": [
        "Platform / Tenancy",
        "bandwise:tenancy",
        "bandwise:models",
        "agent-created"
      ],
      "estimate": 5,
      "state": "Backlog",
      "description": "Apps, agents and the console run sets through one operation.\n\nAcceptance criteria:\n- `set.run` takes a `RunRequest` and returns `RunResult`, or `RunDryRunResult` when `options.dryRun` is set, following the run data flow. Sessions, agent tokens and app tokens (on their bound channel) may call it.\n- `slug@7` pins a version. `slug@draft` behaves as shadow and is refused for `sk_live_` and `pk_live_`. An `inactive` channel returns `409 set_not_live`.\n- `Idempotency-Key` is accepted. A replay returns the original `runId` with no second action or usage event.\n- Responses carry `ETag`, `X-Request-Id`, `X-RateLimit-Limit` and `X-RateLimit-Remaining`.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/api.md#endpoints-run-surface`\n- `.claude/skills/bandwise-builder/references/management-api.md#runs-and-usage`\n- `.claude/skills/bandwise-builder/references/architecture.md#run-data-flow`\n- `.claude/skills/bandwise-builder/references/spec-schema.md#1-runrequest`\n\nNote: Added: the catalog puts `set.run` in Phase 2, and the k6 exit checks need it, but phase-2.md has no line for it.\n\nLocal ID: P2-12 (docs/linear-backlog.md)",
      "blockedBy": [
        "P2-05",
        "P2-08",
        "P1-02",
        "P1-03",
        "P1-19"
      ],
      "milestone": "Phase 2: Tenancy, auth, keys, billing",
      "linearId": "NSI-539"
    },
    {
      "localId": "P2-13",
      "project": "Bandwise",
      "title": "Add browser token minting with ES256 and the JWKS route",
      "labels": [
        "Platform / Tenancy",
        "Security",
        "agent-created"
      ],
      "estimate": 3,
      "state": "Backlog",
      "description": "Browsers get short-lived tokens without ever holding an `sk_` token.\n\nAcceptance criteria:\n- `POST /api/v1/tokens/browser` (`browser_token.create`, `sk_` only) returns a 5-minute ES256 JWT bound to origin and set list, signed with `BANDWISE_JWT_SIGNING_KEY` and a `kid`.\n- The JWKS is served at `/api/v1/.well-known/jwks.json`. On rotation the new `kid` is published before it signs, and the old one stays until its tokens expire.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/security.md#app-tokens`\n- `.claude/skills/bandwise-builder/references/api.md#auth-modes`\n\nLocal ID: P2-13 (docs/linear-backlog.md)",
      "blockedBy": [
        "P2-05"
      ],
      "milestone": "Phase 2: Tenancy, auth, keys, billing",
      "linearId": "NSI-542"
    },
    {
      "localId": "P2-14",
      "project": "Bandwise",
      "title": "Add org_webhook_secrets, encrypted like TypeSafe keys",
      "labels": [
        "Platform / Tenancy",
        "Security",
        "agent-created"
      ],
      "estimate": 1,
      "state": "Backlog",
      "description": "Org webhook signing secrets exist before Phase 5 webhooks need them.\n\nAcceptance criteria:\n- Each org's webhook secret uses the same envelope encryption as `org_typesafe_keys` and is never logged.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/security.md#typesafe-keys`\n- `.claude/skills/bandwise-builder/references/events.md#org-webhooks-phase-5`\n\nLocal ID: P2-14 (docs/linear-backlog.md)",
      "blockedBy": [
        "P2-03"
      ],
      "milestone": "Phase 2: Tenancy, auth, keys, billing",
      "linearId": "NSI-544"
    },
    {
      "localId": "P2-15",
      "project": "Bandwise",
      "title": "Split retention into state, answers and dataset settings",
      "labels": [
        "Platform / Tenancy",
        "Security",
        "bandwise:tenancy",
        "agent-created"
      ],
      "estimate": 2,
      "state": "Backlog",
      "description": "State, answers and datasets are kept on separate clocks.\n\nAcceptance criteria:\n- `state_retention_days` (default 30), `answers_retention_days` (default 180) and `dataset_retention_days` (defaults to the state retention; only an admin can raise it, audited).\n- Retention changes are always gated for agents.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/security.md#pii-and-data-handling`\n- `.claude/skills/bandwise-builder/references/effectiveness-loop.md#13-data-for-learning`\n\nLocal ID: P2-15 (docs/linear-backlog.md)",
      "blockedBy": [
        "P2-01"
      ],
      "milestone": "Phase 2: Tenancy, auth, keys, billing",
      "linearId": "NSI-545"
    },
    {
      "localId": "P2-16",
      "project": "Bandwise",
      "title": "Add rate limiters per org, token, eval bucket and model budget",
      "labels": [
        "Platform / Tenancy",
        "bandwise:tenancy",
        "bandwise:models",
        "agent-created"
      ],
      "estimate": 5,
      "state": "Backlog",
      "description": "One noisy org or agent cannot starve another.\n\nAcceptance criteria:\n- Limiters per org (plan) and per token, an eval bucket (25 percent of org RPM by default, lowest priority), and a global per-model budget from platform settings (about 1,000 RPM for `jev-1.13.0`) with per-org fair share.\n- Limiter keys include the model and are prefixed `org:{orgId}:`.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/security.md#rate-limits-for-agents-and-evals`\n- `.claude/skills/bandwise-builder/references/architecture.md#ports`\n- `.claude/skills/bandwise-builder/references/architecture.md#caching`\n\nLocal ID: P2-16 (docs/linear-backlog.md)",
      "blockedBy": [
        "P1-18",
        "P2-05",
        "P2-06"
      ],
      "milestone": "Phase 2: Tenancy, auth, keys, billing",
      "linearId": "NSI-547"
    },
    {
      "localId": "P2-17",
      "project": "Bandwise",
      "title": "Write audit rows inside withTenant for every mutation",
      "labels": [
        "Platform / Tenancy",
        "Security",
        "bandwise:tenancy",
        "agent-created"
      ],
      "estimate": 3,
      "state": "Backlog",
      "description": "Every change says who did it, through what, and who approved it.\n\nAcceptance criteria:\n- `audit_log` is append-only: the app's DB role has no UPDATE or DELETE on it.\n- Every mutation writes exactly one row with `actor_type`, `client`, `actor_user_id`, `actor_token_id`, `approval_id` and `actor_role`. Impersonation writes `impersonator_id`.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/security.md#audit`\n- `.claude/skills/bandwise-builder/references/data-model.md#invariants-tested`\n\nLocal ID: P2-17 (docs/linear-backlog.md)",
      "blockedBy": [
        "P2-08"
      ],
      "milestone": "Phase 2: Tenancy, auth, keys, billing",
      "linearId": "NSI-548"
    },
    {
      "localId": "P2-18",
      "project": "Bandwise",
      "title": "Build the platform admin route group with impersonation",
      "labels": [
        "Platform / Tenancy",
        "Security",
        "agent-created"
      ],
      "estimate": 5,
      "state": "Backlog",
      "description": "The platform admin manages orgs and platform settings safely.\n\nAcceptance criteria:\n- A separate route group needs `platform_role = 'superadmin'` and MFA. Org tokens get 404.\n- `platform_org.list`, `platform_org.suspend` (blocks runs within 30 seconds), `platform_org.set_entitlement`, `platform_settings.get|update` and `platform_price_book.get|update` exist as session-only operations.\n- Impersonation is time-boxed, shows a banner and is audited.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/security.md#platform-admin`\n- `.claude/skills/bandwise-builder/references/management-api.md#platform-platform-admin-only`\n\nLocal ID: P2-18 (docs/linear-backlog.md)",
      "blockedBy": [
        "P2-01",
        "P2-17"
      ],
      "milestone": "Phase 2: Tenancy, auth, keys, billing",
      "linearId": "NSI-550"
    },
    {
      "localId": "P2-19",
      "project": "Bandwise",
      "title": "Write plans.ts with plan limits",
      "labels": [
        "Billing",
        "agent-created"
      ],
      "estimate": 2,
      "state": "Backlog",
      "description": "Plan limits are one typed source.\n\nAcceptance criteria:\n- `plans.ts` sets runs per month, platform System One spend per month, RPM, seats, apps, sets, retention maximum, SSO and eval runs for each `PlanId`.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/phases/phase-2.md#billing--savings`\n- `.claude/skills/bandwise-builder/references/architecture.md#core-contracts-packagescoresrccontracts`\n\nLocal ID: P2-19 (docs/linear-backlog.md)",
      "blockedBy": [
        "P0-09"
      ],
      "milestone": "Phase 2: Tenancy, auth, keys, billing",
      "linearId": "NSI-553"
    },
    {
      "localId": "P2-20",
      "project": "Bandwise",
      "title": "Set up Stripe products, meters, Checkout and Customer Portal",
      "labels": [
        "Billing",
        "agent-created"
      ],
      "estimate": 5,
      "state": "Backlog",
      "description": "Orgs subscribe and pay for System One spend.\n\nAcceptance criteria:\n- Meters bill System One cost in micro-USD (or one meter per model), never raw tokens at one rate.\n- Checkout and the Customer Portal open from a console session. They are the documented console-only exception to headless parity.\n- A billing upgrade works in Stripe test mode.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/phases/phase-2.md#billing--savings`\n- `.claude/skills/bandwise-builder/references/savings-model.md#price-book`\n- `.claude/skills/bandwise-builder/references/testing.md#playwright`\n\nLocal ID: P2-20 (docs/linear-backlog.md)",
      "blockedBy": [
        "P2-19",
        "P2-01",
        "P0-18"
      ],
      "milestone": "Phase 2: Tenancy, auth, keys, billing",
      "linearId": "NSI-554"
    },
    {
      "localId": "P2-21",
      "project": "Bandwise",
      "title": "Handle Stripe webhooks with idempotency and read-only mode",
      "labels": [
        "Billing",
        "Security",
        "agent-created"
      ],
      "estimate": 3,
      "state": "Backlog",
      "description": "Billing events apply once, and failed payments degrade gracefully.\n\nAcceptance criteria:\n- Webhook signatures are verified, with a rejection test.\n- An idempotency table makes a replayed webhook a no-op.\n- A failed payment starts a grace period, then read-only mode.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/phases/phase-2.md#billing--savings`\n- `.claude/skills/bandwise-builder/references/testing.md#security-tests`\n\nLocal ID: P2-21 (docs/linear-backlog.md)",
      "blockedBy": [
        "P2-20"
      ],
      "milestone": "Phase 2: Tenancy, auth, keys, billing",
      "linearId": "NSI-555"
    },
    {
      "localId": "P2-22",
      "project": "Bandwise",
      "title": "Build the meter outbox job to Stripe",
      "labels": [
        "Billing",
        "agent-created"
      ],
      "estimate": 3,
      "state": "Backlog",
      "description": "Usage reaches Stripe exactly once per run.\n\nAcceptance criteria:\n- Every minute, the outbox pushes usage events to Stripe with the run id as the idempotency key.\n- A replayed run pushes nothing.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/architecture.md#background-jobs`\n- `.claude/skills/bandwise-builder/references/management-api.md#idempotency-keys`\n\nLocal ID: P2-22 (docs/linear-backlog.md)",
      "blockedBy": [
        "P2-20",
        "P1-19"
      ],
      "milestone": "Phase 2: Tenancy, auth, keys, billing",
      "linearId": "NSI-556"
    },
    {
      "localId": "P2-23",
      "project": "Bandwise",
      "title": "Carry the resolved model on usage events into metering",
      "labels": [
        "Billing",
        "bandwise:models",
        "agent-created"
      ],
      "estimate": 1,
      "state": "Backlog",
      "description": "Spend is priced by the model that answered.\n\nAcceptance criteria:\n- Usage events carry `model_resolved`, and metering and price lookups use it.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/data-model.md#billing-and-usage`\n- `.claude/skills/bandwise-builder/references/savings-model.md#price-book`\n\nLocal ID: P2-23 (docs/linear-backlog.md)",
      "blockedBy": [
        "P1-19"
      ],
      "milestone": "Phase 2: Tenancy, auth, keys, billing",
      "linearId": "NSI-557"
    },
    {
      "localId": "P2-24",
      "project": "Bandwise",
      "title": "Add price book defaults and per-org overrides by versioned model",
      "labels": [
        "Billing",
        "bandwise:models",
        "bandwise:tenancy",
        "agent-created"
      ],
      "estimate": 3,
      "state": "Backlog",
      "description": "Prices are data, keyed by the exact versioned model id.\n\nAcceptance criteria:\n- Platform default rows (`org_id` null) and org overrides, keyed by exact versioned model id. Alias rows are rejected with 400.\n- An org override wins for its own org. `price_book.get` and `price_book.update` exist as operations.\n- Cross-tenant test: org A cannot read or write org B's override, and both read the platform rows.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/savings-model.md#price-book`\n- `.claude/skills/bandwise-builder/references/system-one-models.md#8-pricing`\n- `.claude/skills/bandwise-builder/references/data-model.md#billing-and-usage`\n\nLocal ID: P2-24 (docs/linear-backlog.md)",
      "blockedBy": [
        "P1-12",
        "P2-18"
      ],
      "milestone": "Phase 2: Tenancy, auth, keys, billing",
      "linearId": "NSI-558"
    },
    {
      "localId": "P2-25",
      "project": "Bandwise",
      "title": "Build the nightly usage_daily rollup",
      "labels": [
        "Billing",
        "bandwise:tenancy",
        "agent-created"
      ],
      "estimate": 3,
      "state": "Backlog",
      "description": "Quota, billing reconciliation and dashboards read one daily rollup.\n\nAcceptance criteria:\n- `usage_daily` rolls up runs, `system_one_input_tokens` and `system_one_cost_micro_usd` per org, set and model, nightly.\n- Stripe test clock: 1,000 runs reconcile with `usage_daily` within 0.1 percent.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/savings-model.md#rollups-usage_daily`\n- `.claude/skills/bandwise-builder/references/architecture.md#background-jobs`\n\nNote: Added: the quota guard and the Stripe reconciliation exit check read `usage_daily`, but no phase-2.md line builds it.\n\nLocal ID: P2-25 (docs/linear-backlog.md)",
      "blockedBy": [
        "P1-19"
      ],
      "milestone": "Phase 2: Tenancy, auth, keys, billing",
      "linearId": "NSI-559"
    },
    {
      "localId": "P2-26",
      "project": "Bandwise",
      "title": "Add the quota guard on usage_daily plus a same-day Redis counter",
      "labels": [
        "Billing",
        "bandwise:tenancy",
        "agent-created"
      ],
      "estimate": 3,
      "state": "Backlog",
      "description": "Plans cap usage without a slow query on every run.\n\nAcceptance criteria:\n- `QuotaGuard` reads `usage_daily` plus a same-day Redis counter and returns `quota_exceeded` or `token_budget_exceeded` per the port.\n- It is checked in run step 7.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/architecture.md#ports`\n- `.claude/skills/bandwise-builder/references/architecture.md#run-data-flow`\n\nLocal ID: P2-26 (docs/linear-backlog.md)",
      "blockedBy": [
        "P2-19",
        "P2-25"
      ],
      "milestone": "Phase 2: Tenancy, auth, keys, billing",
      "linearId": "NSI-561"
    },
    {
      "localId": "P2-27",
      "project": "Bandwise",
      "title": "Build the console shell and settings pages",
      "labels": [
        "Console UI",
        "bandwise:tenancy",
        "agent-created"
      ],
      "estimate": 5,
      "state": "Backlog",
      "description": "The console has its frame and the settings every org needs.\n\nAcceptance criteria:\n- Layout, org switcher and nav.\n- Settings pages for members, keys, apps, agent tokens, billing, retention, PII and agent approvals.\n- Every page calls operations, never repositories.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/phases/phase-2.md#console-ui`\n- `.claude/skills/bandwise-builder/references/management-api.md#adapters`\n\nLocal ID: P2-27 (docs/linear-backlog.md)",
      "blockedBy": [
        "P2-02",
        "P2-08"
      ],
      "milestone": "Phase 2: Tenancy, auth, keys, billing",
      "linearId": "NSI-562"
    },
    {
      "localId": "P2-28",
      "project": "Bandwise",
      "title": "Build the approvals inbox: list, approve and reject",
      "labels": [
        "Console UI",
        "bandwise:headless",
        "Security",
        "agent-created"
      ],
      "estimate": 3,
      "state": "Backlog",
      "description": "People decide pending agent requests in the console.\n\nAcceptance criteria:\n- The inbox lists `approval.list` with a count badge.\n- Approve or reject goes through `approval.decide` in a console session, and the stored input then runs.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/management-api.md#approvals`\n\nLocal ID: P2-28 (docs/linear-backlog.md)",
      "blockedBy": [
        "P2-09",
        "P2-27"
      ],
      "milestone": "Phase 2: Tenancy, auth, keys, billing",
      "linearId": "NSI-563"
    },
    {
      "localId": "P2-29",
      "project": "Bandwise",
      "title": "Review keys, tokens, device flow and approvals for security",
      "labels": [
        "Security review",
        "Security",
        "agent-created"
      ],
      "estimate": 3,
      "state": "Backlog",
      "description": "The Security reviewer signs off on the Phase 2 attack surface.\n\nAcceptance criteria:\n- Each PR touching keys, authz, app or agent tokens, approvals, the device flow or browser tokens has Security reviewer sign-off.\n- The log scrubber test finds no `sk_`, `pk_`, `sa_live_` or TypeSafe key material in logs or responses.\n- The default `agentApprovals` setting is reviewed, as PLAN.md requires before the first paying customer.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/security.md`\n- `.claude/skills/bandwise-builder/references/testing.md#security-tests`\n- `docs/PLAN.md#before-the-first-paying-customer`\n\nNote: Added: phase-2.md names the Security reviewer as an owner without a checklist line.\n\nLocal ID: P2-29 (docs/linear-backlog.md)",
      "blockedBy": [
        "P2-03",
        "P2-05",
        "P2-06",
        "P2-07",
        "P2-09",
        "P2-13"
      ],
      "milestone": "Phase 2: Tenancy, auth, keys, billing",
      "linearId": "NSI-564"
    },
    {
      "localId": "P2-30",
      "project": "Bandwise",
      "title": "Pass the Phase 2 exit gate",
      "labels": [
        "QA / Evals",
        "bandwise:tenancy",
        "Security",
        "agent-created"
      ],
      "estimate": 5,
      "state": "Backlog",
      "description": "Confirm Phase 2 is done before Phase 3 starts.\n\nAcceptance criteria:\n- One user in three orgs (SGR, Personal, Dallas style seed) switches with no data leak (Playwright).\n- One Playwright test per role proves its permissions.\n- Demoting a user removes the matching permissions from their agent tokens on the next request.\n- An agent token hitting a high-risk operation gets 202 and a pending approval. A person approves in the console and the stored input runs.\n- Log scrubber test: no key material (`sk_`, `pk_`, `sa_live_`, TypeSafe keys) in logs or responses.\n- k6: one org at its limit does not move another org's p95 latency.\n- k6: a 5,000-case eval in org A does not move org A production p95 by more than 10 percent.\n- Stripe test clock: subscribe, run 1,000 runs, and invoiced System One spend reconciles with `usage_daily` within 0.1 percent.\n- Replaying a webhook is a no-op.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/phases/phase-2.md#exit-gate`\n- `.claude/skills/bandwise-builder/references/testing.md#load-k6`\n\nLocal ID: P2-30 (docs/linear-backlog.md)",
      "blockedBy": [
        "P2-04",
        "P2-10",
        "P2-11",
        "P2-12",
        "P2-14",
        "P2-15",
        "P2-16",
        "P2-21",
        "P2-22",
        "P2-23",
        "P2-24",
        "P2-26",
        "P2-28",
        "P2-29"
      ],
      "milestone": "Phase 2: Tenancy, auth, keys, billing",
      "linearId": "NSI-565"
    },
    {
      "localId": "P3-01",
      "project": "Bandwise",
      "title": "Register project, goal, template, set and draft operations",
      "labels": [
        "Platform / Tenancy",
        "bandwise:headless",
        "agent-created"
      ],
      "estimate": 5,
      "state": "Backlog",
      "description": "The set-building operations exist before any screen uses them.\n\nAcceptance criteria:\n- The Phase 3 rows under Projects and goals and under Sets and drafts have real input and output schemas and handlers.\n- The draft ETag is its `spec_hash`. `draft.update` replaces the whole strict spec and requires `If-Match`. A `rollout` key fails with a message naming `rollout.change`.\n- `draft.validate` returns `{ errors[], warnings[] }` in the error `details` shape and writes nothing.\n- `template.list` returns `{ id, name, pattern, parameters }`. `set.create` without `fromVersion` copies the default model into the draft once.\n- `set.update` changes `name`, `protected` (admin only), `labeling`, `dispatchActionsOnStaging`, `valueSettings` and `gateMargins`.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/management-api.md#projects-and-goals`\n- `.claude/skills/bandwise-builder/references/management-api.md#sets-and-drafts`\n- `.claude/skills/bandwise-builder/references/management-api.md#draft-concurrency`\n- `.claude/skills/bandwise-builder/references/system-one-models.md#14-default-model`\n\nNote: Split from the phase-3.md item \"Every console capability registered as an operation with its /api/v1 route; the parity test passes\" (P3-01 to P3-05), because it is far larger than 8 points.\n\nLocal ID: P3-01 (docs/linear-backlog.md)",
      "blockedBy": [
        "P2-08",
        "P2-11",
        "P1-06"
      ],
      "milestone": "Phase 3: Console and management API",
      "linearId": "NSI-560"
    },
    {
      "localId": "P3-02",
      "project": "Bandwise",
      "title": "Register version, release and rollout operations with dry runs",
      "labels": [
        "Platform / Tenancy",
        "bandwise:headless",
        "Security",
        "agent-created"
      ],
      "estimate": 8,
      "state": "Backlog",
      "description": "Publishing, rollback, promotion and rollout run through operations that gates and approvals guard.\n\nAcceptance criteria:\n- `version.list`, `version.get`, `version.diff` (`SpecDiff`), `set.publish`, `channel.rollback`, `channel.promote`, `release.list`, `rollout.get` and `rollout.change` work.\n- Publish freezes the draft into version N+1 under `If-Match` and runs lints, including `interface.breaking` (consumers are apps with runs in the last 30 days until bindings land in P4b-13). An unchanged spec is a no-op unless `interfaceBump` is set.\n- The eval gate is required when the production pointer is `controlled` or `full`: the same-snapshot regression gate in effectiveness-loop.md section 5.\n- The `high*` rules for publish, promote and `rollout.change` apply. Moves toward safety are never gated. A failed gate returns `409 gate_not_met` with `gates`.\n- `?dryRun=true` on publish, rollback, promote and rollout change returns `DryRunResult` and writes nothing. A replayed publish with the same `Idempotency-Key` creates no version.\n- Each move writes `release_events` and an audit row, and bumps the pointer cache epoch, so the API serves a new version within 30 seconds.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/management-api.md#versions-and-releases`\n- `.claude/skills/bandwise-builder/references/management-api.md#rollout`\n- `.claude/skills/bandwise-builder/references/management-api.md#dry-runs`\n- `.claude/skills/bandwise-builder/references/architecture.md#managed-live`\n- `.claude/skills/bandwise-builder/references/architecture.md#caching`\n- `.claude/skills/bandwise-builder/references/confidence-policy.md#default-gates-production-channel-editable-per-set-stricter-for-high-risk-sets`\n- `.claude/skills/bandwise-builder/references/effectiveness-loop.md#5-quality-targets-and-gates-phase-3`\n\nNote: Split from the phase-3.md item \"Every console capability registered as an operation with its /api/v1 route; the parity test passes\" (P3-01 to P3-05), because it is far larger than 8 points.\n\nLocal ID: P3-02 (docs/linear-backlog.md)",
      "blockedBy": [
        "P3-01",
        "P2-09",
        "P1-07",
        "P3-35"
      ],
      "milestone": "Phase 3: Console and management API",
      "linearId": "NSI-566"
    },
    {
      "localId": "P3-03",
      "project": "Bandwise",
      "title": "Register dataset, eval, compare and review operations",
      "labels": [
        "Platform / Tenancy",
        "bandwise:headless",
        "Security",
        "agent-created"
      ],
      "estimate": 5,
      "state": "Backlog",
      "description": "Test-and-learn work runs through operations with the holdout rules enforced on the server.\n\nAcceptance criteria:\n- `dataset.list`, `dataset.create`, `dataset.import`, `dataset.cases`, `dataset.snapshot`, `dataset.export`, `eval.run` and `eval.get` (202 with `jobId` and `evalRunId`), `set.compare`, and `review.list`, `review.assign`, `review.resolve`, `review.dismiss` and `review.confirm` (session only).\n- The server assigns each case's fixed split (40/40/20 from a hash of `state_hash`). The test split never appears in any response. Per-case calibration results come back only with `includeCases: true`, and those cases are burned.\n- An agent resolving a kind `action` item leaves it `pending_confirmation` until a person calls `review.confirm`. Agent labels count toward nothing until confirmed.\n- Evals and compares use the eval limiter bucket.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/management-api.md#datasets-evals-and-jobs`\n- `.claude/skills/bandwise-builder/references/management-api.md#review-and-feedback`\n- `.claude/skills/bandwise-builder/references/management-api.md#holdout-rules-at-the-api`\n- `.claude/skills/bandwise-builder/references/effectiveness-loop.md#13-data-for-learning`\n\nNote: Split from the phase-3.md item \"Every console capability registered as an operation with its /api/v1 route; the parity test passes\" (P3-01 to P3-05), because it is far larger than 8 points.\n\nLocal ID: P3-03 (docs/linear-backlog.md)",
      "blockedBy": [
        "P3-01",
        "P1-24"
      ],
      "milestone": "Phase 3: Console and management API",
      "linearId": "NSI-567"
    },
    {
      "localId": "P3-04",
      "project": "Bandwise",
      "title": "Register run, usage, report, audit, alert, model and org operations",
      "labels": [
        "Platform / Tenancy",
        "bandwise:headless",
        "bandwise:models",
        "agent-created"
      ],
      "estimate": 5,
      "state": "Backlog",
      "description": "Read surfaces and the remaining Phase 3 operations exist for the console, CLI and MCP.\n\nAcceptance criteria:\n- `set.manifest` (no instructions, criteria or thresholds), `run.list` (catalog filters, no state), `run.get` (with its review items and their resolution), `usage.get`, `report.get` (csv and pdf), `alert.list`, `audit.list` (csv), `model.list` (`isDefault` on the default model), `model.get`, `portfolio.get` (session only) and `org.delete` (owner, always gated).\n- `platform_model.list`, `platform_model.create`, `platform_model.update` and `platform_report.get` are superadmin session only, and org tokens get 404.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/management-api.md#runs-and-usage`\n- `.claude/skills/bandwise-builder/references/management-api.md#reports-audit-and-events`\n- `.claude/skills/bandwise-builder/references/management-api.md#models`\n- `.claude/skills/bandwise-builder/references/management-api.md#platform-platform-admin-only`\n- `.claude/skills/bandwise-builder/references/management-api.md#identity-tokens-and-admin`\n\nNote: Split from the phase-3.md item \"Every console capability registered as an operation with its /api/v1 route; the parity test passes\" (P3-01 to P3-05), because it is far larger than 8 points.\n\nLocal ID: P3-04 (docs/linear-backlog.md)",
      "blockedBy": [
        "P2-08"
      ],
      "milestone": "Phase 3: Console and management API",
      "linearId": "NSI-568"
    },
    {
      "localId": "P3-05",
      "project": "Bandwise",
      "title": "Enforce the full parity test in CI",
      "labels": [
        "QA / Evals",
        "bandwise:headless",
        "agent-created"
      ],
      "estimate": 3,
      "state": "Backlog",
      "description": "No capability can exist only in the console.\n\nAcceptance criteria:\n- The test fails when an operation has no route or no OpenAPI path, when a curated MCP tool or CLI command maps to no operation or to a session-only one, or when code under `app/(org)/**` or `app/(platform)/**` imports a repository.\n- A token calling a session-only operation gets `403 insufficient_scope`.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/management-api.md#openapi-and-the-parity-test`\n- `.claude/skills/bandwise-builder/references/testing.md#headless-api-tests`\n\nNote: Split from the phase-3.md item \"Every console capability registered as an operation with its /api/v1 route; the parity test passes\" (P3-01 to P3-05), because it is far larger than 8 points.\n\nLocal ID: P3-05 (docs/linear-backlog.md)",
      "blockedBy": [
        "P0-12"
      ],
      "milestone": "Phase 3: Console and management API",
      "linearId": "NSI-569"
    },
    {
      "localId": "P3-06",
      "project": "Bandwise",
      "title": "Build goals CRUD with a QualityTarget and business KPI",
      "labels": [
        "Console UI",
        "agent-created"
      ],
      "estimate": 3,
      "state": "Backlog",
      "description": "Every set belongs to a goal with a typed quality target.\n\nAcceptance criteria:\n- Create and edit goals. Picking a tier (low, standard, high) fills `QualityTarget` with that tier's defaults, and each field stays editable.\n- A free-text business KPI is stored in `goals.business_kpi`.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/effectiveness-loop.md#5-quality-targets-and-gates-phase-3`\n- `.claude/skills/bandwise-builder/references/confidence-policy.md#quality-targets`\n\nLocal ID: P3-06 (docs/linear-backlog.md)",
      "blockedBy": [
        "P3-01"
      ],
      "milestone": "Phase 3: Console and management API",
      "linearId": "NSI-570"
    },
    {
      "localId": "P3-07",
      "project": "Bandwise",
      "title": "Build the set list and create flow, seeding two templates",
      "labels": [
        "Console UI",
        "agent-created"
      ],
      "estimate": 3,
      "state": "Backlog",
      "description": "People start a set from blank or from a template.\n\nAcceptance criteria:\n- Set list and create from blank or a template.\n- The document evaluator and email urgency templates are seeded, each tagged with a pattern and building a `Partial<QuestionSetSpec>` that includes `input.schema`. Templates never set `model`.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/definition-studio.md#template-library-seeded`\n- `.claude/skills/bandwise-builder/references/deploy-and-codegen.md#3-pattern-advisor`\n- `.claude/skills/bandwise-builder/references/system-one-models.md#14-default-model`\n\nLocal ID: P3-07 (docs/linear-backlog.md)",
      "blockedBy": [
        "P3-01"
      ],
      "milestone": "Phase 3: Console and management API",
      "linearId": "NSI-572"
    },
    {
      "localId": "P3-08",
      "project": "Bandwise",
      "title": "Build the question editor with form and JSON modes and live lints",
      "labels": [
        "Console UI",
        "agent-created"
      ],
      "estimate": 8,
      "state": "Backlog",
      "description": "People edit questions with instant validation.\n\nAcceptance criteria:\n- Form mode and JSON mode over the draft, with live zod validation and lints shown at their JSON Pointer.\n- Structured instructions and criteria. Backtick path autocomplete from `input.schema`.\n- Saves go through `draft.update` with `If-Match` and show a 412 conflict clearly.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/spec-schema.md`\n- `.claude/skills/bandwise-builder/references/architecture.md#lints-packagescoresrclints`\n- `.claude/skills/bandwise-builder/references/definition-studio.md#working-rules-for-question-writing`\n\nLocal ID: P3-08 (docs/linear-backlog.md)",
      "blockedBy": [
        "P3-01",
        "P1-06"
      ],
      "milestone": "Phase 3: Console and management API",
      "linearId": "NSI-573"
    },
    {
      "localId": "P3-09",
      "project": "Bandwise",
      "title": "Build the model picker from model.list",
      "labels": [
        "Console UI",
        "bandwise:models",
        "agent-created"
      ],
      "estimate": 2,
      "state": "Backlog",
      "description": "People pick a model from the registry, not a free-text box.\n\nAcceptance criteria:\n- Shows each model's status, limits and weaknesses from `model.list`.\n- Moving models are marked, and `model.alias_past_shadow` shows when the set is past shadow.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/system-one-models.md#3-modelprofile-contract`\n- `.claude/skills/bandwise-builder/references/system-one-models.md#4-pinned-or-moving`\n\nLocal ID: P3-09 (docs/linear-backlog.md)",
      "blockedBy": [
        "P3-04",
        "P3-08"
      ],
      "milestone": "Phase 3: Console and management API",
      "linearId": "NSI-575"
    },
    {
      "localId": "P3-10",
      "project": "Bandwise",
      "title": "Build the options editor for choice, score and noul",
      "labels": [
        "Console UI",
        "agent-created"
      ],
      "estimate": 3,
      "state": "Backlog",
      "description": "Options, levels and criteria are easy to get right.\n\nAcceptance criteria:\n- Choice options up to 255 with a \"none\" suggestion, score levels 2 to 10 in order, and noul true and false criteria.\n- The 255 and 2 to 10 limits are API-wide rules. Other limits come from the model profile.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/system-one-api-contract.md#api-wide-rules`\n- `.claude/skills/bandwise-builder/references/architecture.md#lints-packagescoresrclints`\n\nLocal ID: P3-10 (docs/linear-backlog.md)",
      "blockedBy": [
        "P3-08"
      ],
      "milestone": "Phase 3: Console and management API",
      "linearId": "NSI-576"
    },
    {
      "localId": "P3-11",
      "project": "Bandwise",
      "title": "Build the policy editor with band sliders and live preview",
      "labels": [
        "Console UI",
        "agent-created"
      ],
      "estimate": 5,
      "state": "Backlog",
      "description": "People tune bands and actions and see the effect right away.\n\nAcceptance criteria:\n- Per-question thresholds, noul settings, per-option overrides, the top-choice preset and band-to-action mapping.\n- A live preview on sample state shows each decision's band and `effectiveAction`.\n- Lint errors such as `policy.thresholds_order` show inline.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/confidence-policy.md#policy-shape`\n- `.claude/skills/bandwise-builder/references/confidence-policy.md#preset-top-choice-only`\n- `.claude/skills/bandwise-builder/references/confidence-policy.md#band-algorithm`\n\nLocal ID: P3-11 (docs/linear-backlog.md)",
      "blockedBy": [
        "P3-08"
      ],
      "milestone": "Phase 3: Console and management API",
      "linearId": "NSI-578"
    },
    {
      "localId": "P3-12",
      "project": "Bandwise",
      "title": "Build the input schema editor, redact paths and preflight meter",
      "labels": [
        "Console UI",
        "Security",
        "agent-created"
      ],
      "estimate": 3,
      "state": "Backlog",
      "description": "People shape and protect state before it reaches the model.\n\nAcceptance criteria:\n- Edit `input.schema` and `redactPaths`, with `redact.path_unknown` shown.\n- A token preflight meter against the profile limits warns at 80 percent.\n- The adapter picker stays hidden until Phase 5 (P5-03), so sets run on raw JSON state.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/architecture.md#run-data-flow`\n- `.claude/skills/bandwise-builder/references/security.md#pii-and-data-handling`\n- `.claude/skills/bandwise-builder/references/system-one-models.md#7-limits-as-data`\n\nLocal ID: P3-12 (docs/linear-backlog.md)",
      "blockedBy": [
        "P3-08",
        "P1-05"
      ],
      "milestone": "Phase 3: Console and management API",
      "linearId": "NSI-580"
    },
    {
      "localId": "P3-13",
      "project": "Bandwise",
      "title": "Build the publish flow with lints, eval gate and dry-run preview",
      "labels": [
        "Console UI",
        "bandwise:headless",
        "agent-created"
      ],
      "estimate": 5,
      "state": "Backlog",
      "description": "Publishing shows exactly what will change and what blocks it.\n\nAcceptance criteria:\n- The dialog sends `If-Match` with the draft ETag.\n- It shows lints (including the model lints and `interface.breaking`), the eval gate result when production is `controlled` or `full`, changelog, channel choice and the dry-run preview (diff, lints, gates, `approvalRequired`, `interfaceChange`).\n\nRefs:\n- `.claude/skills/bandwise-builder/references/management-api.md#dry-runs`\n- `.claude/skills/bandwise-builder/references/management-api.md#versions-and-releases`\n- `.claude/skills/bandwise-builder/references/architecture.md#managed-live`\n\nLocal ID: P3-13 (docs/linear-backlog.md)",
      "blockedBy": [
        "P3-02",
        "P3-32"
      ],
      "milestone": "Phase 3: Console and management API",
      "linearId": "NSI-581"
    },
    {
      "localId": "P3-14",
      "project": "Bandwise",
      "title": "Build version history, diffs, release events, rollback and promote",
      "labels": [
        "Console UI",
        "agent-created"
      ],
      "estimate": 3,
      "state": "Backlog",
      "description": "People see every version and move pointers in one click.\n\nAcceptance criteria:\n- History per set, version diffs from `version.diff`, and a release events timeline.\n- One-click rollback and promote, each through its operation.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/management-api.md#versions-and-releases`\n\nLocal ID: P3-14 (docs/linear-backlog.md)",
      "blockedBy": [
        "P3-02"
      ],
      "milestone": "Phase 3: Console and management API",
      "linearId": "NSI-583"
    },
    {
      "localId": "P3-15",
      "project": "Bandwise",
      "title": "Build per-channel rollout control with gate status",
      "labels": [
        "Console UI",
        "agent-created"
      ],
      "estimate": 3,
      "state": "Backlog",
      "description": "People move a set through rollout stages with the gates in view.\n\nAcceptance criteria:\n- A status chip, timeline and gate checklist per channel (`inactive`, `shadow`, `controlled`, `full`, `paused`) through `rollout.change`.\n- Gate results show required and actual values. Every change is audited.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/confidence-policy.md#rollout-stages-per-set-per-channel`\n- `.claude/skills/bandwise-builder/references/management-api.md#rollout`\n\nLocal ID: P3-15 (docs/linear-backlog.md)",
      "blockedBy": [
        "P3-02"
      ],
      "milestone": "Phase 3: Console and management API",
      "linearId": "NSI-585"
    },
    {
      "localId": "P3-16",
      "project": "Bandwise",
      "title": "Add the jobs endpoint GET /api/v1/jobs/{id}",
      "labels": [
        "Platform / Tenancy",
        "bandwise:headless",
        "agent-created"
      ],
      "estimate": 3,
      "state": "Backlog",
      "description": "Long work runs as jobs that any client can poll.\n\nAcceptance criteria:\n- Long work returns `202 { jobId }`. `GET /api/v1/jobs/{id}` returns `{ id, kind, status, result?, error?, createdAt, finishedAt? }` with `Retry-After` while running.\n- Kinds `eval`, `compare`, `calibrate`, `improve`, `try_model`, `policy_suggest` and `export` on the ADR-005 jobs runner.\n- A finished job emits `job.completed`, and an eval job also emits `eval.completed`.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/management-api.md#jobs`\n\nLocal ID: P3-16 (docs/linear-backlog.md)",
      "blockedBy": [
        "P2-08",
        "P0-18"
      ],
      "milestone": "Phase 3: Console and management API",
      "linearId": "NSI-587"
    },
    {
      "localId": "P3-17",
      "project": "Bandwise",
      "title": "Send approval emails and the 24-hour reminder",
      "labels": [
        "Platform / Tenancy",
        "bandwise:headless",
        "Security",
        "agent-created"
      ],
      "estimate": 2,
      "state": "Backlog",
      "description": "People learn about pending agent requests without watching the console.\n\nAcceptance criteria:\n- On `approval.requested`, email every member whose role can decide, plus the token's own user, with the operation, reason and console URL.\n- A request still pending after 24 hours is emailed once more.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/management-api.md#approvals`\n- `.claude/skills/bandwise-builder/references/architecture.md#background-jobs`\n\nNote: management-api.md specifies these emails. The matching line under the phase-3.md approvals item is a pending edit.\n\nLocal ID: P3-17 (docs/linear-backlog.md)",
      "blockedBy": [
        "P2-09"
      ],
      "milestone": "Phase 3: Console and management API",
      "linearId": "NSI-589"
    },
    {
      "localId": "P3-18",
      "project": "Bandwise",
      "title": "Build the approvals decision UI with diff, gates and dry run",
      "labels": [
        "Console UI",
        "bandwise:headless",
        "Security",
        "agent-created"
      ],
      "estimate": 3,
      "state": "Backlog",
      "description": "Approvers see everything they need to decide.\n\nAcceptance criteria:\n- Each request shows the stored input, a diff, gate results and the dry-run preview.\n- Approve or reject goes through `approval.decide`. The requesting token and user are shown.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/management-api.md#approvals`\n- `.claude/skills/bandwise-builder/references/phases/phase-3.md#headless-parity`\n\nLocal ID: P3-18 (docs/linear-backlog.md)",
      "blockedBy": [
        "P2-28",
        "P3-02"
      ],
      "milestone": "Phase 3: Console and management API",
      "linearId": "NSI-590"
    },
    {
      "localId": "P3-19",
      "project": "Bandwise",
      "title": "Build agent token management for admins",
      "labels": [
        "Console UI",
        "Security",
        "bandwise:headless",
        "agent-created"
      ],
      "estimate": 2,
      "state": "Backlog",
      "description": "Admins can see and revoke every agent token in the org.\n\nAcceptance criteria:\n- Admins see every member's tokens with scopes, ceiling, client, last use and expiry, and can revoke any of them.\n- Members manage their own tokens.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/security.md#agent-tokens`\n- `.claude/skills/bandwise-builder/references/management-api.md#identity-tokens-and-admin`\n\nLocal ID: P3-19 (docs/linear-backlog.md)",
      "blockedBy": [
        "P2-27",
        "P2-06"
      ],
      "milestone": "Phase 3: Console and management API",
      "linearId": "NSI-592"
    },
    {
      "localId": "P3-20",
      "project": "Bandwise",
      "title": "Serve the event feed GET /api/v1/events",
      "labels": [
        "Platform / Tenancy",
        "bandwise:headless",
        "agent-created"
      ],
      "estimate": 3,
      "state": "Backlog",
      "description": "Agents with no public URL read events through a cursor feed.\n\nAcceptance criteria:\n- A cursor feed per events.md, filterable by type. Events are pruned after 30 days.\n- An `sk_` app token with `events:read` sees only `review.created`, `review.sla_breached` and `review.resolved` for runs made with that app's tokens.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/events.md#pull-feed-phase-3`\n- `.claude/skills/bandwise-builder/references/events.md#catalog`\n\nLocal ID: P3-20 (docs/linear-backlog.md)",
      "blockedBy": [
        "P2-08"
      ],
      "milestone": "Phase 3: Console and management API",
      "linearId": "NSI-593"
    },
    {
      "localId": "P3-21",
      "project": "Bandwise",
      "title": "Serve the feedback API with a server-derived source",
      "labels": [
        "Platform / Tenancy",
        "bandwise:headless",
        "Security",
        "agent-created"
      ],
      "estimate": 3,
      "state": "Backlog",
      "description": "Apps report outcomes so precision can be measured in every rollout stage.\n\nAcceptance criteria:\n- `POST /api/v1/feedback` (`feedback.report`) takes 1 to 1,000 `FeedbackReport` items matched by `runId` or `externalRef`, each idempotent on its own key, with `created`, `duplicate` or `error` per item.\n- The server sets the source: `app` for `sk_` tokens, `agent` for agent tokens. A body `source` that differs returns `400 invalid_request`. Agent rows count toward nothing until a person confirms them.\n- `pk_` and browser tokens are refused.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/api.md#feedback`\n- `.claude/skills/bandwise-builder/references/effectiveness-loop.md#3-truth-sources-phase-3`\n\nLocal ID: P3-21 (docs/linear-backlog.md)",
      "blockedBy": [
        "P2-08",
        "P2-12"
      ],
      "milestone": "Phase 3: Console and management API",
      "linearId": "NSI-594"
    },
    {
      "localId": "P3-22",
      "project": "Bandwise",
      "title": "Build the bandwise CLI foundation: login, profiles, status, bandwise api",
      "labels": [
        "Integrations",
        "bandwise:headless",
        "agent-created"
      ],
      "estimate": 5,
      "state": "Backlog",
      "description": "Agents and CI drive Bandwise from a published CLI.\n\nAcceptance criteria:\n- `bandwise login` (device flow) and `logout`, named profiles per org, and `status` (`actor.get`). Credentials resolve from `--profile`, then `BANDWISE_TOKEN`, then the config profile, then the default profile.\n- `--json` on every command. No prompts without a TTY (`--yes`). Exit codes 0, 1, 2 and 3 (approval pending).\n- Mutations send a generated `Idempotency-Key` and retry safely. Errors print `code`, `message` and each `details` item.\n- `bandwise api <operationId>` and `bandwise api --list` are built from `openapi.json` and refuse session-only operations.\n- The CLI never touches the database, never calls TypeSafe and never stores a TypeSafe key.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/headless-and-agents.md#bandwisecli`\n- `.claude/skills/bandwise-builder/references/headless-and-agents.md#profiles`\n- `.claude/skills/bandwise-builder/references/headless-and-agents.md#any-operation-bandwise-api`\n\nNote: Split from the phase-3.md @bandwise/cli item (P3-22 to P3-24), because it is larger than 8 points.\n\nLocal ID: P3-22 (docs/linear-backlog.md)",
      "blockedBy": [
        "P2-07",
        "P0-12"
      ],
      "milestone": "Phase 3: Console and management API",
      "linearId": "NSI-595"
    },
    {
      "localId": "P3-23",
      "project": "Bandwise",
      "title": "Add the Phase 3 named CLI commands",
      "labels": [
        "Integrations",
        "bandwise:headless",
        "agent-created"
      ],
      "estimate": 5,
      "state": "Backlog",
      "description": "Common operations have named commands.\n\nAcceptance criteria:\n- Every Phase 3 row in the command tables (identity and admin; goals, sets and releases; datasets, evals and runs; review, feedback, reports and events) maps to its operation.\n- Approval-gated commands exit 3 until a person approves.\n- The parity test covers each command's mapping.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/headless-and-agents.md#identity-and-admin`\n- `.claude/skills/bandwise-builder/references/headless-and-agents.md#goals-sets-and-releases`\n- `.claude/skills/bandwise-builder/references/headless-and-agents.md#datasets-evals-and-runs`\n- `.claude/skills/bandwise-builder/references/headless-and-agents.md#review-feedback-reports-and-events`\n\nNote: Split from the phase-3.md @bandwise/cli item (P3-22 to P3-24), because it is larger than 8 points.\n\nLocal ID: P3-23 (docs/linear-backlog.md)",
      "blockedBy": [
        "P3-22",
        "P3-01",
        "P3-02",
        "P3-03",
        "P3-04",
        "P3-21"
      ],
      "milestone": "Phase 3: Console and management API",
      "linearId": "NSI-596"
    },
    {
      "localId": "P3-24",
      "project": "Bandwise",
      "title": "Add specs as code: spec pull, push, diff, validate, datasets push",
      "labels": [
        "Integrations",
        "bandwise:headless",
        "agent-created"
      ],
      "estimate": 5,
      "state": "Backlog",
      "description": "Specs live in the customer repo and publish without an app redeploy.\n\nAcceptance criteria:\n- Repo layout `bandwise.config.json`, `bandwise/sets/<slug>.json` and `bandwise/datasets/<slug>/<name>.jsonl`. `.bandwise/specs.json` keeps the draft ETag for `If-Match`.\n- `spec pull`, `push` (with `--create`), `diff` and `validate` map to their operations. Versions record `source` and `source_ref`.\n- `datasets push` sends only new lines and stops with exit 1 when earlier lines changed.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/headless-and-agents.md#specs-as-code`\n- `.claude/skills/bandwise-builder/references/headless-and-agents.md#datasets-evals-and-runs`\n\nNote: Split from the phase-3.md @bandwise/cli item (P3-22 to P3-24), because it is larger than 8 points.\n\nLocal ID: P3-24 (docs/linear-backlog.md)",
      "blockedBy": [
        "P3-22",
        "P3-01",
        "P3-03"
      ],
      "milestone": "Phase 3: Console and management API",
      "linearId": "NSI-598"
    },
    {
      "localId": "P3-25",
      "project": "Bandwise",
      "title": "Ship the MCP stdio server with the Phase 3 curated tools",
      "labels": [
        "Integrations",
        "bandwise:headless",
        "agent-created"
      ],
      "estimate": 8,
      "state": "Backlog",
      "description": "Agents manage Bandwise through MCP with the same rules as the CLI.\n\nAcceptance criteria:\n- `packages/mcp-server` runs over stdio and authenticates with an agent token (`BANDWISE_TOKEN` or a profile), never an `sk_` token or a TypeSafe key.\n- Every Phase 3 curated tool maps to its operation, with JSON Schema from the zod input and `readOnlyHint` and `destructiveHint` from the registry.\n- A gated call returns the pending approval and its URL. One server entry per profile.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/headless-and-agents.md#mcp-server`\n\nLocal ID: P3-25 (docs/linear-backlog.md)",
      "blockedBy": [
        "P3-01",
        "P3-02",
        "P3-03",
        "P3-04",
        "P3-20",
        "P3-21",
        "P2-07"
      ],
      "milestone": "Phase 3: Console and management API",
      "linearId": "NSI-600"
    },
    {
      "localId": "P3-26",
      "project": "Bandwise",
      "title": "Regenerate OpenAPI and MSW mocks from the registry",
      "labels": [
        "Platform / Tenancy",
        "bandwise:headless",
        "bandwise:contract",
        "agent-created"
      ],
      "estimate": 2,
      "state": "Backlog",
      "description": "Clients build against real shapes, not placeholders.\n\nAcceptance criteria:\n- `openapi.json` and the MSW handlers regenerate from the registry with no placeholder shapes left for Phase 2 and Phase 3 operations.\n- The snapshot test passes, and the Embed Kit builds against the mocks.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/management-api.md#openapi-and-the-parity-test`\n- `.claude/skills/bandwise-builder/references/api.md`\n\nLocal ID: P3-26 (docs/linear-backlog.md)",
      "blockedBy": [
        "P3-01",
        "P3-02",
        "P3-03",
        "P3-04"
      ],
      "milestone": "Phase 3: Console and management API",
      "linearId": "NSI-602"
    },
    {
      "localId": "P3-27",
      "project": "Bandwise",
      "title": "Build the playground with structural and behavioral diffs",
      "labels": [
        "Console UI",
        "agent-created"
      ],
      "estimate": 5,
      "state": "Backlog",
      "description": "People compare two versions before they publish.\n\nAcceptance criteria:\n- Pick two versions and one state or a dataset. Show the structural diff, the behavioral diff, a flipped cases table and the cost delta.\n- Runs through `set.compare` in the eval limiter bucket.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/phases/phase-3.md#test-and-learn`\n- `.claude/skills/bandwise-builder/references/management-api.md#datasets-evals-and-jobs`\n\nLocal ID: P3-27 (docs/linear-backlog.md)",
      "blockedBy": [
        "P3-03",
        "P3-14"
      ],
      "milestone": "Phase 3: Console and management API",
      "linearId": "NSI-603"
    },
    {
      "localId": "P3-28",
      "project": "Bandwise",
      "title": "Build the runs explorer and run detail",
      "labels": [
        "Console UI",
        "agent-created"
      ],
      "estimate": 3,
      "state": "Backlog",
      "description": "People find any run and see what happened in it.\n\nAcceptance criteria:\n- `run.list` filters by set, version, channel, source, status, band, action and date range.\n- Run detail shows per-stage payloads and answers. State shows only when the set stored it.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/management-api.md#runs-and-usage`\n\nLocal ID: P3-28 (docs/linear-backlog.md)",
      "blockedBy": [
        "P3-04"
      ],
      "milestone": "Phase 3: Console and management API",
      "linearId": "NSI-605"
    },
    {
      "localId": "P3-29",
      "project": "Bandwise",
      "title": "Build the review queue for action and label items",
      "labels": [
        "Console UI",
        "agent-created"
      ],
      "estimate": 5,
      "state": "Backlog",
      "description": "Reviewers work one queue for decisions and labels.\n\nAcceptance criteria:\n- Kind `action` and `label` items show the reason each was picked. Assign, resolve, dismiss, add to dataset and SLA timers work.\n- Agent resolutions wait in `pending_confirmation` until a person confirms them.\n- Resolving an item can add a dataset case.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/effectiveness-loop.md#4-labeling-policy-phase-3`\n- `.claude/skills/bandwise-builder/references/management-api.md#review-and-feedback`\n\nLocal ID: P3-29 (docs/linear-backlog.md)",
      "blockedBy": [
        "P3-03"
      ],
      "milestone": "Phase 3: Console and management API",
      "linearId": "NSI-606"
    },
    {
      "localId": "P3-30",
      "project": "Bandwise",
      "title": "Build the audit sampler per the labeling policy",
      "labels": [
        "Quality / Learning",
        "agent-created"
      ],
      "estimate": 5,
      "state": "Backlog",
      "description": "A random audit sample keeps precision honest in every rollout stage.\n\nAcceptance criteria:\n- `selectForLabeling` in `packages/core/src/learning` takes injected randomness. Audit picks come first, uniform per band, and store the rate used, lowering it for the rest of the day when the budget runs short.\n- Targeted picks carry `sample_rate` null and never feed gates or health precision.\n- `RunSink` writes label items in the run's transaction. Label items never block the caller or change `effectiveAction`.\n- A seeded run stream with a known precision gives the same estimate at any audit rate, within its interval.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/effectiveness-loop.md#4-labeling-policy-phase-3`\n- `.claude/skills/bandwise-builder/references/architecture.md#ports`\n- `.claude/skills/bandwise-builder/references/effectiveness-loop.md#tests-this-loop-needs`\n\nLocal ID: P3-30 (docs/linear-backlog.md)",
      "blockedBy": [
        "P1-19",
        "P0-10"
      ],
      "milestone": "Phase 3: Console and management API",
      "linearId": "NSI-607"
    },
    {
      "localId": "P3-31",
      "project": "Bandwise",
      "title": "Build dataset screens with fixed splits and snapshots",
      "labels": [
        "Console UI",
        "agent-created"
      ],
      "estimate": 3,
      "state": "Backlog",
      "description": "People build and freeze datasets without ever seeing the test split.\n\nAcceptance criteria:\n- Create datasets, import JSONL, and browse drafting and calibration cases (never test) with each case's split shown.\n- Take snapshots (`dataset_snapshots`).\n\nRefs:\n- `.claude/skills/bandwise-builder/references/effectiveness-loop.md#13-data-for-learning`\n- `.claude/skills/bandwise-builder/references/management-api.md#datasets-evals-and-jobs`\n\nLocal ID: P3-31 (docs/linear-backlog.md)",
      "blockedBy": [
        "P3-03"
      ],
      "milestone": "Phase 3: Console and management API",
      "linearId": "NSI-609"
    },
    {
      "localId": "P3-32",
      "project": "Bandwise",
      "title": "Build eval runs on snapshots with calibration charts",
      "labels": [
        "Console UI",
        "bandwise:models",
        "agent-created"
      ],
      "estimate": 5,
      "state": "Backlog",
      "description": "People see how a version and model perform on a fixed snapshot.\n\nAcceptance criteria:\n- Start `eval.run` on a `snapshotId` with an optional model.\n- Show per-question and per-band metrics with Wilson lower bounds, the reliability table and calibration charts.\n- Each eval run records its model and snapshot.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/testing.md#evals-packagesevals`\n- `.claude/skills/bandwise-builder/references/confidence-policy.md#calibration-targets-evals`\n\nLocal ID: P3-32 (docs/linear-backlog.md)",
      "blockedBy": [
        "P3-03",
        "P3-16"
      ],
      "milestone": "Phase 3: Console and management API",
      "linearId": "NSI-611"
    },
    {
      "localId": "P3-33",
      "project": "Bandwise",
      "title": "Build the Definition Studio operations and server holdout rules",
      "labels": [
        "Platform / Tenancy",
        "bandwise:headless",
        "Security",
        "agent-created"
      ],
      "estimate": 8,
      "state": "Backlog",
      "description": "Studio sessions work the same for people and agents, with holdout enforced by the server.\n\nAcceptance criteria:\n- `studio_sessions` and the `studio.*` operations: list, create, get, add_examples, draft_definition, decompose, calibrate, request_labels and promote.\n- Drafting and decomposing call `llm-client` with the drafting split only.\n- Calibration is aggregate by default, and `includeCases: true` burns those cases. The test split is never returned. Promotion returns pass or fail and aggregate metrics.\n- `studio.request_labels` creates label items with reason `studio`. Any member with `sets:write` can resume a session.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/definition-studio.md#headless-studio-and-holdout-rules`\n- `.claude/skills/bandwise-builder/references/management-api.md#definition-studio`\n\nNote: Split by lane from the phase-3.md Definition Studio item (P3-33, P3-34).\n\nLocal ID: P3-33 (docs/linear-backlog.md)",
      "blockedBy": [
        "P3-03",
        "P1-10"
      ],
      "milestone": "Phase 3: Console and management API",
      "linearId": "NSI-612"
    },
    {
      "localId": "P3-34",
      "project": "Bandwise",
      "title": "Build the Definition Studio wizard",
      "labels": [
        "Console UI",
        "agent-created"
      ],
      "estimate": 5,
      "state": "Backlog",
      "description": "People turn a fuzzy question into narrow checks tested against their own judgment.\n\nAcceptance criteria:\n- The six wizard steps run on the `studio.*` operations: capture intent (with the 10-second fit test), draft a definition, decompose into checks, combine, calibrate and promote.\n- Playwright covers the Studio happy path.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/definition-studio.md#wizard-steps`\n- `.claude/skills/bandwise-builder/references/definition-studio.md#fit-test-first-the-10-second-rule`\n- `.claude/skills/bandwise-builder/references/testing.md#playwright`\n\nNote: Split by lane from the phase-3.md Definition Studio item (P3-33, P3-34).\n\nLocal ID: P3-34 (docs/linear-backlog.md)",
      "blockedBy": [
        "P3-33"
      ],
      "milestone": "Phase 3: Console and management API",
      "linearId": "NSI-614"
    },
    {
      "localId": "P3-35",
      "project": "Bandwise",
      "title": "Build the gate evaluator with Wilson lower bounds",
      "labels": [
        "Quality / Learning",
        "agent-created"
      ],
      "estimate": 5,
      "state": "Backlog",
      "description": "Rollout and publish gates use lower bounds, never point estimates.\n\nAcceptance criteria:\n- Pure gate logic in `packages/core/src/learning` covers each move in confidence-policy.md and compares the 95 percent Wilson lower bound (Kish effective sample size for weighted audit rows) with the goal's `QualityTarget`.\n- Below `minLabeledHigh` a gate returns `insufficient_data`, never pass.\n- The same-snapshot regression gate uses `gate_margins.coverageDrop` and `gate_margins.reviewLoadRise` (defaults 0.02 and 0.10).\n- Precision counts only the truth rows defined in effectiveness-loop.md section 2. Results are `GateResult` items.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/effectiveness-loop.md#5-quality-targets-and-gates-phase-3`\n- `.claude/skills/bandwise-builder/references/effectiveness-loop.md#2-definitions`\n- `.claude/skills/bandwise-builder/references/confidence-policy.md#default-gates-production-channel-editable-per-set-stricter-for-high-risk-sets`\n- `.claude/skills/bandwise-builder/references/testing.md#evals-packagesevals`\n\nLocal ID: P3-35 (docs/linear-backlog.md)",
      "blockedBy": [
        "P0-10"
      ],
      "milestone": "Phase 3: Console and management API",
      "linearId": "NSI-616"
    },
    {
      "localId": "P3-36",
      "project": "Bandwise",
      "title": "Run the hourly gate evaluator and auto-demote job",
      "labels": [
        "Quality / Learning",
        "agent-created"
      ],
      "estimate": 5,
      "state": "Backlog",
      "description": "Live sets that stop meeting their target step down on their own.\n\nAcceptance criteria:\n- Hourly, per production channel. Emits `rollout.gate_met` when the next stage's gates are met.\n- Auto-demote moves `full` to `controlled` and `controlled` to `shadow` through `rollout.change` as the system actor, and never sets `paused`. Triggers: the precision lower bound below target over 7 days, band-mix PSI above 0.2 against the baseline, or a resolved model change.\n- Emits `rollout.auto_demoted` and `alert.raised` (`precision_below_target`, `band_drift`).\n- An injected precision drop demotes a `full` set to `controlled`.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/confidence-policy.md#auto-demote`\n- `.claude/skills/bandwise-builder/references/effectiveness-loop.md#15-jobs`\n\nLocal ID: P3-36 (docs/linear-backlog.md)",
      "blockedBy": [
        "P3-35",
        "P3-02"
      ],
      "milestone": "Phase 3: Console and management API",
      "linearId": "NSI-617"
    },
    {
      "localId": "P3-37",
      "project": "Bandwise",
      "title": "Warn when a live set has no truth source",
      "labels": [
        "Quality / Learning",
        "agent-created"
      ],
      "estimate": 2,
      "state": "Backlog",
      "description": "A set with nothing to measure against never looks healthy by accident.\n\nAcceptance criteria:\n- A set with no app feedback and no audit sample shows the warning on `rollout.get` and in the console.\n- It raises `alert.raised` with kind `no_truth_source`, and its precision-based auto-demote is marked inactive.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/effectiveness-loop.md#5-quality-targets-and-gates-phase-3`\n- `.claude/skills/bandwise-builder/references/confidence-policy.md#auto-demote`\n\nLocal ID: P3-37 (docs/linear-backlog.md)",
      "blockedBy": [
        "P3-36",
        "P3-21",
        "P3-30"
      ],
      "milestone": "Phase 3: Console and management API",
      "linearId": "NSI-619"
    },
    {
      "localId": "P3-38",
      "project": "Bandwise",
      "title": "Build the platform admin Models page",
      "labels": [
        "Console UI",
        "bandwise:models",
        "agent-created"
      ],
      "estimate": 3,
      "state": "Backlog",
      "description": "The platform admin reviews new models before any org can publish on them.\n\nAcceptance criteria:\n- Review unreviewed models and set status, limits, question types, weaknesses, `supersedes` and `retireAt` through `platform_model.update`.\n- Every write is audited.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/system-one-models.md#5-lifecycle`\n- `.claude/skills/bandwise-builder/references/system-one-models.md#12-recipe-add-a-new-system-one-model`\n\nLocal ID: P3-38 (docs/linear-backlog.md)",
      "blockedBy": [
        "P3-04",
        "P1-20"
      ],
      "milestone": "Phase 3: Console and management API",
      "linearId": "NSI-620"
    },
    {
      "localId": "P3-39",
      "project": "Bandwise",
      "title": "Build the org model list",
      "labels": [
        "Console UI",
        "bandwise:models",
        "agent-created"
      ],
      "estimate": 2,
      "state": "Backlog",
      "description": "Org members see which models they can use and how each behaves.\n\nAcceptance criteria:\n- `model.list` shows each reachable model with status, pinned or moving, limits and the default.\n- The registry sync, alias probe and contract watch jobs already run from Phase 1 (P1-20).\n\nRefs:\n- `.claude/skills/bandwise-builder/references/system-one-models.md#14-default-model`\n- `.claude/skills/bandwise-builder/references/management-api.md#models`\n\nLocal ID: P3-39 (docs/linear-backlog.md)",
      "blockedBy": [
        "P3-04"
      ],
      "milestone": "Phase 3: Console and management API",
      "linearId": "NSI-622"
    },
    {
      "localId": "P3-40",
      "project": "Bandwise",
      "title": "Enforce model lints at publish",
      "labels": [
        "Platform / Tenancy",
        "bandwise:models",
        "agent-created"
      ],
      "estimate": 2,
      "state": "Backlog",
      "description": "No set reaches a channel on a model that is not ready for it.\n\nAcceptance criteria:\n- `set.publish` and `channel.promote` pass a `PublishCtx` with `reachableModels` and `allowPreviewModels`, so every model lint always runs at publish.\n- A set cannot be published on an unreviewed model.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/architecture.md#lints-packagescoresrclints`\n- `.claude/skills/bandwise-builder/references/system-one-models.md#7-limits-as-data`\n\nLocal ID: P3-40 (docs/linear-backlog.md)",
      "blockedBy": [
        "P3-02",
        "P1-06"
      ],
      "milestone": "Phase 3: Console and management API",
      "linearId": "NSI-623"
    },
    {
      "localId": "P3-41",
      "project": "Bandwise",
      "title": "Build savings and usage dashboards for org, project and set",
      "labels": [
        "Console UI",
        "agent-created"
      ],
      "estimate": 5,
      "state": "Backlog",
      "description": "Admins see what System One cost and saved.\n\nAcceptance criteria:\n- From `usage.get`: runs, System One spend and savings by kind, labeled as estimates with their assumptions shown.\n- Would-be savings from suppressed runs show apart.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/savings-model.md#rollups-usage_daily`\n- `.claude/skills/bandwise-builder/references/savings-model.md#honesty-rules`\n\nLocal ID: P3-41 (docs/linear-backlog.md)",
      "blockedBy": [
        "P3-04",
        "P2-25"
      ],
      "milestone": "Phase 3: Console and management API",
      "linearId": "NSI-624"
    },
    {
      "localId": "P3-42",
      "project": "Bandwise",
      "title": "Build the standard reports with CSV export and monthly PDF",
      "labels": [
        "Billing",
        "agent-created"
      ],
      "estimate": 5,
      "state": "Backlog",
      "description": "Every standard report is available in the console, as CSV, as PDF and headless.\n\nAcceptance criteria:\n- `usage-and-cost`, `savings-and-roi`, `band-distribution`, `review-queue`, `human-agreement`, `model-upgrades` and `rate-headroom` through `report.get` with csv and pdf. `effectiveness` follows once set health lands (P3b-06).\n- The portfolio view loops over each org with that org's own tenant context. The platform admin sees the reports across orgs.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/savings-model.md#standard-admin-reports`\n\nLocal ID: P3-42 (docs/linear-backlog.md)",
      "blockedBy": [
        "P3-04",
        "P2-25"
      ],
      "milestone": "Phase 3: Console and management API",
      "linearId": "NSI-626"
    },
    {
      "localId": "P3-43",
      "project": "Bandwise",
      "title": "Add the model upgrades report and alias-moved and deprecation alerts",
      "labels": [
        "Billing",
        "bandwise:models",
        "agent-created"
      ],
      "estimate": 3,
      "state": "Backlog",
      "description": "Admins learn when a model moves or retires.\n\nAcceptance criteria:\n- Alias-moved (`model.alias_moved`) and deprecation alerts show in the console and go out by email.\n- The `model-upgrades` report lists pinned sets behind the latest stable model and alias sets whose resolved model changed. Eval deltas arrive in Phase 3b (P3b-21).\n\nRefs:\n- `.claude/skills/bandwise-builder/references/savings-model.md#standard-admin-reports`\n- `.claude/skills/bandwise-builder/references/system-one-models.md#6-detection`\n\nLocal ID: P3-43 (docs/linear-backlog.md)",
      "blockedBy": [
        "P3-42",
        "P1-20"
      ],
      "milestone": "Phase 3: Console and management API",
      "linearId": "NSI-627"
    },
    {
      "localId": "P3-44",
      "project": "Bandwise",
      "title": "Build the audit log viewer with filters and CSV export",
      "labels": [
        "Console UI",
        "Security",
        "agent-created"
      ],
      "estimate": 2,
      "state": "Backlog",
      "description": "Admins answer who changed what, through which client, and who approved it.\n\nAcceptance criteria:\n- `audit.list` filters by action, user, token and date range, with CSV export. A CSV export is itself audited.\n- Rows show actor type, client, approval id and the impersonator when present.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/security.md#audit`\n- `.claude/skills/bandwise-builder/references/management-api.md#reports-audit-and-events`\n\nLocal ID: P3-44 (docs/linear-backlog.md)",
      "blockedBy": [
        "P3-04"
      ],
      "milestone": "Phase 3: Console and management API",
      "linearId": "NSI-628"
    },
    {
      "localId": "P3-45",
      "project": "Bandwise",
      "title": "Pass the Phase 3 exit gate",
      "labels": [
        "QA / Evals",
        "bandwise:headless",
        "Security",
        "agent-created"
      ],
      "estimate": 5,
      "state": "Backlog",
      "description": "Confirm Phase 3 is done. Phases 3b, 4 and 4b then run in parallel.\n\nAcceptance criteria:\n- Playwright: create a set, publish, set the production rollout to `shadow`, call it through the API, publish v2, the API serves v2 within 30 seconds with no redeploy, roll back, and the API serves v1.\n- With production at `controlled`, medium and low band answers on gating decisions create review items of kind `action`, and resolving one can add a dataset case.\n- Headless gate: an agent with only an agent token, using only the CLI or MCP, creates a set from a template, edits and validates the draft (fixing JSON lint errors), runs an eval, publishes to staging, promotes to production, sets the production rollout to shadow, resolves review items and reads the savings report. With the set marked protected, it requests a production publish of v2, which stays pending until a person approves it in the console, and rolls back through the API.\n- Replaying a publish with the same `Idempotency-Key` creates no new version.\n- A viewer cannot mutate anything. An agent token without a scope gets `403 insufficient_scope` in its own org and `404` across orgs.\n- Every mutation writes an audit row with actor type, client and approval id.\n- An injected precision drop auto-demotes a `full` set to `controlled`.\n- A set cannot be published on an unreviewed model.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/phases/phase-3.md#exit-gate`\n- `.claude/skills/bandwise-builder/references/headless-and-agents.md#a-manage-from-template-to-production-with-approval-phase-3`\n\nLocal ID: P3-45 (docs/linear-backlog.md)",
      "blockedBy": [
        "P3-05",
        "P3-06",
        "P3-07",
        "P3-09",
        "P3-10",
        "P3-11",
        "P3-12",
        "P3-13",
        "P3-15",
        "P3-17",
        "P3-18",
        "P3-19",
        "P3-23",
        "P3-24",
        "P3-25",
        "P3-26",
        "P3-27",
        "P3-28",
        "P3-29",
        "P3-31",
        "P3-34",
        "P3-37",
        "P3-38",
        "P3-39",
        "P3-40",
        "P3-41",
        "P3-43",
        "P3-44"
      ],
      "milestone": "Phase 3: Console and management API",
      "linearId": "NSI-630"
    },
    {
      "localId": "P3b-01",
      "project": "Bandwise",
      "title": "Build policy replay in packages/core/src/learning",
      "labels": [
        "Quality / Learning",
        "agent-created"
      ],
      "estimate": 5,
      "state": "Backlog",
      "description": "Candidate policies are scored on stored answers at no System One cost.\n\nAcceptance criteria:\n- Re-routes stored answers under a candidate policy with zero System One calls (the transport's call count stays 0).\n- On fixtures, replay under a policy matches a live run with that policy.\n- Replay reads the stored `checks` and never re-runs them, so a purged run replays the same relevance as long as no condition reads `input`.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/effectiveness-loop.md#6-policy-replay-and-the-threshold-suggester-phase-3b`\n- `.claude/skills/bandwise-builder/references/testing.md#policy-replay-tests`\n\nLocal ID: P3b-01 (docs/linear-backlog.md)",
      "blockedBy": [
        "P1-03"
      ],
      "milestone": "Phase 3b: Effectiveness loop",
      "linearId": "NSI-571"
    },
    {
      "localId": "P3b-02",
      "project": "Bandwise",
      "title": "Build suggestThresholds returning ThresholdProposal",
      "labels": [
        "Quality / Learning",
        "agent-created"
      ],
      "estimate": 5,
      "state": "Backlog",
      "description": "Thresholds are suggested from labels, with the target as a hard floor.\n\nAcceptance criteria:\n- Picks the loosest threshold whose Wilson lower bound meets `highPrecision` or `mediumPrecision`, and never proposes one that misses it.\n- Returns `insufficientData` below the label minimum, with `proposed` equal to `current`.\n- Covers choice and score thresholds, `perOption` overrides with enough labels, and noul `trueAt`, `falseAt` and `reviewMargin`. Leaves composite `levelThresholds` alone.\n- Reads only counted truth rows and the drafting and calibration splits, never the test split.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/effectiveness-loop.md#6-policy-replay-and-the-threshold-suggester-phase-3b`\n- `.claude/skills/bandwise-builder/references/testing.md#policy-replay-tests`\n\nNote: Split by lane from the phase-3b.md threshold suggester item (P3b-02 to P3b-05): Quality / Learning writes the logic, Platform the operation, Console UI the editor action, Integrations the CLI and MCP surface.\n\nLocal ID: P3b-02 (docs/linear-backlog.md)",
      "blockedBy": [
        "P3b-01",
        "P3-35"
      ],
      "milestone": "Phase 3b: Effectiveness loop",
      "linearId": "NSI-574"
    },
    {
      "localId": "P3b-03",
      "project": "Bandwise",
      "title": "Add the policy.suggest operation as a job",
      "labels": [
        "Platform / Tenancy",
        "bandwise:headless",
        "agent-created"
      ],
      "estimate": 3,
      "state": "Backlog",
      "description": "Anyone can request threshold suggestions through the API.\n\nAcceptance criteria:\n- `POST /api/v1/sets/{ref}/policy-suggestions` returns `202 { jobId }` and replays with zero System One calls.\n- With `apply: true` it writes the suggested thresholds to the draft through `draft.update`, needs `sets:write` and `If-Match`, and fails with `412` if the draft changed.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/management-api.md#health-tuning-and-proposals-phase-3b`\n\nNote: Split by lane from the phase-3b.md threshold suggester item (P3b-02 to P3b-05): Quality / Learning writes the logic, Platform the operation, Console UI the editor action, Integrations the CLI and MCP surface.\n\nLocal ID: P3b-03 (docs/linear-backlog.md)",
      "blockedBy": [
        "P3b-02",
        "P3-16"
      ],
      "milestone": "Phase 3b: Effectiveness loop",
      "linearId": "NSI-577"
    },
    {
      "localId": "P3b-04",
      "project": "Bandwise",
      "title": "Add \"Suggest from labels\" to the policy editor",
      "labels": [
        "Console UI",
        "agent-created"
      ],
      "estimate": 2,
      "state": "Backlog",
      "description": "People tune thresholds from their own labels in the editor.\n\nAcceptance criteria:\n- Shows the curve with precision, lower bound, coverage and net value per candidate threshold.\n- Applying writes the draft only.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/effectiveness-loop.md#6-policy-replay-and-the-threshold-suggester-phase-3b`\n\nNote: Split by lane from the phase-3b.md threshold suggester item (P3b-02 to P3b-05): Quality / Learning writes the logic, Platform the operation, Console UI the editor action, Integrations the CLI and MCP surface.\n\nLocal ID: P3b-04 (docs/linear-backlog.md)",
      "blockedBy": [
        "P3b-03",
        "P3-11"
      ],
      "milestone": "Phase 3b: Effectiveness loop",
      "linearId": "NSI-579"
    },
    {
      "localId": "P3b-05",
      "project": "Bandwise",
      "title": "Add MCP suggest_thresholds and bandwise tune",
      "labels": [
        "Integrations",
        "bandwise:headless",
        "agent-created"
      ],
      "estimate": 2,
      "state": "Backlog",
      "description": "Agents tune thresholds headlessly.\n\nAcceptance criteria:\n- `bandwise tune <slug> [--apply]` and MCP `suggest_thresholds` (with `apply`) map to `policy.suggest`.\n- `--apply` sends `If-Match` from `.bandwise/specs.json` or `draft.get`. The parity test covers both.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/headless-and-agents.md#effectiveness-loop`\n- `.claude/skills/bandwise-builder/references/headless-and-agents.md#mcp-server`\n\nNote: Split by lane from the phase-3b.md threshold suggester item (P3b-02 to P3b-05): Quality / Learning writes the logic, Platform the operation, Console UI the editor action, Integrations the CLI and MCP surface.\n\nLocal ID: P3b-05 (docs/linear-backlog.md)",
      "blockedBy": [
        "P3b-03",
        "P3-23",
        "P3-25"
      ],
      "milestone": "Phase 3b: Effectiveness loop",
      "linearId": "NSI-582"
    },
    {
      "localId": "P3b-06",
      "project": "Bandwise",
      "title": "Build the question_daily rollup and SetHealth",
      "labels": [
        "Quality / Learning",
        "agent-created"
      ],
      "estimate": 5,
      "state": "Backlog",
      "description": "Each set, version and question reports its health against its target.\n\nAcceptance criteria:\n- A nightly `question_daily` rollup feeds `SetHealth` per set, version and question.\n- Status order `no_truth_source`, `drifting`, `insufficient_data`, `below_target`, `ok`, against a baseline of the first 14 days after the last promotion. There is no single score.\n- A hash-only set says plainly that review shows no content and replay is unavailable.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/effectiveness-loop.md#7-set-health-phase-3b`\n- `.claude/skills/bandwise-builder/references/data-model.md#rollups`\n\nLocal ID: P3b-06 (docs/linear-backlog.md)",
      "blockedBy": [
        "P3-35",
        "P3-30"
      ],
      "milestone": "Phase 3b: Effectiveness loop",
      "linearId": "NSI-584"
    },
    {
      "localId": "P3b-07",
      "project": "Bandwise",
      "title": "Add the health.get and health.list operations",
      "labels": [
        "Platform / Tenancy",
        "bandwise:headless",
        "agent-created"
      ],
      "estimate": 2,
      "state": "Backlog",
      "description": "Set health is readable through the API.\n\nAcceptance criteria:\n- `GET /api/v1/sets/{ref}/health` and `GET /api/v1/health` (worst first by status order, then by review load), scope `reports:read`.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/management-api.md#health-tuning-and-proposals-phase-3b`\n\nLocal ID: P3b-07 (docs/linear-backlog.md)",
      "blockedBy": [
        "P3b-06"
      ],
      "milestone": "Phase 3b: Effectiveness loop",
      "linearId": "NSI-586"
    },
    {
      "localId": "P3b-08",
      "project": "Bandwise",
      "title": "Build the Health tab and the org \"Needs attention\" list",
      "labels": [
        "Console UI",
        "agent-created"
      ],
      "estimate": 3,
      "state": "Backlog",
      "description": "People see which sets need attention first.\n\nAcceptance criteria:\n- The set page has a Health tab with per-question metrics and flags.\n- The org \"Needs attention\" list shows sets worst first.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/effectiveness-loop.md#7-set-health-phase-3b`\n\nLocal ID: P3b-08 (docs/linear-backlog.md)",
      "blockedBy": [
        "P3b-07"
      ],
      "milestone": "Phase 3b: Effectiveness loop",
      "linearId": "NSI-588"
    },
    {
      "localId": "P3b-09",
      "project": "Bandwise",
      "title": "Add MCP get_set_health and bandwise health",
      "labels": [
        "Integrations",
        "bandwise:headless",
        "agent-created"
      ],
      "estimate": 1,
      "state": "Backlog",
      "description": "Agents read set health headlessly.\n\nAcceptance criteria:\n- `bandwise health [<slug>]` and MCP `get_set_health` map to `health.get` and `health.list`.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/headless-and-agents.md#effectiveness-loop`\n- `.claude/skills/bandwise-builder/references/headless-and-agents.md#mcp-server`\n\nLocal ID: P3b-09 (docs/linear-backlog.md)",
      "blockedBy": [
        "P3b-07",
        "P3-23",
        "P3-25"
      ],
      "milestone": "Phase 3b: Effectiveness loop",
      "linearId": "NSI-591"
    },
    {
      "localId": "P3b-10",
      "project": "Bandwise",
      "title": "Add the proposals table and proposal operations",
      "labels": [
        "Platform / Tenancy",
        "bandwise:headless",
        "agent-created"
      ],
      "estimate": 3,
      "state": "Backlog",
      "description": "Recommendations and improvements share one queue that people and agents work.\n\nAcceptance criteria:\n- `proposals` holds the eight kinds with `evidence`, `metrics_delta`, `rationale` and `draft_version_id`. One open proposal per set, kind and decision. Open proposals expire after 30 days or when the evidence no longer applies.\n- `proposal.list`, `proposal.accept` (applies the patch through `draft.update` with `If-Match`; `label_more` and `demote` return the operation to call) and `proposal.reject`.\n- Each new proposal emits `proposal.created`.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/effectiveness-loop.md#8-proposals-phase-3b`\n- `.claude/skills/bandwise-builder/references/management-api.md#health-tuning-and-proposals-phase-3b`\n\nLocal ID: P3b-10 (docs/linear-backlog.md)",
      "blockedBy": [
        "P3-01"
      ],
      "milestone": "Phase 3b: Effectiveness loop",
      "linearId": "NSI-597"
    },
    {
      "localId": "P3b-11",
      "project": "Bandwise",
      "title": "Build the weekly threshold-refit job and health-rule proposals",
      "labels": [
        "Quality / Learning",
        "agent-created"
      ],
      "estimate": 3,
      "state": "Backlog",
      "description": "The loop suggests improvements on its own schedule.\n\nAcceptance criteria:\n- Weekly `tune_thresholds` proposals when coverage can rise at the same guaranteed precision or precision is below target.\n- Nightly health rules open `label_more`, `demote`, `add_none_option` and stability proposals per effectiveness-loop.md sections 8 and 12.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/effectiveness-loop.md#15-jobs`\n- `.claude/skills/bandwise-builder/references/effectiveness-loop.md#8-proposals-phase-3b`\n- `.claude/skills/bandwise-builder/references/effectiveness-loop.md#12-stability-phase-3b`\n\nLocal ID: P3b-11 (docs/linear-backlog.md)",
      "blockedBy": [
        "P3b-02",
        "P3b-06",
        "P3b-10"
      ],
      "milestone": "Phase 3b: Effectiveness loop",
      "linearId": "NSI-599"
    },
    {
      "localId": "P3b-12",
      "project": "Bandwise",
      "title": "Build the proposals inbox",
      "labels": [
        "Console UI",
        "agent-created"
      ],
      "estimate": 3,
      "state": "Backlog",
      "description": "People review and accept proposals in one place.\n\nAcceptance criteria:\n- Lists proposals with evidence, metric deltas and rationale.\n- Accepting creates a draft only. Nothing publishes on its own.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/effectiveness-loop.md#8-proposals-phase-3b`\n\nLocal ID: P3b-12 (docs/linear-backlog.md)",
      "blockedBy": [
        "P3b-10"
      ],
      "milestone": "Phase 3b: Effectiveness loop",
      "linearId": "NSI-601"
    },
    {
      "localId": "P3b-13",
      "project": "Bandwise",
      "title": "Add MCP proposal tools, update_set and bandwise proposals",
      "labels": [
        "Integrations",
        "bandwise:headless",
        "agent-created"
      ],
      "estimate": 2,
      "state": "Backlog",
      "description": "Agents work the proposal queue headlessly.\n\nAcceptance criteria:\n- `bandwise proposals list|accept|reject` and MCP `list_proposals` and `decide_proposal` map to the proposal operations.\n- MCP `update_set` maps to `set.update`, so an agent can act on an accepted `label_more` proposal.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/headless-and-agents.md#effectiveness-loop`\n- `.claude/skills/bandwise-builder/references/headless-and-agents.md#mcp-server`\n- `.claude/skills/bandwise-builder/references/headless-and-agents.md#c-improve-a-live-set-phase-3b`\n\nLocal ID: P3b-13 (docs/linear-backlog.md)",
      "blockedBy": [
        "P3b-10",
        "P3-23",
        "P3-25"
      ],
      "milestone": "Phase 3b: Effectiveness loop",
      "linearId": "NSI-604"
    },
    {
      "localId": "P3b-14",
      "project": "Bandwise",
      "title": "Add the experiments table and experiment operations",
      "labels": [
        "Platform / Tenancy",
        "bandwise:headless",
        "Security",
        "agent-created"
      ],
      "estimate": 5,
      "state": "Backlog",
      "description": "Champion and challenger comparisons are first-class records.\n\nAcceptance criteria:\n- `experiments` (kind `version`, `model` or `policy`), `release_pointers.active_experiment_id`, and `runs.experiment_id` and `arm`. At most one experiment per set and channel.\n- `experiment.start` (`samplePct` from 0 to 1, default 0.1; above 0.25 it is high risk for agents), `experiment.get`, `experiment.promote` (high; moves the pointer, writes `experiment_promote`, emits `release.promoted` and `experiment.decided`) and `experiment.stop` (toward safety, callable by the system actor).\n\nRefs:\n- `.claude/skills/bandwise-builder/references/management-api.md#experiments-phase-3b`\n- `.claude/skills/bandwise-builder/references/effectiveness-loop.md#9-experiments-phase-3b`\n\nLocal ID: P3b-14 (docs/linear-backlog.md)",
      "blockedBy": [
        "P3-02"
      ],
      "milestone": "Phase 3b: Effectiveness loop",
      "linearId": "NSI-608"
    },
    {
      "localId": "P3b-15",
      "project": "Bandwise",
      "title": "Dual-run the challenger on a sample after the champion responds",
      "labels": [
        "Platform / Tenancy",
        "agent-created"
      ],
      "estimate": 5,
      "state": "Backlog",
      "description": "Challengers are tested on real traffic without touching the caller.\n\nAcceptance criteria:\n- After the champion's result returns, the console run service calls `sampleChallenger` from `core/learning` and runs the challenger off the latency path.\n- The challenger run has `arm` challenger, books experiment cost and no savings, dispatches no actions, creates no action review items and never changes `effectiveAction`.\n- Disagreements create label items with reason `challenger_diff`. Policy experiments replay instead of dual-running.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/architecture.md#run-data-flow`\n- `.claude/skills/bandwise-builder/references/effectiveness-loop.md#9-experiments-phase-3b`\n\nLocal ID: P3b-15 (docs/linear-backlog.md)",
      "blockedBy": [
        "P3b-14"
      ],
      "milestone": "Phase 3b: Effectiveness loop",
      "linearId": "NSI-610"
    },
    {
      "localId": "P3b-16",
      "project": "Bandwise",
      "title": "Start an experiment on production publish of controlled or full sets",
      "labels": [
        "Platform / Tenancy",
        "bandwise:headless",
        "Security",
        "agent-created"
      ],
      "estimate": 3,
      "state": "Backlog",
      "description": "New versions of live sets prove themselves before they take over.\n\nAcceptance criteria:\n- For `set.publish` and `channel.promote` to production at `controlled` or `full` without `skipExperiment`, the pointer stays on the champion, the new version becomes the challenger, and the response includes `experimentId`.\n- `skipExperiment` needs the admin role and is always gated for agents.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/management-api.md#versions-and-releases`\n- `.claude/skills/bandwise-builder/references/architecture.md#managed-live`\n- `.claude/skills/bandwise-builder/references/management-api.md#tests-this-surface-needs`\n\nLocal ID: P3b-16 (docs/linear-backlog.md)",
      "blockedBy": [
        "P3b-14"
      ],
      "milestone": "Phase 3b: Effectiveness loop",
      "linearId": "NSI-613"
    },
    {
      "localId": "P3b-17",
      "project": "Bandwise",
      "title": "Build the experiment scorer job and the promotion rule",
      "labels": [
        "Quality / Learning",
        "agent-created"
      ],
      "estimate": 5,
      "state": "Backlog",
      "description": "Experiments end with a clear, safe result.\n\nAcceptance criteria:\n- Runs hourly while an experiment runs and decides nothing before `min_runs` and `min_labeled`.\n- Stops the experiment (as the system actor) when the challenger cannot win or after 30 days, and emits `experiment.decided`.\n- Promotion rule on the same labeled runs: the challenger's high-band lower bound is at least the champion's, and its coverage drops by no more than `gate_margins.coverageDrop`. Net value is shown and never overrides them.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/effectiveness-loop.md#9-experiments-phase-3b`\n- `.claude/skills/bandwise-builder/references/effectiveness-loop.md#15-jobs`\n\nLocal ID: P3b-17 (docs/linear-backlog.md)",
      "blockedBy": [
        "P3b-14",
        "P3b-01",
        "P3-35"
      ],
      "milestone": "Phase 3b: Effectiveness loop",
      "linearId": "NSI-615"
    },
    {
      "localId": "P3b-18",
      "project": "Bandwise",
      "title": "Add MCP experiment tools and bandwise experiments commands",
      "labels": [
        "Integrations",
        "bandwise:headless",
        "agent-created"
      ],
      "estimate": 2,
      "state": "Backlog",
      "description": "Agents run experiments headlessly, with approval for promotion.\n\nAcceptance criteria:\n- `bandwise experiments start|get|promote|stop` and MCP `start_experiment`, `get_experiment` and `decide_experiment` map to the experiment operations.\n- Promotion by an agent returns a pending approval (exit 3).\n\nRefs:\n- `.claude/skills/bandwise-builder/references/headless-and-agents.md#effectiveness-loop`\n- `.claude/skills/bandwise-builder/references/headless-and-agents.md#mcp-server`\n\nLocal ID: P3b-18 (docs/linear-backlog.md)",
      "blockedBy": [
        "P3b-14",
        "P3-23",
        "P3-25"
      ],
      "milestone": "Phase 3b: Effectiveness loop",
      "linearId": "NSI-618"
    },
    {
      "localId": "P3b-19",
      "project": "Bandwise",
      "title": "Add the set.try_model operation as a job",
      "labels": [
        "Platform / Tenancy",
        "bandwise:models",
        "bandwise:headless",
        "agent-created"
      ],
      "estimate": 5,
      "state": "Backlog",
      "description": "Any set can be tried on a new model with evidence before anyone switches.\n\nAcceptance criteria:\n- `POST /api/v1/sets/{ref}/try-model` builds a candidate spec (production with only the model changed), evals both on the same snapshot, re-tunes thresholds on the candidate's answers, and opens a `model_upgrade` proposal.\n- It never writes the set's draft. Only `proposal.accept` does.\n- It supports `?dryRun=true` and uses the eval limiter bucket.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/management-api.md#models`\n- `.claude/skills/bandwise-builder/references/effectiveness-loop.md#10-new-system-one-models-phase-3b`\n- `.claude/skills/bandwise-builder/references/system-one-models.md#11-new-model-upgrade-flow`\n\nNote: effectiveness-loop.md section 10 still says try-model clones production into a draft. management-api.md (it never writes the draft) wins; that wording fix is pending.\n\nLocal ID: P3b-19 (docs/linear-backlog.md)",
      "blockedBy": [
        "P3b-02",
        "P3b-10",
        "P3-03",
        "P3-16"
      ],
      "milestone": "Phase 3b: Effectiveness loop",
      "linearId": "NSI-621"
    },
    {
      "localId": "P3b-20",
      "project": "Bandwise",
      "title": "Build the model-upgrade candidates job",
      "labels": [
        "Quality / Learning",
        "bandwise:models",
        "agent-created"
      ],
      "estimate": 3,
      "state": "Backlog",
      "description": "Every set that could move to a new model is listed when that model is ready.\n\nAcceptance criteria:\n- Runs when a model becomes `stable` (or `preview` for orgs that allow preview models). It spends nothing.\n- A live set is a candidate when it is pinned to an older model in the same family or to a model in the new model's `supersedes`, and the new model's `questionTypes` cover the set's question types. Candidates found only through `supersedes` are marked cross-family.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/system-one-models.md#6-detection`\n- `.claude/skills/bandwise-builder/references/effectiveness-loop.md#10-new-system-one-models-phase-3b`\n\nLocal ID: P3b-20 (docs/linear-backlog.md)",
      "blockedBy": [
        "P1-20",
        "P3-43"
      ],
      "milestone": "Phase 3b: Effectiveness loop",
      "linearId": "NSI-625"
    },
    {
      "localId": "P3b-21",
      "project": "Bandwise",
      "title": "Add eval deltas to model.upgrades and the model-upgrades report",
      "labels": [
        "Billing",
        "bandwise:models",
        "agent-created"
      ],
      "estimate": 2,
      "state": "Backlog",
      "description": "Admins compare upgrade options with evidence.\n\nAcceptance criteria:\n- `model.upgrades` (`GET /api/v1/model-upgrades`) and the `model-upgrades` report show eval and experiment deltas per pinned set and the cross-family marker.\n- Sets still pinned to a deprecated model are listed.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/savings-model.md#standard-admin-reports`\n- `.claude/skills/bandwise-builder/references/management-api.md#models`\n\nNote: Split by lane from the phase-3b.md item for the Model upgrades page and report (P3b-21, P3b-22).\n\nLocal ID: P3b-21 (docs/linear-backlog.md)",
      "blockedBy": [
        "P3b-20",
        "P3b-19"
      ],
      "milestone": "Phase 3b: Effectiveness loop",
      "linearId": "NSI-629"
    },
    {
      "localId": "P3b-22",
      "project": "Bandwise",
      "title": "Build the Model upgrades page",
      "labels": [
        "Console UI",
        "bandwise:models",
        "agent-created"
      ],
      "estimate": 3,
      "state": "Backlog",
      "description": "People act on model upgrades from one page.\n\nAcceptance criteria:\n- Lists candidate sets per new model with eval deltas, and starts try-model from each row.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/system-one-models.md#11-new-model-upgrade-flow`\n\nNote: Split by lane from the phase-3b.md item for the Model upgrades page and report (P3b-21, P3b-22).\n\nLocal ID: P3b-22 (docs/linear-backlog.md)",
      "blockedBy": [
        "P3b-21"
      ],
      "milestone": "Phase 3b: Effectiveness loop",
      "linearId": "NSI-631"
    },
    {
      "localId": "P3b-23",
      "project": "Bandwise",
      "title": "Add MCP try_model and bandwise upgrade list and try",
      "labels": [
        "Integrations",
        "bandwise:models",
        "bandwise:headless",
        "agent-created"
      ],
      "estimate": 2,
      "state": "Backlog",
      "description": "Agents run model upgrades headlessly.\n\nAcceptance criteria:\n- `bandwise upgrade list` maps to `model.upgrades`, `bandwise upgrade try <slug> --model <id>` and MCP `try_model` map to `set.try_model`.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/headless-and-agents.md#effectiveness-loop`\n- `.claude/skills/bandwise-builder/references/headless-and-agents.md#d-a-new-system-one-model-phase-3b`\n\nLocal ID: P3b-23 (docs/linear-backlog.md)",
      "blockedBy": [
        "P3b-19",
        "P3b-21",
        "P3-23",
        "P3-25"
      ],
      "milestone": "Phase 3b: Effectiveness loop",
      "linearId": "NSI-632"
    },
    {
      "localId": "P3b-24",
      "project": "Bandwise",
      "title": "Build the set.improve job with typed edits and holdout rules",
      "labels": [
        "Quality / Learning",
        "bandwise:headless",
        "agent-created"
      ],
      "estimate": 8,
      "state": "Backlog",
      "description": "Published sets get better wording without leaking the test split.\n\nAcceptance criteria:\n- Opens a Studio session on a published set. Claude, through `llm-client`, proposes `ImproveEdit` items from the drafting split only.\n- Each candidate is scored on the calibration split under the session cost cap and the eval bucket. Only the best is confirmed once on the test split, with aggregate metrics only.\n- The output is a proposal (`question_fix`, `add_none_option`, `split_question` or `narrow_state`) with a draft diff and metric deltas. Accepting writes the draft. Nothing publishes.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/effectiveness-loop.md#11-improve-mode-phase-3b`\n- `.claude/skills/bandwise-builder/references/definition-studio.md#improve-mode`\n- `.claude/skills/bandwise-builder/references/management-api.md#definition-studio`\n\nNote: Split by lane from the phase-3b.md improve mode item (P3b-24 to P3b-26).\n\nLocal ID: P3b-24 (docs/linear-backlog.md)",
      "blockedBy": [
        "P3-33",
        "P3b-10",
        "P1-10"
      ],
      "milestone": "Phase 3b: Effectiveness loop",
      "linearId": "NSI-635"
    },
    {
      "localId": "P3b-25",
      "project": "Bandwise",
      "title": "Build the Studio improve screen",
      "labels": [
        "Console UI",
        "agent-created"
      ],
      "estimate": 3,
      "state": "Backlog",
      "description": "People run improve mode from the Studio.\n\nAcceptance criteria:\n- Shows disagreements per question, candidate edits with calibration scores, and the resulting proposal with its diff and deltas.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/effectiveness-loop.md#11-improve-mode-phase-3b`\n\nNote: Split by lane from the phase-3b.md improve mode item (P3b-24 to P3b-26).\n\nLocal ID: P3b-25 (docs/linear-backlog.md)",
      "blockedBy": [
        "P3b-24",
        "P3-34"
      ],
      "milestone": "Phase 3b: Effectiveness loop",
      "linearId": "NSI-637"
    },
    {
      "localId": "P3b-26",
      "project": "Bandwise",
      "title": "Add bandwise improve and MCP improve_set",
      "labels": [
        "Integrations",
        "bandwise:headless",
        "agent-created"
      ],
      "estimate": 1,
      "state": "Backlog",
      "description": "Agents start improve mode headlessly.\n\nAcceptance criteria:\n- `bandwise improve <slug> [--wait]` and MCP `improve_set` map to `set.improve`.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/headless-and-agents.md#effectiveness-loop`\n- `.claude/skills/bandwise-builder/references/headless-and-agents.md#mcp-server`\n\nNote: Split by lane from the phase-3b.md improve mode item (P3b-24 to P3b-26).\n\nLocal ID: P3b-26 (docs/linear-backlog.md)",
      "blockedBy": [
        "P3b-24",
        "P3-23",
        "P3-25"
      ],
      "milestone": "Phase 3b: Effectiveness loop",
      "linearId": "NSI-639"
    },
    {
      "localId": "P3b-27",
      "project": "Bandwise",
      "title": "Add eval repeats and a per-question stability metric",
      "labels": [
        "QA / Evals",
        "agent-created"
      ],
      "estimate": 3,
      "state": "Backlog",
      "description": "Evals measure how stable each question's answer is.\n\nAcceptance criteria:\n- `--repeats <k>` and `eval.run` `repeats` are off by default. When on, k = 3 on a 10 percent sample of cases within the eval cost cap.\n- Each repeat adds a throwaway `uid` field after validation, outside `input.schema`.\n- Stability is the share of repeated cases whose value and band stay the same. Eval metrics record it and set health shows it.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/effectiveness-loop.md#12-stability-phase-3b`\n- `.claude/skills/bandwise-builder/references/testing.md#evals-packagesevals`\n\nLocal ID: P3b-27 (docs/linear-backlog.md)",
      "blockedBy": [
        "P1-24",
        "P3-03"
      ],
      "milestone": "Phase 3b: Effectiveness loop",
      "linearId": "NSI-641"
    },
    {
      "localId": "P3b-28",
      "project": "Bandwise",
      "title": "Copy labeled and feedback runs into dataset_cases before purge",
      "labels": [
        "Platform / Tenancy",
        "Security",
        "bandwise:tenancy",
        "agent-created"
      ],
      "estimate": 3,
      "state": "Backlog",
      "description": "Labels outlive the state they were made on.\n\nAcceptance criteria:\n- The nightly retention job copies runs picked for labeling or with feedback into `dataset_cases` (`source = 'production'`), redacted per `pii_mode`, with answers, `version_id` and `model_resolved`, before state is purged.\n- Dataset cases follow `dataset_retention_days`.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/effectiveness-loop.md#13-data-for-learning`\n- `.claude/skills/bandwise-builder/references/security.md#pii-and-data-handling`\n\nLocal ID: P3b-28 (docs/linear-backlog.md)",
      "blockedBy": [
        "P3-03",
        "P2-15"
      ],
      "milestone": "Phase 3b: Effectiveness loop",
      "linearId": "NSI-642"
    },
    {
      "localId": "P3b-29",
      "project": "Bandwise",
      "title": "Add the dataset.features endpoint for drafting and calibration",
      "labels": [
        "Platform / Tenancy",
        "Security",
        "agent-created"
      ],
      "estimate": 2,
      "state": "Backlog",
      "description": "Analysts and agents get features without the test split.\n\nAcceptance criteria:\n- `GET /api/v1/datasets/{id}/features?version=N` returns per-question probabilities, noul values and normalized scores joined with labels, for the drafting and calibration splits only.\n- A test proves no test-split case is returned.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/management-api.md#datasets-evals-and-jobs`\n- `.claude/skills/bandwise-builder/references/management-api.md#holdout-rules-at-the-api`\n\nLocal ID: P3b-29 (docs/linear-backlog.md)",
      "blockedBy": [
        "P3-03"
      ],
      "milestone": "Phase 3b: Effectiveness loop",
      "linearId": "NSI-645"
    },
    {
      "localId": "P3b-30",
      "project": "Bandwise",
      "title": "Compute quality-adjusted value in rollups, health and ROI",
      "labels": [
        "Billing",
        "agent-created"
      ],
      "estimate": 3,
      "state": "Backlog",
      "description": "Savings account for wrong auto decisions and review cost.\n\nAcceptance criteria:\n- Quality-adjusted value follows the formula and per-set `value_settings` in savings-model.md.\n- It shows next to gross savings in the `savings-and-roi` report and in set health. Quality / Learning supplies the precision inputs.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/savings-model.md#quality-adjusted-value`\n- `.claude/skills/bandwise-builder/references/effectiveness-loop.md#14-quality-adjusted-value`\n\nLocal ID: P3b-30 (docs/linear-backlog.md)",
      "blockedBy": [
        "P3b-06",
        "P3-42"
      ],
      "milestone": "Phase 3b: Effectiveness loop",
      "linearId": "NSI-647"
    },
    {
      "localId": "P3b-31",
      "project": "Bandwise",
      "title": "Pass the Phase 3b exit gate",
      "labels": [
        "QA / Evals",
        "bandwise:headless",
        "agent-created"
      ],
      "estimate": 5,
      "state": "Backlog",
      "description": "Confirm the effectiveness loop works end to end.\n\nAcceptance criteria:\n- On a seeded set with 500 labeled fixture runs, an agent using only MCP tools gets a threshold suggestion, applies it to a draft, runs a challenger, and promotes it after admin approval.\n- Registering a new stable model lists every pinned candidate set on the Model upgrades page, and try-model produces an eval comparison and a proposal.\n- Injected drift triggers auto-demote and an alert event.\n- No endpoint returns a test-split case.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/phases/phase-3b.md#exit-gate`\n\nLocal ID: P3b-31 (docs/linear-backlog.md)",
      "blockedBy": [
        "P3b-04",
        "P3b-05",
        "P3b-08",
        "P3b-09",
        "P3b-11",
        "P3b-12",
        "P3b-13",
        "P3b-15",
        "P3b-16",
        "P3b-17",
        "P3b-18",
        "P3b-22",
        "P3b-23",
        "P3b-25",
        "P3b-26",
        "P3b-27",
        "P3b-28",
        "P3b-29",
        "P3b-30"
      ],
      "milestone": "Phase 3b: Effectiveness loop",
      "linearId": "NSI-649"
    },
    {
      "localId": "P4-01",
      "project": "Bandwise",
      "title": "Build @bandwise/client with run, run<T>, reportFeedback and route helpers",
      "labels": [
        "Embed Kit",
        "bandwise:headless",
        "agent-created"
      ],
      "estimate": 5,
      "state": "Backlog",
      "description": "Host apps call Bandwise from their servers with one small client.\n\nAcceptance criteria:\n- `createClient({ baseUrl, token }).run(setRef, state)`, a generic `run<T>()` for generated clients, and `reportFeedback()`.\n- `Idempotency-Key` support, the optional `Bandwise-Interface` header and `requestId` exposure.\n- `createRunRoute()` for Next.js and an Express handler.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/phases/phase-4.md`\n- `.claude/skills/bandwise-builder/references/deploy-and-codegen.md#10-integration-recipes-phase-4`\n- `.claude/skills/bandwise-builder/references/api.md#endpoints-run-surface`\n\nLocal ID: P4-01 (docs/linear-backlog.md)",
      "blockedBy": [
        "P3-26"
      ],
      "milestone": "Phase 4: Embed kit",
      "linearId": "NSI-633"
    },
    {
      "localId": "P4-02",
      "project": "Bandwise",
      "title": "Keep @bandwise/client fetch-only and test it in the edge runtime",
      "labels": [
        "Embed Kit",
        "agent-created"
      ],
      "estimate": 2,
      "state": "Backlog",
      "description": "The client runs on Node, Vercel Edge, Cloudflare Workers and Deno.\n\nAcceptance criteria:\n- No Node built-ins.\n- CI runs the client tests under `@edge-runtime/vm`.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/phases/phase-4.md`\n\nLocal ID: P4-02 (docs/linear-backlog.md)",
      "blockedBy": [
        "P4-01"
      ],
      "milestone": "Phase 4: Embed kit",
      "linearId": "NSI-634"
    },
    {
      "localId": "P4-03",
      "project": "Bandwise",
      "title": "Handle 429 with Retry-After in a single retry layer",
      "labels": [
        "Embed Kit",
        "agent-created"
      ],
      "estimate": 2,
      "state": "Backlog",
      "description": "Rate limits slow callers down without retry storms.\n\nAcceptance criteria:\n- Bounded retries honor `Retry-After`, in one retry layer only.\n- A retried run reuses its `Idempotency-Key`.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/phases/phase-4.md`\n- `.claude/skills/bandwise-builder/references/management-api.md#idempotency-keys`\n\nLocal ID: P4-03 (docs/linear-backlog.md)",
      "blockedBy": [
        "P4-01"
      ],
      "milestone": "Phase 4: Embed kit",
      "linearId": "NSI-636"
    },
    {
      "localId": "P4-04",
      "project": "Bandwise",
      "title": "Mint browser tokens through POST /api/v1/tokens/browser",
      "labels": [
        "Embed Kit",
        "Security",
        "agent-created"
      ],
      "estimate": 2,
      "state": "Backlog",
      "description": "Browsers run sets with short-lived tokens.\n\nAcceptance criteria:\n- A server helper mints an ES256 JWT bound to origin and set list.\n- The browser never sees an `sk_` token.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/security.md#app-tokens`\n- `.claude/skills/bandwise-builder/references/architecture.md#embed-kit`\n\nLocal ID: P4-04 (docs/linear-backlog.md)",
      "blockedBy": [
        "P4-01",
        "P2-13"
      ],
      "milestone": "Phase 4: Embed kit",
      "linearId": "NSI-638"
    },
    {
      "localId": "P4-05",
      "project": "Bandwise",
      "title": "Support publishable pk_ mode",
      "labels": [
        "Embed Kit",
        "Security",
        "agent-created"
      ],
      "estimate": 2,
      "state": "Backlog",
      "description": "Simple browser embeds work with a publishable token.\n\nAcceptance criteria:\n- `pk_live_` tokens are run-only with an origin allowlist.\n- `ReviewQueue` and `SavingsCard` refuse Mode B.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/architecture.md#embed-kit`\n- `.claude/skills/bandwise-builder/references/security.md#app-tokens`\n\nLocal ID: P4-05 (docs/linear-backlog.md)",
      "blockedBy": [
        "P4-01"
      ],
      "milestone": "Phase 4: Embed kit",
      "linearId": "NSI-640"
    },
    {
      "localId": "P4-06",
      "project": "Bandwise",
      "title": "Build @bandwise/react components and headless hooks",
      "labels": [
        "Embed Kit",
        "agent-created"
      ],
      "estimate": 8,
      "state": "Backlog",
      "description": "Apps show System One decisions with ready-made, accessible components.\n\nAcceptance criteria:\n- `QuestionSetRunner`, `ConfidenceBadge`, `ProbabilityBars`, `ScoreGauge`, `ReviewQueue` and `SavingsCard`, plus headless hooks. Renderers are picked by each question type module's `uiKind`.\n- `ReviewQueue` and `SavingsCard` require Mode A, with `createReviewRoutes()` and `createUsageRoute()` server helpers.\n- Never imports server code. Under 15 kB gzip. Renders every question type in the core registry and all three bands.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/architecture.md#embed-kit`\n- `.claude/skills/bandwise-builder/references/phases/phase-4.md`\n\nLocal ID: P4-06 (docs/linear-backlog.md)",
      "blockedBy": [
        "P4-01"
      ],
      "milestone": "Phase 4: Embed kit",
      "linearId": "NSI-643"
    },
    {
      "localId": "P4-07",
      "project": "Bandwise",
      "title": "Add theming through CSS variables with accessible defaults",
      "labels": [
        "Embed Kit",
        "agent-created"
      ],
      "estimate": 2,
      "state": "Backlog",
      "description": "Components match the host app's look and work for everyone.\n\nAcceptance criteria:\n- Every component is themeable through CSS variables.\n- Defaults are accessible.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/architecture.md#embed-kit`\n\nLocal ID: P4-07 (docs/linear-backlog.md)",
      "blockedBy": [
        "P4-06"
      ],
      "milestone": "Phase 4: Embed kit",
      "linearId": "NSI-644"
    },
    {
      "localId": "P4-08",
      "project": "Bandwise",
      "title": "Build apps/example-embed using both modes",
      "labels": [
        "Embed Kit",
        "agent-created"
      ],
      "estimate": 3,
      "state": "Backlog",
      "description": "One example app proves both embed modes end to end.\n\nAcceptance criteria:\n- Mode A (server proxy with `sk_`) and Mode B (`pk_` or browser JWT) both work.\n- The E2E suite passes in both modes on the fixture transport.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/architecture.md#embed-kit`\n- `.claude/skills/bandwise-builder/references/testing.md#playwright`\n\nLocal ID: P4-08 (docs/linear-backlog.md)",
      "blockedBy": [
        "P4-06",
        "P4-04",
        "P4-05"
      ],
      "milestone": "Phase 4: Embed kit",
      "linearId": "NSI-646"
    },
    {
      "localId": "P4-09",
      "project": "Bandwise",
      "title": "Write integration recipes for Next.js, Express, curl and httpx",
      "labels": [
        "Docs",
        "bandwise:docs",
        "agent-created"
      ],
      "estimate": 3,
      "state": "Backlog",
      "description": "Developers copy a working recipe for their stack.\n\nAcceptance criteria:\n- Next.js route handler, Express, plain HTTP (curl) and Python httpx recipes, each branching on `effectiveAction` and `route`.\n- The `escalate_to_llm` branch acts on `r.decisions[id].escalation.value`. Feedback examples send no `source` field.\n- The recipes match the shipped client.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/deploy-and-codegen.md#10-integration-recipes-phase-4`\n- `.claude/skills/bandwise-builder/references/confidence-policy.md#escalation`\n- `.claude/skills/bandwise-builder/references/api.md#feedback`\n\nNote: The escalation and feedback wording in deploy-and-codegen.md section 10 is a pending edit; follow confidence-policy.md and effectiveness-loop.md.\n\nLocal ID: P4-09 (docs/linear-backlog.md)",
      "blockedBy": [
        "P4-01"
      ],
      "milestone": "Phase 4: Embed kit",
      "linearId": "NSI-648"
    },
    {
      "localId": "P4-10",
      "project": "Bandwise",
      "title": "Pass the Phase 4 exit gate",
      "labels": [
        "QA / Evals",
        "Security",
        "agent-created"
      ],
      "estimate": 3,
      "state": "Backlog",
      "description": "Confirm the embed kit is safe and small.\n\nAcceptance criteria:\n- `example-embed` E2E passes in both modes.\n- The CI bundle scan finds no key patterns in client output.\n- `@bandwise/react` is under 15 kB gzip.\n- Components render every question type in the core registry and all three bands.\n- Client tests pass in the edge runtime.\n- Revoking a token blocks it within 60 seconds.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/phases/phase-4.md#exit-gate`\n- `.claude/skills/bandwise-builder/references/testing.md#security-tests`\n\nLocal ID: P4-10 (docs/linear-backlog.md)",
      "blockedBy": [
        "P4-02",
        "P4-03",
        "P4-07",
        "P4-08",
        "P4-09"
      ],
      "milestone": "Phase 4: Embed kit",
      "linearId": "NSI-650"
    },
    {
      "localId": "P4b-01",
      "project": "Bandwise",
      "title": "Add app profile fields language, framework and repo_url",
      "labels": [
        "Platform / Tenancy",
        "agent-created"
      ],
      "estimate": 1,
      "state": "Backlog",
      "description": "Apps carry what codegen and opportunities need.\n\nAcceptance criteria:\n- `apps` gains `language`, `framework` and `repo_url`, editable through `app.update`.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/data-model.md#apps-and-integration`\n- `.claude/skills/bandwise-builder/references/deploy-and-codegen.md#apps`\n\nLocal ID: P4b-01 (docs/linear-backlog.md)",
      "blockedBy": [
        "P2-05"
      ],
      "milestone": "Phase 4b: Integrate and deploy",
      "linearId": "NSI-652"
    },
    {
      "localId": "P4b-02",
      "project": "Bandwise",
      "title": "Add app_opportunities and the opportunity operations",
      "labels": [
        "Platform / Tenancy",
        "bandwise:headless",
        "agent-created"
      ],
      "estimate": 3,
      "state": "Backlog",
      "description": "Decision points in an app are recorded as opportunities.\n\nAcceptance criteria:\n- `opportunity.list`, `opportunity.create` and `opportunity.update` under `/apps/{id}/opportunities`, using the `Opportunity` contract.\n- Opportunities hold summaries only, never source code.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/deploy-and-codegen.md#opportunity-contract`\n- `.claude/skills/bandwise-builder/references/deploy-and-codegen.md#producers`\n- `.claude/skills/bandwise-builder/references/management-api.md#apps-and-integration`\n\nLocal ID: P4b-02 (docs/linear-backlog.md)",
      "blockedBy": [
        "P4b-01",
        "P0-10"
      ],
      "milestone": "Phase 4b: Integrate and deploy",
      "linearId": "NSI-654"
    },
    {
      "localId": "P4b-03",
      "project": "Bandwise",
      "title": "Build the console \"Describe your app\" form",
      "labels": [
        "Console UI",
        "agent-created"
      ],
      "estimate": 3,
      "state": "Backlog",
      "description": "People get proposed decision points from a description of their app.\n\nAcceptance criteria:\n- `llm-client` drafts opportunities from a description and pasted snippets.\n- Snippets are not stored.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/deploy-and-codegen.md#producers`\n- `.claude/skills/bandwise-builder/references/phases/phase-4b.md#apps-and-opportunities`\n\nLocal ID: P4b-03 (docs/linear-backlog.md)",
      "blockedBy": [
        "P4b-02",
        "P1-10"
      ],
      "milestone": "Phase 4b: Integrate and deploy",
      "linearId": "NSI-656"
    },
    {
      "localId": "P4b-04",
      "project": "Bandwise",
      "title": "Add MCP opportunity tools, create_app and bandwise opportunities",
      "labels": [
        "Integrations",
        "bandwise:headless",
        "agent-created"
      ],
      "estimate": 2,
      "state": "Backlog",
      "description": "Agents record and act on opportunities headlessly.\n\nAcceptance criteria:\n- `bandwise opportunities add|list|accept|reject` map to the opportunity operations.\n- MCP `add_opportunity`, `update_opportunity` and `create_app` map to their operations. Summaries only.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/headless-and-agents.md#app-integration`\n- `.claude/skills/bandwise-builder/references/headless-and-agents.md#mcp-server`\n\nLocal ID: P4b-04 (docs/linear-backlog.md)",
      "blockedBy": [
        "P4b-02",
        "P3-23",
        "P3-25"
      ],
      "milestone": "Phase 4b: Integrate and deploy",
      "linearId": "NSI-657"
    },
    {
      "localId": "P4b-05",
      "project": "Bandwise",
      "title": "Add the pattern enum and the pattern advisor to the drafting prompt",
      "labels": [
        "Integrations",
        "agent-created"
      ],
      "estimate": 2,
      "state": "Backlog",
      "description": "Each opportunity maps to a known System One pattern.\n\nAcceptance criteria:\n- Opportunities and templates carry a pattern from one enum.\n- The opportunity drafting prompt includes the pattern advisor table.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/deploy-and-codegen.md#3-pattern-advisor`\n\nLocal ID: P4b-05 (docs/linear-backlog.md)",
      "blockedBy": [
        "P4b-02"
      ],
      "milestone": "Phase 4b: Integrate and deploy",
      "linearId": "NSI-659"
    },
    {
      "localId": "P4b-06",
      "project": "Bandwise",
      "title": "Prefill the Definition Studio from an Opportunity",
      "labels": [
        "Console UI",
        "agent-created"
      ],
      "estimate": 2,
      "state": "Backlog",
      "description": "Building a set from an opportunity starts with the right context.\n\nAcceptance criteria:\n- The Studio fills the intent sentence, state fields and seed examples from the chosen `Opportunity`.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/definition-studio.md#1-capture-intent`\n- `.claude/skills/bandwise-builder/references/deploy-and-codegen.md#1-integrate-flow`\n\nLocal ID: P4b-06 (docs/linear-backlog.md)",
      "blockedBy": [
        "P4b-02",
        "P3-34"
      ],
      "milestone": "Phase 4b: Integrate and deploy",
      "linearId": "NSI-660"
    },
    {
      "localId": "P4b-07",
      "project": "Bandwise",
      "title": "Build the packages/codegen TypeScript target",
      "labels": [
        "Integrations",
        "bandwise:contract",
        "agent-created"
      ],
      "estimate": 5,
      "state": "Backlog",
      "description": "Apps call sets through typed code derived from the spec.\n\nAcceptance criteria:\n- Pure: `SetInterface` plus manifest in, files out. Imports only core contracts.\n- Generated code calls `@bandwise/client`'s `run<T>()`, built against its types until P4-01 lands.\n- One read-only generated file per set. One snapshot per seeded template. Generated TypeScript passes `tsc --noEmit`.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/deploy-and-codegen.md#6-codegen`\n- `.claude/skills/bandwise-builder/references/deploy-and-codegen.md#typescript-output`\n- `.claude/skills/bandwise-builder/references/testing.md#codegen-tests`\n\nLocal ID: P4b-07 (docs/linear-backlog.md)",
      "blockedBy": [
        "P1-07"
      ],
      "milestone": "Phase 4b: Integrate and deploy",
      "linearId": "NSI-663"
    },
    {
      "localId": "P4b-08",
      "project": "Bandwise",
      "title": "Add the set.codegen operation and route",
      "labels": [
        "Platform / Tenancy",
        "bandwise:headless",
        "agent-created"
      ],
      "estimate": 3,
      "state": "Backlog",
      "description": "Generated code is available from the API.\n\nAcceptance criteria:\n- `GET /api/v1/sets/{ref}/codegen` takes `lang`, `channel`, `version`, `appId` and `target`, and returns `{ files, lock, bindingId? }`.\n- With `appId` it also records a binding and checks `apps:write`. A channel with no published version returns `404 not_found`.\n- `target=standalone` returns 404 until the ADR-009 Standalone section is accepted.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/deploy-and-codegen.md#surfaces`\n- `.claude/skills/bandwise-builder/references/management-api.md#apps-and-integration`\n\nNote: Split by lane from the phase-4b.md codegen surfaces item (P4b-08 to P4b-10).\n\nLocal ID: P4b-08 (docs/linear-backlog.md)",
      "blockedBy": [
        "P4b-07",
        "P4b-11",
        "P3-04"
      ],
      "milestone": "Phase 4b: Integrate and deploy",
      "linearId": "NSI-665"
    },
    {
      "localId": "P4b-09",
      "project": "Bandwise",
      "title": "Add bandwise codegen and MCP generate_client",
      "labels": [
        "Integrations",
        "bandwise:headless",
        "agent-created"
      ],
      "estimate": 3,
      "state": "Backlog",
      "description": "Developers and agents write generated code into the app repo.\n\nAcceptance criteria:\n- `bandwise codegen <slug> --lang ts [--channel <c>] [--version <n>] [--app <id>]` writes `bandwise/generated/<slug>.ts` and records a binding.\n- MCP `generate_client` returns the files and the lock entry for the agent to write.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/deploy-and-codegen.md#surfaces`\n- `.claude/skills/bandwise-builder/references/deploy-and-codegen.md#8-delivering-code-into-an-app-repo`\n\nNote: Split by lane from the phase-4b.md codegen surfaces item (P4b-08 to P4b-10).\n\nLocal ID: P4b-09 (docs/linear-backlog.md)",
      "blockedBy": [
        "P4b-08",
        "P3-22"
      ],
      "milestone": "Phase 4b: Integrate and deploy",
      "linearId": "NSI-668"
    },
    {
      "localId": "P4b-10",
      "project": "Bandwise",
      "title": "Add the console \"Use in your app\" tab",
      "labels": [
        "Console UI",
        "agent-created"
      ],
      "estimate": 2,
      "state": "Backlog",
      "description": "People copy generated code and record a binding from the console.\n\nAcceptance criteria:\n- Shows the generated file for the app's language, copy and download buttons and the plain HTTP snippet.\n- \"Use in app\" records a binding through `binding.create`.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/deploy-and-codegen.md#surfaces`\n\nNote: Split by lane from the phase-4b.md codegen surfaces item (P4b-08 to P4b-10).\n\nLocal ID: P4b-10 (docs/linear-backlog.md)",
      "blockedBy": [
        "P4b-08"
      ],
      "milestone": "Phase 4b: Integrate and deploy",
      "linearId": "NSI-669"
    },
    {
      "localId": "P4b-11",
      "project": "Bandwise",
      "title": "Add app_set_bindings and the binding operations",
      "labels": [
        "Platform / Tenancy",
        "bandwise:headless",
        "agent-created"
      ],
      "estimate": 3,
      "state": "Backlog",
      "description": "Bandwise knows which app uses which set, where and through what code.\n\nAcceptance criteria:\n- `binding.list`, `binding.create` and `binding.remove`. A new binding for the same app, set and channel sets `removed_at` on the previous row, so the table is the deploy history.\n- Audit actions `binding.create` and `binding.remove`, and event `binding.created`.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/deploy-and-codegen.md#7-app-bindings`\n- `.claude/skills/bandwise-builder/references/management-api.md#apps-and-integration`\n\nNote: Split by lane from the phase-4b.md app bindings item (P4b-11, P4b-12).\n\nLocal ID: P4b-11 (docs/linear-backlog.md)",
      "blockedBy": [
        "P4b-01"
      ],
      "milestone": "Phase 4b: Integrate and deploy",
      "linearId": "NSI-671"
    },
    {
      "localId": "P4b-12",
      "project": "Bandwise",
      "title": "Build the app page and the set Consumers panel",
      "labels": [
        "Console UI",
        "agent-created"
      ],
      "estimate": 3,
      "state": "Backlog",
      "description": "People see what each app uses and who consumes each set.\n\nAcceptance criteria:\n- The app page shows sets in use, channel, served version, interface major and last run.\n- The set page and the publish dialog show a Consumers panel: bindings plus apps with runs in the last 30 days.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/deploy-and-codegen.md#7-app-bindings`\n\nNote: Split by lane from the phase-4b.md app bindings item (P4b-11, P4b-12).\n\nLocal ID: P4b-12 (docs/linear-backlog.md)",
      "blockedBy": [
        "P4b-11"
      ],
      "milestone": "Phase 4b: Integrate and deploy",
      "linearId": "NSI-673"
    },
    {
      "localId": "P4b-13",
      "project": "Bandwise",
      "title": "Make interface.breaking use bindings plus recent app runs",
      "labels": [
        "Core Engine",
        "bandwise:contract",
        "agent-created"
      ],
      "estimate": 3,
      "state": "Backlog",
      "description": "A publish that would break a live app fails loudly.\n\nAcceptance criteria:\n- Consumers per channel are live bindings plus apps with runs in the last 30 days, passed in `PublishCtx.served`.\n- Only `interfaceBump` with an audited reason clears the lint.\n- Publishing a version that removes a route output a bound production app uses fails unless the major is bumped.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/deploy-and-codegen.md#5-set-interface-and-compatibility`\n- `.claude/skills/bandwise-builder/references/architecture.md#lints-packagescoresrclints`\n\nLocal ID: P4b-13 (docs/linear-backlog.md)",
      "blockedBy": [
        "P4b-11",
        "P1-06",
        "P1-07"
      ],
      "milestone": "Phase 4b: Integrate and deploy",
      "linearId": "NSI-674"
    },
    {
      "localId": "P4b-14",
      "project": "Bandwise",
      "title": "Enforce the Bandwise-Interface header on runs",
      "labels": [
        "Platform / Tenancy",
        "bandwise:contract",
        "agent-created"
      ],
      "estimate": 2,
      "state": "Backlog",
      "description": "An app built against an old interface never gets a silent mismatch.\n\nAcceptance criteria:\n- A `Bandwise-Interface` major that differs from the version's returns `409 interface_mismatch`.\n- The server never falls back to an older version.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/api.md#run-request`\n- `.claude/skills/bandwise-builder/references/deploy-and-codegen.md#5-set-interface-and-compatibility`\n\nLocal ID: P4b-14 (docs/linear-backlog.md)",
      "blockedBy": [
        "P2-12"
      ],
      "milestone": "Phase 4b: Integrate and deploy",
      "linearId": "NSI-675"
    },
    {
      "localId": "P4b-15",
      "project": "Bandwise",
      "title": "Build bandwise init",
      "labels": [
        "Integrations",
        "bandwise:headless",
        "Security",
        "agent-created"
      ],
      "estimate": 3,
      "state": "Backlog",
      "description": "One command sets up an app repo.\n\nAcceptance criteria:\n- Runs the six steps in deploy-and-codegen.md: create the app, create an `sk_test_` token with `run` and `feedback:write` bound to staging (no approval needed), write `bandwise.config.json`, add `@bandwise/client`, and with `--set` generate one typed call site in a new file.\n- It never writes the token secret to a tracked file.\n- It needs an admin ceiling. `--app <appId>` skips app and token creation.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/deploy-and-codegen.md#bandwise-init`\n- `.claude/skills/bandwise-builder/references/management-api.md#catalog`\n\nLocal ID: P4b-15 (docs/linear-backlog.md)",
      "blockedBy": [
        "P4b-01",
        "P3-22",
        "P4-01"
      ],
      "milestone": "Phase 4b: Integrate and deploy",
      "linearId": "NSI-676"
    },
    {
      "localId": "P4b-16",
      "project": "Bandwise",
      "title": "Write .bandwise/lock.json from bandwise codegen",
      "labels": [
        "Integrations",
        "agent-created"
      ],
      "estimate": 2,
      "state": "Backlog",
      "description": "The repo records exactly what was generated and from which interface.\n\nAcceptance criteria:\n- One lock entry per set with slug, channel, version, `interfaceMajor`, `interfaceHash`, `generatorVersion` and `fileHashes`.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/deploy-and-codegen.md#8-delivering-code-into-an-app-repo`\n\nLocal ID: P4b-16 (docs/linear-backlog.md)",
      "blockedBy": [
        "P4b-09"
      ],
      "milestone": "Phase 4b: Integrate and deploy",
      "linearId": "NSI-677"
    },
    {
      "localId": "P4b-17",
      "project": "Bandwise",
      "title": "Build bandwise check with exit code 2 on drift",
      "labels": [
        "Integrations",
        "agent-created"
      ],
      "estimate": 2,
      "state": "Backlog",
      "description": "Customer CI catches interface drift and hand edits.\n\nAcceptance criteria:\n- Exit 0 when the lock matches the live major and every file hash, with a notice for additive changes.\n- Exit 2 when the live major differs from the lock or a generated file was edited, deleted or is missing.\n- Exit 1 on auth, network or unknown set.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/deploy-and-codegen.md#8-delivering-code-into-an-app-repo`\n\nLocal ID: P4b-17 (docs/linear-backlog.md)",
      "blockedBy": [
        "P4b-16"
      ],
      "milestone": "Phase 4b: Integrate and deploy",
      "linearId": "NSI-678"
    },
    {
      "localId": "P4b-18",
      "project": "Bandwise",
      "title": "Decide the ADR-009 Python section",
      "labels": [
        "Architect",
        "bandwise:adr",
        "agent-created"
      ],
      "estimate": 1,
      "state": "Backlog",
      "description": "Nick decides whether a second toolchain is worth it.\n\nAcceptance criteria:\n- The ADR-009 Python section is accepted or rejected, with the reason recorded.\n\nRefs:\n- `docs/adr/009-app-integration-and-deploy-targets.md`\n- `.claude/skills/bandwise-builder/references/deploy-and-codegen.md#python-output-behind-adr-009`\n\nNote: Added: phase-4b.md gates the Python work on this decision without a checklist line for it.\n\nLocal ID: P4b-18 (docs/linear-backlog.md)",
      "blockedBy": [
        "P0-06"
      ],
      "milestone": "Phase 4b: Integrate and deploy",
      "linearId": "NSI-679"
    },
    {
      "localId": "P4b-19",
      "project": "Bandwise",
      "title": "Build the Python client, Python codegen and examples/fastapi",
      "labels": [
        "Integrations",
        "agent-created"
      ],
      "estimate": 8,
      "state": "Backlog",
      "description": "Python apps get the same typed path as TypeScript apps.\n\nAcceptance criteria:\n- `packages/client-py` is generated from `openapi.json`.\n- The Python codegen target produces files that pass pyright.\n- `examples/fastapi` runs against it.\n- Starts only after the ADR-009 Python section is accepted.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/deploy-and-codegen.md#python-output-behind-adr-009`\n- `.claude/skills/bandwise-builder/references/testing.md#codegen-tests`\n\nLocal ID: P4b-19 (docs/linear-backlog.md)",
      "blockedBy": [
        "P4b-18",
        "P4b-07"
      ],
      "milestone": "Phase 4b: Integrate and deploy",
      "linearId": "NSI-681"
    },
    {
      "localId": "P4b-20",
      "project": "Bandwise",
      "title": "Decide the ADR-009 Standalone section",
      "labels": [
        "Architect",
        "bandwise:adr",
        "Security",
        "agent-created"
      ],
      "estimate": 1,
      "state": "Backlog",
      "description": "Nick decides whether a lock-in-free path that skips managed controls ships.\n\nAcceptance criteria:\n- The ADR-009 Standalone section is accepted or rejected, with Security reviewer input and the reason recorded.\n\nRefs:\n- `docs/adr/009-app-integration-and-deploy-targets.md`\n- `.claude/skills/bandwise-builder/references/deploy-and-codegen.md#9-standalone-export-behind-adr-009-last-in-phase-4b`\n\nNote: Added: phase-4b.md gates the standalone export on this decision without a checklist line for it.\n\nLocal ID: P4b-20 (docs/linear-backlog.md)",
      "blockedBy": [
        "P0-06"
      ],
      "milestone": "Phase 4b: Integrate and deploy",
      "linearId": "NSI-684"
    },
    {
      "localId": "P4b-21",
      "project": "Bandwise",
      "title": "Build the standalone export and POST /api/v1/runs/ingest",
      "labels": [
        "Integrations",
        "Security",
        "agent-created"
      ],
      "estimate": 8,
      "state": "Backlog",
      "description": "Customers can run a set on their own key and still report back.\n\nAcceptance criteria:\n- Exports `typesafe/<slug>.questions.ts` (or `.py`) with a band and route helper golden-tested against the core router table.\n- The code reads the customer's own key from their server env. Bandwise never exports a stored key.\n- `run.ingest` (`runs:write`) keeps the ledger, review and calibration working for exported sets.\n- Starts only after the ADR-009 Standalone section is accepted. The Security reviewer signs off.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/deploy-and-codegen.md#9-standalone-export-behind-adr-009-last-in-phase-4b`\n- `.claude/skills/bandwise-builder/references/api.md#endpoints-run-surface`\n- `.claude/skills/bandwise-builder/references/testing.md#codegen-tests`\n\nLocal ID: P4b-21 (docs/linear-backlog.md)",
      "blockedBy": [
        "P4b-20",
        "P4b-07"
      ],
      "milestone": "Phase 4b: Integrate and deploy",
      "linearId": "NSI-686"
    },
    {
      "localId": "P4b-22",
      "project": "Bandwise",
      "title": "Review codegen output and bandwise init tokens for security",
      "labels": [
        "Security review",
        "Security",
        "agent-created"
      ],
      "estimate": 2,
      "state": "Backlog",
      "description": "The Security reviewer signs off on code and tokens that reach customer repos.\n\nAcceptance criteria:\n- Generated code and the `bandwise init` token flow are reviewed.\n- The bundle scan covers generated browser code.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/security.md`\n- `.claude/skills/bandwise-builder/references/testing.md#security-tests`\n\nNote: Added: phase-4b.md names the Security reviewer as an owner. Standalone sign-off is part of P4b-21.\n\nLocal ID: P4b-22 (docs/linear-backlog.md)",
      "blockedBy": [
        "P4b-07",
        "P4b-09",
        "P4b-15"
      ],
      "milestone": "Phase 4b: Integrate and deploy",
      "linearId": "NSI-688"
    },
    {
      "localId": "P4b-23",
      "project": "Bandwise",
      "title": "Pass the Phase 4b exit gate",
      "labels": [
        "QA / Evals",
        "bandwise:headless",
        "agent-created"
      ],
      "estimate": 5,
      "state": "Backlog",
      "description": "Confirm an agent can wire a set into an app with no console clicks.\n\nAcceptance criteria:\n- In a sample Next.js repo with no System One code, an agent using only the CLI or MCP and an agent token records an opportunity, builds a set, publishes it to staging, generates and wires the typed client, and, with the set marked protected, requests promotion to production, which a person approves. The console app page then shows the binding.\n- Publishing a version that removes a route output a bound production app uses fails the lint unless the major is bumped with a reason.\n- `bandwise check` exits 2 after a generated file is edited or the live interface major changes.\n- Generated TypeScript passes `tsc --noEmit` for every seeded template.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/phases/phase-4b.md#exit-gate`\n- `.claude/skills/bandwise-builder/references/headless-and-agents.md#b-set-up-an-app-phase-4b`\n\nLocal ID: P4b-23 (docs/linear-backlog.md)",
      "blockedBy": [
        "P4b-03",
        "P4b-04",
        "P4b-05",
        "P4b-06",
        "P4b-10",
        "P4b-12",
        "P4b-13",
        "P4b-14",
        "P4b-17",
        "P4b-22"
      ],
      "milestone": "Phase 4b: Integrate and deploy",
      "linearId": "NSI-690"
    },
    {
      "localId": "P5-01",
      "project": "Bandwise",
      "title": "Build plugin-sdk with definePlugin and the plugin interfaces",
      "labels": [
        "Extensions",
        "bandwise:contract",
        "agent-created"
      ],
      "estimate": 5,
      "state": "Backlog",
      "description": "Adapters, templates and actions plug in through one typed SDK.\n\nAcceptance criteria:\n- `definePlugin()`, `InputAdapter`, `QuestionTemplate` and `ActionHandler`, matching `templates/plugin.template.ts`.\n- A build-time registry with no remote code loading.\n\nRefs:\n- `.claude/skills/bandwise-builder/templates/plugin.template.ts`\n- `.claude/skills/bandwise-builder/references/phases/phase-5.md`\n\nLocal ID: P5-01 (docs/linear-backlog.md)",
      "blockedBy": [
        "P0-09"
      ],
      "milestone": "Phase 5: Plugins and templates",
      "linearId": "NSI-651"
    },
    {
      "localId": "P5-02",
      "project": "Bandwise",
      "title": "Build the built-in input adapters",
      "labels": [
        "Extensions",
        "Security",
        "agent-created"
      ],
      "estimate": 5,
      "state": "Backlog",
      "description": "Sets accept common inputs without custom code.\n\nAcceptance criteria:\n- JSON, plain text, email, HTML to text, CSV row, webhook payload and web page (selection, readable text, per-site selectors).\n- Run step 3 runs the configured adapter, and adapter output is treated as untrusted state.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/phases/phase-5.md`\n- `.claude/skills/bandwise-builder/references/architecture.md#run-data-flow`\n- `.claude/skills/bandwise-builder/references/security.md#state-is-untrusted`\n\nLocal ID: P5-02 (docs/linear-backlog.md)",
      "blockedBy": [
        "P5-01"
      ],
      "milestone": "Phase 5: Plugins and templates",
      "linearId": "NSI-653"
    },
    {
      "localId": "P5-03",
      "project": "Bandwise",
      "title": "Add the adapter picker to the input editor",
      "labels": [
        "Console UI",
        "agent-created"
      ],
      "estimate": 2,
      "state": "Backlog",
      "description": "People choose an input adapter per set.\n\nAcceptance criteria:\n- The input editor shows the adapter picker that Phase 3 hid, listing the enabled adapters.\n- Sets without an adapter keep running on raw JSON state.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/phases/phase-3.md#managed-questions-and-managed-live`\n\nNote: Phase 3 hides the picker. The matching line in phase-5.md is a pending edit.\n\nLocal ID: P5-03 (docs/linear-backlog.md)",
      "blockedBy": [
        "P5-02",
        "P3-12"
      ],
      "milestone": "Phase 5: Plugins and templates",
      "linearId": "NSI-655"
    },
    {
      "localId": "P5-04",
      "project": "Bandwise",
      "title": "Build the built-in actions: webhook, Slack, email and review item",
      "labels": [
        "Extensions",
        "Security",
        "agent-created"
      ],
      "estimate": 5,
      "state": "Backlog",
      "description": "Auto decisions can act on the outside world safely.\n\nAcceptance criteria:\n- Webhook (HMAC signed), Slack, email and create review item.\n- Side-effect handlers do not dispatch for staging runs unless the set sets `dispatchActionsOnStaging`.\n- Handlers are idempotent under retry by `runId:decisionId`.\n- `escalate_to_llm` is not a plugin action: core owns it from Phase 1.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/phases/phase-5.md`\n- `.claude/skills/bandwise-builder/references/confidence-policy.md#escalation`\n- `.claude/skills/bandwise-builder/references/confidence-policy.md#actions`\n\nNote: phase-5.md still lists \"escalate to LLM\" as a built-in action. Removing it is a pending edit; confidence-policy.md wins.\n\nLocal ID: P5-04 (docs/linear-backlog.md)",
      "blockedBy": [
        "P5-01"
      ],
      "milestone": "Phase 5: Plugins and templates",
      "linearId": "NSI-658"
    },
    {
      "localId": "P5-05",
      "project": "Bandwise",
      "title": "Seed the remaining nine templates, each tagged with a pattern",
      "labels": [
        "Extensions",
        "agent-created"
      ],
      "estimate": 5,
      "state": "Backlog",
      "description": "Common decisions start from a tested template.\n\nAcceptance criteria:\n- Each template builds a `Partial<QuestionSetSpec>` that includes `input.schema` and never sets `model`.\n- Each creates a working set from the console and passes a fixture run.\n- Each has a codegen snapshot.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/definition-studio.md#template-library-seeded`\n- `.claude/skills/bandwise-builder/references/deploy-and-codegen.md#3-pattern-advisor`\n- `.claude/skills/bandwise-builder/references/testing.md#codegen-tests`\n\nLocal ID: P5-05 (docs/linear-backlog.md)",
      "blockedBy": [
        "P5-01",
        "P4b-05"
      ],
      "milestone": "Phase 5: Plugins and templates",
      "linearId": "NSI-661"
    },
    {
      "localId": "P5-06",
      "project": "Bandwise",
      "title": "Add per-org plugin enablement with encrypted config",
      "labels": [
        "Extensions",
        "Security",
        "bandwise:tenancy",
        "agent-created"
      ],
      "estimate": 3,
      "state": "Backlog",
      "description": "Each org turns plugins on and configures them safely.\n\nAcceptance criteria:\n- `plugin.list`, `plugin.get` and `plugin.update` (admin).\n- Plugin config is encrypted like keys.\n- The `action.handler_unknown` lint reads the enabled handlers.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/management-api.md#identity-tokens-and-admin`\n- `.claude/skills/bandwise-builder/references/architecture.md#lints-packagescoresrclints`\n\nLocal ID: P5-06 (docs/linear-backlog.md)",
      "blockedBy": [
        "P5-01",
        "P2-03"
      ],
      "milestone": "Phase 5: Plugins and templates",
      "linearId": "NSI-662"
    },
    {
      "localId": "P5-07",
      "project": "Bandwise",
      "title": "Build the plugin conformance test suite",
      "labels": [
        "Extensions",
        "agent-created"
      ],
      "estimate": 3,
      "state": "Backlog",
      "description": "Every plugin meets the same bar.\n\nAcceptance criteria:\n- A suite every plugin must pass, including idempotency under retry for actions.\n- The built-ins pass it.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/phases/phase-5.md`\n\nLocal ID: P5-07 (docs/linear-backlog.md)",
      "blockedBy": [
        "P5-01"
      ],
      "milestone": "Phase 5: Plugins and templates",
      "linearId": "NSI-664"
    },
    {
      "localId": "P5-08",
      "project": "Bandwise",
      "title": "Add an example third-party plugin in examples/",
      "labels": [
        "Extensions",
        "bandwise:docs",
        "agent-created"
      ],
      "estimate": 2,
      "state": "Backlog",
      "description": "Plugin authors copy a working example.\n\nAcceptance criteria:\n- An example plugin in `examples/` passes the conformance suite.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/phases/phase-5.md`\n- `.claude/skills/bandwise-builder/templates/plugin.template.ts`\n\nLocal ID: P5-08 (docs/linear-backlog.md)",
      "blockedBy": [
        "P5-07"
      ],
      "milestone": "Phase 5: Plugins and templates",
      "linearId": "NSI-666"
    },
    {
      "localId": "P5-09",
      "project": "Bandwise",
      "title": "Deliver org event webhooks with HMAC signatures and retries",
      "labels": [
        "Platform / Tenancy",
        "Security",
        "agent-created"
      ],
      "estimate": 5,
      "state": "Backlog",
      "description": "Orgs with a public URL receive events as they happen.\n\nAcceptance criteria:\n- `webhook_endpoints` with `webhook.list`, `webhook.create` and `webhook.delete`.\n- Deliveries are HMAC signed with `org_webhook_secrets` and retried.\n- A signature rejection test passes.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/events.md#org-webhooks-phase-5`\n- `.claude/skills/bandwise-builder/references/testing.md#security-tests`\n\nLocal ID: P5-09 (docs/linear-backlog.md)",
      "blockedBy": [
        "P3-20",
        "P2-14"
      ],
      "milestone": "Phase 5: Plugins and templates",
      "linearId": "NSI-667"
    },
    {
      "localId": "P5-10",
      "project": "Bandwise",
      "title": "Publish a GitHub Action for bandwise check and spec diff comments",
      "labels": [
        "Integrations",
        "bandwise:headless",
        "agent-created"
      ],
      "estimate": 3,
      "state": "Backlog",
      "description": "Customer PRs show spec diffs and fail on interface drift.\n\nAcceptance criteria:\n- The Action runs `bandwise check` and comments `bandwise spec diff` on PRs, using an agent token with `sets:read`.\n- It lives in `examples/` or is published.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/headless-and-agents.md#specs-as-code`\n- `.claude/skills/bandwise-builder/references/deploy-and-codegen.md#8-delivering-code-into-an-app-repo`\n\nLocal ID: P5-10 (docs/linear-backlog.md)",
      "blockedBy": [
        "P4b-17",
        "P3-24"
      ],
      "milestone": "Phase 5: Plugins and templates",
      "linearId": "NSI-670"
    },
    {
      "localId": "P5-11",
      "project": "Bandwise",
      "title": "Pass the Phase 5 exit gate",
      "labels": [
        "QA / Evals",
        "agent-created"
      ],
      "estimate": 3,
      "state": "Backlog",
      "description": "Confirm plugins and templates are ready.\n\nAcceptance criteria:\n- Built-ins pass the conformance tests.\n- Every template creates a working set from the console and passes a fixture run.\n- Action handlers are idempotent under retry (`runId:decisionId`).\n\nRefs:\n- `.claude/skills/bandwise-builder/references/phases/phase-5.md#exit-gate`\n\nLocal ID: P5-11 (docs/linear-backlog.md)",
      "blockedBy": [
        "P5-03",
        "P5-04",
        "P5-05",
        "P5-06",
        "P5-08",
        "P5-09",
        "P5-10"
      ],
      "milestone": "Phase 5: Plugins and templates",
      "linearId": "NSI-672"
    },
    {
      "localId": "P6-01",
      "project": "Bandwise",
      "title": "Scaffold the WXT MV3 extension with activeTab and storage only",
      "labels": [
        "Extensions",
        "Security",
        "agent-created"
      ],
      "estimate": 2,
      "state": "Backlog",
      "description": "The extension starts with the smallest permission set.\n\nAcceptance criteria:\n- WXT, MV3, permissions `activeTab` and `storage` only.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/phases/phase-6.md`\n- `.claude/skills/bandwise-builder/references/security.md#extensions`\n\nLocal ID: P6-01 (docs/linear-backlog.md)",
      "blockedBy": [
        "P0-07"
      ],
      "milestone": "Phase 6: Chrome extension",
      "linearId": "NSI-680"
    },
    {
      "localId": "P6-02",
      "project": "Bandwise",
      "title": "Sign in with the device flow and keep the token in session storage",
      "labels": [
        "Extensions",
        "Security",
        "bandwise:headless",
        "agent-created"
      ],
      "estimate": 3,
      "state": "Backlog",
      "description": "The extension acts for one user with a narrow agent token.\n\nAcceptance criteria:\n- Sign in uses the device flow and receives an agent token with client `extension` and scopes `run`, `sets:read`, `review:read` and `review:write`.\n- The token lives in `chrome.storage.session`. No TypeSafe key is anywhere in the extension.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/phases/phase-6.md`\n- `.claude/skills/bandwise-builder/references/security.md#agent-tokens`\n- `.claude/skills/bandwise-builder/references/security.md#extensions`\n\nLocal ID: P6-02 (docs/linear-backlog.md)",
      "blockedBy": [
        "P6-01",
        "P2-07"
      ],
      "milestone": "Phase 6: Chrome extension",
      "linearId": "NSI-682"
    },
    {
      "localId": "P6-03",
      "project": "Bandwise",
      "title": "Add the org and set picker",
      "labels": [
        "Extensions",
        "agent-created"
      ],
      "estimate": 2,
      "state": "Backlog",
      "description": "Users choose which org and set the extension runs.\n\nAcceptance criteria:\n- Pick an org profile and a set the token can run.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/phases/phase-6.md`\n\nLocal ID: P6-03 (docs/linear-backlog.md)",
      "blockedBy": [
        "P6-02"
      ],
      "milestone": "Phase 6: Chrome extension",
      "linearId": "NSI-683"
    },
    {
      "localId": "P6-04",
      "project": "Bandwise",
      "title": "Build evaluate page mode with the web page adapter",
      "labels": [
        "Extensions",
        "Security",
        "agent-created"
      ],
      "estimate": 5,
      "state": "Backlog",
      "description": "Users evaluate a page with a set and see the confidence.\n\nAcceptance criteria:\n- Extracts the selection, readable text or custom per-site selectors through the web page adapter, then previews and redacts state.\n- Nothing is sent before the user clicks.\n- Shows `ConfidenceBadge` and `ProbabilityBars` in a side panel and sends medium and low to review.\n- Works on three sample pages.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/phases/phase-6.md`\n- `.claude/skills/bandwise-builder/references/security.md#state-is-untrusted`\n\nLocal ID: P6-04 (docs/linear-backlog.md)",
      "blockedBy": [
        "P6-03",
        "P5-02",
        "P4-06"
      ],
      "milestone": "Phase 6: Chrome extension",
      "linearId": "NSI-685"
    },
    {
      "localId": "P6-05",
      "project": "Bandwise",
      "title": "Build action picker mode",
      "labels": [
        "Extensions",
        "Security",
        "agent-created"
      ],
      "estimate": 8,
      "state": "Backlog",
      "description": "One Choice picks the next UI action on a page, with no screenshots.\n\nAcceptance criteria:\n- The page becomes a numbered list of clickable elements, and one Choice picks the action and element.\n- Per-option probabilities are shown. A small LLM handles typing only. No screenshots.\n- Completes one scripted task on an allowlisted test site.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/phases/phase-6.md`\n- `.claude/skills/bandwise-builder/references/definition-studio.md#template-library-seeded`\n\nLocal ID: P6-05 (docs/linear-backlog.md)",
      "blockedBy": [
        "P6-04"
      ],
      "milestone": "Phase 6: Chrome extension",
      "linearId": "NSI-687"
    },
    {
      "localId": "P6-06",
      "project": "Bandwise",
      "title": "Enforce the autonomy rule for extension clicks",
      "labels": [
        "Extensions",
        "Security",
        "agent-created"
      ],
      "estimate": 3,
      "state": "Backlog",
      "description": "The extension clicks on its own only when it is safe to.\n\nAcceptance criteria:\n- It clicks on its own only for high-band answers on org-allowlisted sites, and only when the set's production rollout is `full`. Everything else waits for confirmation.\n- An injected-instruction test page does not trigger an autonomous click.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/phases/phase-6.md`\n- `.claude/skills/bandwise-builder/references/security.md#state-is-untrusted`\n\nLocal ID: P6-06 (docs/linear-backlog.md)",
      "blockedBy": [
        "P6-05"
      ],
      "milestone": "Phase 6: Chrome extension",
      "linearId": "NSI-689"
    },
    {
      "localId": "P6-07",
      "project": "Bandwise",
      "title": "Default web page adapter sets to high risk with adversarial cases",
      "labels": [
        "Extensions",
        "Security",
        "agent-created"
      ],
      "estimate": 2,
      "state": "Backlog",
      "description": "Sets that read web pages start with the strictest targets.\n\nAcceptance criteria:\n- Sets using the web page adapter default to the high-risk tier.\n- Their gate dataset includes adversarial cases.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/security.md#state-is-untrusted`\n- `.claude/skills/bandwise-builder/references/confidence-policy.md#default-thresholds-by-risk-tier`\n\nLocal ID: P6-07 (docs/linear-backlog.md)",
      "blockedBy": [
        "P5-02",
        "P3-06"
      ],
      "milestone": "Phase 6: Chrome extension",
      "linearId": "NSI-691"
    },
    {
      "localId": "P6-08",
      "project": "Bandwise",
      "title": "Review the extension against the threat model",
      "labels": [
        "Security review",
        "Security",
        "agent-created"
      ],
      "estimate": 2,
      "state": "Backlog",
      "description": "The Security reviewer signs off before the extension ships.\n\nAcceptance criteria:\n- Permissions, token storage, prompt injection handling and the autonomy rule are reviewed and signed off.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/security.md#extensions`\n- `.claude/skills/bandwise-builder/references/security.md#state-is-untrusted`\n\nNote: Added: phase-6.md names the Security reviewer as an owner without a checklist line.\n\nLocal ID: P6-08 (docs/linear-backlog.md)",
      "blockedBy": [
        "P6-02",
        "P6-04",
        "P6-05",
        "P6-06"
      ],
      "milestone": "Phase 6: Chrome extension",
      "linearId": "NSI-692"
    },
    {
      "localId": "P6-09",
      "project": "Bandwise",
      "title": "Pass the Phase 6 exit gate",
      "labels": [
        "QA / Evals",
        "Security",
        "agent-created"
      ],
      "estimate": 3,
      "state": "Backlog",
      "description": "Confirm the extension is safe to ship.\n\nAcceptance criteria:\n- No TypeSafe key anywhere in the extension.\n- Nothing is sent before the user clicks.\n- Evaluate mode works on three sample pages. The action picker completes one scripted task on an allowlisted test site.\n- An injected-instruction test page does not trigger an autonomous click.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/phases/phase-6.md#exit-gate`\n\nLocal ID: P6-09 (docs/linear-backlog.md)",
      "blockedBy": [
        "P6-07",
        "P6-08"
      ],
      "milestone": "Phase 6: Chrome extension",
      "linearId": "NSI-693"
    },
    {
      "localId": "P7-01",
      "project": "Bandwise",
      "title": "Add the MCP HTTP transport and any missing 3b and 4b tools",
      "labels": [
        "Integrations",
        "bandwise:headless",
        "agent-created"
      ],
      "estimate": 5,
      "state": "Backlog",
      "description": "Hosted agents reach Bandwise over MCP HTTP.\n\nAcceptance criteria:\n- `packages/mcp-server` serves the HTTP transport next to stdio.\n- Every Phase 3b and 4b curated tool in headless-and-agents.md is present.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/headless-and-agents.md#mcp-server`\n- `.claude/skills/bandwise-builder/references/phases/phase-7.md`\n\nLocal ID: P7-01 (docs/linear-backlog.md)",
      "blockedBy": [
        "P3-25",
        "P3b-05",
        "P3b-09",
        "P3b-13",
        "P3b-18",
        "P3b-23",
        "P3b-26",
        "P4b-04",
        "P4b-09"
      ],
      "milestone": "Phase 7: Claude Code plugin and MCP",
      "linearId": "NSI-694"
    },
    {
      "localId": "P7-02",
      "project": "Bandwise",
      "title": "Authenticate the MCP server with an agent token only",
      "labels": [
        "Integrations",
        "Security",
        "agent-created"
      ],
      "estimate": 2,
      "state": "Backlog",
      "description": "MCP never holds an app token or a TypeSafe key.\n\nAcceptance criteria:\n- Auth uses `BANDWISE_TOKEN` or a `bandwise login` profile.\n- A test rejects an `sk_` app token. No TypeSafe key is ever read.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/headless-and-agents.md#mcp-server`\n- `.claude/skills/bandwise-builder/references/security.md#agent-tokens`\n\nLocal ID: P7-02 (docs/linear-backlog.md)",
      "blockedBy": [
        "P7-01"
      ],
      "milestone": "Phase 7: Claude Code plugin and MCP",
      "linearId": "NSI-695"
    },
    {
      "localId": "P7-03",
      "project": "Bandwise",
      "title": "Package plugins/claude-code with bandwise-operator and bandwise-integrate",
      "labels": [
        "Integrations",
        "bandwise:docs",
        "bandwise:headless",
        "agent-created"
      ],
      "estimate": 5,
      "state": "Backlog",
      "description": "Customers install one Claude Code plugin to run Bandwise from a prompt.\n\nAcceptance criteria:\n- `.claude-plugin/plugin.json` and `.mcp.json` with one server entry per profile.\n- `bandwise-operator` moves sets through rollout stages, reads disagreements and health, knows when an approval is needed, and tells app code to branch only on `effectiveAction` and `route`.\n- `bandwise-integrate` loads the official `typesafe` skill, posts opportunity summaries (never source code), builds the set, then runs `bandwise codegen` and `bandwise check`.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/headless-and-agents.md#customer-claude-code-skills-phase-7`\n- `.claude/skills/bandwise-builder/references/phases/phase-7.md`\n\nLocal ID: P7-03 (docs/linear-backlog.md)",
      "blockedBy": [
        "P7-01"
      ],
      "milestone": "Phase 7: Claude Code plugin and MCP",
      "linearId": "NSI-696"
    },
    {
      "localId": "P7-04",
      "project": "Bandwise",
      "title": "Keep the bandwise-builder skill out of the plugin",
      "labels": [
        "Integrations",
        "Security",
        "agent-created"
      ],
      "estimate": 1,
      "state": "Backlog",
      "description": "The internal builder skill never ships to customers.\n\nAcceptance criteria:\n- A packaging check fails if any file from `.claude/skills/bandwise-builder` is in the plugin output.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/phases/phase-7.md`\n- `.claude/skills/bandwise-builder/SKILL.md`\n\nLocal ID: P7-04 (docs/linear-backlog.md)",
      "blockedBy": [
        "P7-03"
      ],
      "milestone": "Phase 7: Claude Code plugin and MCP",
      "linearId": "NSI-697"
    },
    {
      "localId": "P7-05",
      "project": "Bandwise",
      "title": "Publish a marketplace repo or local marketplace entry",
      "labels": [
        "Integrations",
        "bandwise:docs",
        "agent-created"
      ],
      "estimate": 2,
      "state": "Backlog",
      "description": "Customers install the plugin with one command.\n\nAcceptance criteria:\n- `claude plugin install` works from the marketplace entry.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/phases/phase-7.md`\n\nLocal ID: P7-05 (docs/linear-backlog.md)",
      "blockedBy": [
        "P7-03"
      ],
      "milestone": "Phase 7: Claude Code plugin and MCP",
      "linearId": "NSI-698"
    },
    {
      "localId": "P7-06",
      "project": "Bandwise",
      "title": "Pass the Phase 7 exit gate",
      "labels": [
        "QA / Evals",
        "bandwise:headless",
        "agent-created"
      ],
      "estimate": 3,
      "state": "Backlog",
      "description": "Confirm Bandwise runs from a Claude Code prompt.\n\nAcceptance criteria:\n- `claude plugin install` works from the marketplace.\n- In a sample repo, \"set up Bandwise in this app\" produces an opportunity, a set and a generated typed client.\n- \"Run the triage set on this text\" returns a `RunResult` with bands.\n- A prompt to publish to production on a protected or live set returns a pending approval until a person approves it.\n- The MCP inspector passes.\n\nRefs:\n- `.claude/skills/bandwise-builder/references/phases/phase-7.md#exit-gate`\n\nLocal ID: P7-06 (docs/linear-backlog.md)",
      "blockedBy": [
        "P7-02",
        "P7-04",
        "P7-05"
      ],
      "milestone": "Phase 7: Claude Code plugin and MCP",
      "linearId": "NSI-699"
    }
  ],
  "linearProject": {
    "name": "Bandwise",
    "id": "P-NSI-36",
    "url": "https://linear.app/nsims/project/bandwise-ef1f69b9fa8c"
  }
}
```

## 5. Linear issue keys

Created 2026-09-26 in project Bandwise (`P-NSI-36`). 211 issues, 203 with blocked-by links. Use the Linear key in PR titles and branch names.

| Local ID | Linear | Title |
|---|---|---|
| P0-01 | [NSI-489](https://linear.app/nsims/issue/NSI-489) | Write the bandwise-builder skill and its references |
| P0-02 | [NSI-490](https://linear.app/nsims/issue/NSI-490) | Write the root CLAUDE.md and README.md |
| P0-03 | [NSI-492](https://linear.app/nsims/issue/NSI-492) | Write docs/PLAN.md and ADR-001 |
| P0-04 | [NSI-494](https://linear.app/nsims/issue/NSI-494) | Draft ADRs 007 to 010 with status proposed |
| P0-05 | [NSI-495](https://linear.app/nsims/issue/NSI-495) | Add templates: example question set, ADR and plugin |
| P0-06 | [NSI-497](https://linear.app/nsims/issue/NSI-497) | Review and accept ADRs 007 to 010 before the contract freeze |
| P0-07 | [NSI-498](https://linear.app/nsims/issue/NSI-498) | Scaffold the pnpm workspace and turborepo with empty packages |
| P0-08 | [NSI-500](https://linear.app/nsims/issue/NSI-500) | Add packages/config with strict tsconfig, boundary lint and vitest |
| P0-09 | [NSI-502](https://linear.app/nsims/issue/NSI-502) | Write the spec, policy, run and error contracts in zod |
| P0-10 | [NSI-504](https://linear.app/nsims/issue/NSI-504) | Write the management, model, deploy, loop and event contracts |
| P0-11 | [NSI-506](https://linear.app/nsims/issue/NSI-506) | Build the operation registry skeleton with stubbed handlers |
| P0-12 | [NSI-507](https://linear.app/nsims/issue/NSI-507) | Generate openapi.json from the registry and add the parity skeleton |
| P0-13 | [NSI-509](https://linear.app/nsims/issue/NSI-509) | Seed ModelProfile rows for jev-1.13.0, jev-latest and jev-preview |
| P0-14 | [NSI-511](https://linear.app/nsims/issue/NSI-511) | Add the apps/console placeholder page and src/env.ts |
| P0-15 | [NSI-513](https://linear.app/nsims/issue/NSI-513) | Add .env.example with every documented variable |
| P0-16 | [NSI-514](https://linear.app/nsims/issue/NSI-514) | Add GitHub Actions CI for lint, typecheck, test and build |
| P0-17 | [NSI-516](https://linear.app/nsims/issue/NSI-516) | Add the PR template with contract, tenancy and security sections |
| P0-18 | [NSI-517](https://linear.app/nsims/issue/NSI-517) | Draft and decide ADRs 002 to 006 |
| P0-19 | [NSI-518](https://linear.app/nsims/issue/NSI-518) | Pass the Phase 0 exit gate |
| P1-01 | [NSI-491](https://linear.app/nsims/issue/NSI-491) | Build the spec compiler with noul, choice and score modules |
| P1-02 | [NSI-493](https://linear.app/nsims/issue/NSI-493) | Build the stage orchestrator: checks, when, stateFrom and batch split |
| P1-03 | [NSI-496](https://linear.app/nsims/issue/NSI-496) | Build the confidence router per the normative table |
| P1-04 | [NSI-499](https://linear.app/nsims/issue/NSI-499) | Implement cost and savings math for all three kinds |
| P1-05 | [NSI-501](https://linear.app/nsims/issue/NSI-501) | Add token preflight from ModelProfile limits |
| P1-06 | [NSI-503](https://linear.app/nsims/issue/NSI-503) | Implement lints with stable rule ids, including model and weakness lints |
| P1-07 | [NSI-505](https://linear.app/nsims/issue/NSI-505) | Implement interfaceOf and diffInterface |
| P1-08 | [NSI-508](https://linear.app/nsims/issue/NSI-508) | Write the authz.ts role matrix |
| P1-09 | [NSI-510](https://linear.app/nsims/issue/NSI-510) | Build system-one-client with SDK and fixture transports |
| P1-10 | [NSI-512](https://linear.app/nsims/issue/NSI-512) | Build llm-client with the LlmTransport port and a fixture transport |
| P1-11 | [NSI-515](https://linear.app/nsims/issue/NSI-515) | Build bandwise run --local in packages/cli/src/local |
| P1-12 | [NSI-519](https://linear.app/nsims/issue/NSI-519) | Write the full Drizzle schema with RLS in migration 0001 |
| P1-13 | [NSI-520](https://linear.app/nsims/issue/NSI-520) | Implement withTenant with transaction-local set_config |
| P1-14 | [NSI-521](https://linear.app/nsims/issue/NSI-521) | Add the RLS setting test for app.org_id |
| P1-15 | [NSI-523](https://linear.app/nsims/issue/NSI-523) | Add repositories for every table with no raw db export |
| P1-16 | [NSI-526](https://linear.app/nsims/issue/NSI-526) | Add the immutability trigger on published versions |
| P1-17 | [NSI-527](https://linear.app/nsims/issue/NSI-527) | Add the two-org seed |
| P1-18 | [NSI-530](https://linear.app/nsims/issue/NSI-530) | Add dev implementations: local KEK vault, in-memory limiter and quota |
| P1-19 | [NSI-532](https://linear.app/nsims/issue/NSI-532) | Implement RunSink over the repositories |
| P1-20 | [NSI-536](https://linear.app/nsims/issue/NSI-536) | Run the registry sync, alias probe and contract watch jobs |
| P1-21 | [NSI-540](https://linear.app/nsims/issue/NSI-540) | Record the minimum fixture set, including an alias-resolved response |
| P1-22 | [NSI-541](https://linear.app/nsims/issue/NSI-541) | Add the fixture contract test against zod |
| P1-23 | [NSI-543](https://linear.app/nsims/issue/NSI-543) | Add the pinned-classification table test |
| P1-24 | [NSI-546](https://linear.app/nsims/issue/NSI-546) | Build the packages/evals CLI |
| P1-25 | [NSI-549](https://linear.app/nsims/issue/NSI-549) | Build the cross-tenant suite generator |
| P1-26 | [NSI-551](https://linear.app/nsims/issue/NSI-551) | Add the live smoke script for the smoke list models |
| P1-27 | [NSI-552](https://linear.app/nsims/issue/NSI-552) | Pass the Phase 1 exit gate |
| P2-01 | [NSI-522](https://linear.app/nsims/issue/NSI-522) | Wire auth per ADR-002: orgs, memberships, invites, roles, active org |
| P2-02 | [NSI-524](https://linear.app/nsims/issue/NSI-524) | Add the org switcher and /[orgSlug] routing |
| P2-03 | [NSI-525](https://linear.app/nsims/issue/NSI-525) | Build the BYO key vault with envelope encryption and validation |
| P2-04 | [NSI-528](https://linear.app/nsims/issue/NSI-528) | Add platform key mode |
| P2-05 | [NSI-529](https://linear.app/nsims/issue/NSI-529) | Add app tokens: sk_live_, sk_test_ and pk_live_ |
| P2-06 | [NSI-531](https://linear.app/nsims/issue/NSI-531) | Add agent tokens (sa_live_) with role ceiling, scopes and expiry |
| P2-07 | [NSI-533](https://linear.app/nsims/issue/NSI-533) | Build the device flow for agent tokens (RFC 8628) |
| P2-08 | [NSI-534](https://linear.app/nsims/issue/NSI-534) | Implement runOperation steps: actor, validation, can() and If-Match |
| P2-09 | [NSI-535](https://linear.app/nsims/issue/NSI-535) | Add approval_requests and the approval step in runOperation |
| P2-10 | [NSI-537](https://linear.app/nsims/issue/NSI-537) | Add the agentApprovals org setting and the always-gated list |
| P2-11 | [NSI-538](https://linear.app/nsims/issue/NSI-538) | Add idempotency middleware on idempotency_keys |
| P2-12 | [NSI-539](https://linear.app/nsims/issue/NSI-539) | Serve runs through set.run on POST /api/v1/sets/{ref}/run |
| P2-13 | [NSI-542](https://linear.app/nsims/issue/NSI-542) | Add browser token minting with ES256 and the JWKS route |
| P2-14 | [NSI-544](https://linear.app/nsims/issue/NSI-544) | Add org_webhook_secrets, encrypted like TypeSafe keys |
| P2-15 | [NSI-545](https://linear.app/nsims/issue/NSI-545) | Split retention into state, answers and dataset settings |
| P2-16 | [NSI-547](https://linear.app/nsims/issue/NSI-547) | Add rate limiters per org, token, eval bucket and model budget |
| P2-17 | [NSI-548](https://linear.app/nsims/issue/NSI-548) | Write audit rows inside withTenant for every mutation |
| P2-18 | [NSI-550](https://linear.app/nsims/issue/NSI-550) | Build the platform admin route group with impersonation |
| P2-19 | [NSI-553](https://linear.app/nsims/issue/NSI-553) | Write plans.ts with plan limits |
| P2-20 | [NSI-554](https://linear.app/nsims/issue/NSI-554) | Set up Stripe products, meters, Checkout and Customer Portal |
| P2-21 | [NSI-555](https://linear.app/nsims/issue/NSI-555) | Handle Stripe webhooks with idempotency and read-only mode |
| P2-22 | [NSI-556](https://linear.app/nsims/issue/NSI-556) | Build the meter outbox job to Stripe |
| P2-23 | [NSI-557](https://linear.app/nsims/issue/NSI-557) | Carry the resolved model on usage events into metering |
| P2-24 | [NSI-558](https://linear.app/nsims/issue/NSI-558) | Add price book defaults and per-org overrides by versioned model |
| P2-25 | [NSI-559](https://linear.app/nsims/issue/NSI-559) | Build the nightly usage_daily rollup |
| P2-26 | [NSI-561](https://linear.app/nsims/issue/NSI-561) | Add the quota guard on usage_daily plus a same-day Redis counter |
| P2-27 | [NSI-562](https://linear.app/nsims/issue/NSI-562) | Build the console shell and settings pages |
| P2-28 | [NSI-563](https://linear.app/nsims/issue/NSI-563) | Build the approvals inbox: list, approve and reject |
| P2-29 | [NSI-564](https://linear.app/nsims/issue/NSI-564) | Review keys, tokens, device flow and approvals for security |
| P2-30 | [NSI-565](https://linear.app/nsims/issue/NSI-565) | Pass the Phase 2 exit gate |
| P3-01 | [NSI-560](https://linear.app/nsims/issue/NSI-560) | Register project, goal, template, set and draft operations |
| P3-02 | [NSI-566](https://linear.app/nsims/issue/NSI-566) | Register version, release and rollout operations with dry runs |
| P3-03 | [NSI-567](https://linear.app/nsims/issue/NSI-567) | Register dataset, eval, compare and review operations |
| P3-04 | [NSI-568](https://linear.app/nsims/issue/NSI-568) | Register run, usage, report, audit, alert, model and org operations |
| P3-05 | [NSI-569](https://linear.app/nsims/issue/NSI-569) | Enforce the full parity test in CI |
| P3-06 | [NSI-570](https://linear.app/nsims/issue/NSI-570) | Build goals CRUD with a QualityTarget and business KPI |
| P3-07 | [NSI-572](https://linear.app/nsims/issue/NSI-572) | Build the set list and create flow, seeding two templates |
| P3-08 | [NSI-573](https://linear.app/nsims/issue/NSI-573) | Build the question editor with form and JSON modes and live lints |
| P3-09 | [NSI-575](https://linear.app/nsims/issue/NSI-575) | Build the model picker from model.list |
| P3-10 | [NSI-576](https://linear.app/nsims/issue/NSI-576) | Build the options editor for choice, score and noul |
| P3-11 | [NSI-578](https://linear.app/nsims/issue/NSI-578) | Build the policy editor with band sliders and live preview |
| P3-12 | [NSI-580](https://linear.app/nsims/issue/NSI-580) | Build the input schema editor, redact paths and preflight meter |
| P3-13 | [NSI-581](https://linear.app/nsims/issue/NSI-581) | Build the publish flow with lints, eval gate and dry-run preview |
| P3-14 | [NSI-583](https://linear.app/nsims/issue/NSI-583) | Build version history, diffs, release events, rollback and promote |
| P3-15 | [NSI-585](https://linear.app/nsims/issue/NSI-585) | Build per-channel rollout control with gate status |
| P3-16 | [NSI-587](https://linear.app/nsims/issue/NSI-587) | Add the jobs endpoint GET /api/v1/jobs/{id} |
| P3-17 | [NSI-589](https://linear.app/nsims/issue/NSI-589) | Send approval emails and the 24-hour reminder |
| P3-18 | [NSI-590](https://linear.app/nsims/issue/NSI-590) | Build the approvals decision UI with diff, gates and dry run |
| P3-19 | [NSI-592](https://linear.app/nsims/issue/NSI-592) | Build agent token management for admins |
| P3-20 | [NSI-593](https://linear.app/nsims/issue/NSI-593) | Serve the event feed GET /api/v1/events |
| P3-21 | [NSI-594](https://linear.app/nsims/issue/NSI-594) | Serve the feedback API with a server-derived source |
| P3-22 | [NSI-595](https://linear.app/nsims/issue/NSI-595) | Build the bandwise CLI foundation: login, profiles, status, bandwise api |
| P3-23 | [NSI-596](https://linear.app/nsims/issue/NSI-596) | Add the Phase 3 named CLI commands |
| P3-24 | [NSI-598](https://linear.app/nsims/issue/NSI-598) | Add specs as code: spec pull, push, diff, validate, datasets push |
| P3-25 | [NSI-600](https://linear.app/nsims/issue/NSI-600) | Ship the MCP stdio server with the Phase 3 curated tools |
| P3-26 | [NSI-602](https://linear.app/nsims/issue/NSI-602) | Regenerate OpenAPI and MSW mocks from the registry |
| P3-27 | [NSI-603](https://linear.app/nsims/issue/NSI-603) | Build the playground with structural and behavioral diffs |
| P3-28 | [NSI-605](https://linear.app/nsims/issue/NSI-605) | Build the runs explorer and run detail |
| P3-29 | [NSI-606](https://linear.app/nsims/issue/NSI-606) | Build the review queue for action and label items |
| P3-30 | [NSI-607](https://linear.app/nsims/issue/NSI-607) | Build the audit sampler per the labeling policy |
| P3-31 | [NSI-609](https://linear.app/nsims/issue/NSI-609) | Build dataset screens with fixed splits and snapshots |
| P3-32 | [NSI-611](https://linear.app/nsims/issue/NSI-611) | Build eval runs on snapshots with calibration charts |
| P3-33 | [NSI-612](https://linear.app/nsims/issue/NSI-612) | Build the Definition Studio operations and server holdout rules |
| P3-34 | [NSI-614](https://linear.app/nsims/issue/NSI-614) | Build the Definition Studio wizard |
| P3-35 | [NSI-616](https://linear.app/nsims/issue/NSI-616) | Build the gate evaluator with Wilson lower bounds |
| P3-36 | [NSI-617](https://linear.app/nsims/issue/NSI-617) | Run the hourly gate evaluator and auto-demote job |
| P3-37 | [NSI-619](https://linear.app/nsims/issue/NSI-619) | Warn when a live set has no truth source |
| P3-38 | [NSI-620](https://linear.app/nsims/issue/NSI-620) | Build the platform admin Models page |
| P3-39 | [NSI-622](https://linear.app/nsims/issue/NSI-622) | Build the org model list |
| P3-40 | [NSI-623](https://linear.app/nsims/issue/NSI-623) | Enforce model lints at publish |
| P3-41 | [NSI-624](https://linear.app/nsims/issue/NSI-624) | Build savings and usage dashboards for org, project and set |
| P3-42 | [NSI-626](https://linear.app/nsims/issue/NSI-626) | Build the standard reports with CSV export and monthly PDF |
| P3-43 | [NSI-627](https://linear.app/nsims/issue/NSI-627) | Add the model upgrades report and alias-moved and deprecation alerts |
| P3-44 | [NSI-628](https://linear.app/nsims/issue/NSI-628) | Build the audit log viewer with filters and CSV export |
| P3-45 | [NSI-630](https://linear.app/nsims/issue/NSI-630) | Pass the Phase 3 exit gate |
| P3b-01 | [NSI-571](https://linear.app/nsims/issue/NSI-571) | Build policy replay in packages/core/src/learning |
| P3b-02 | [NSI-574](https://linear.app/nsims/issue/NSI-574) | Build suggestThresholds returning ThresholdProposal |
| P3b-03 | [NSI-577](https://linear.app/nsims/issue/NSI-577) | Add the policy.suggest operation as a job |
| P3b-04 | [NSI-579](https://linear.app/nsims/issue/NSI-579) | Add "Suggest from labels" to the policy editor |
| P3b-05 | [NSI-582](https://linear.app/nsims/issue/NSI-582) | Add MCP suggest_thresholds and bandwise tune |
| P3b-06 | [NSI-584](https://linear.app/nsims/issue/NSI-584) | Build the question_daily rollup and SetHealth |
| P3b-07 | [NSI-586](https://linear.app/nsims/issue/NSI-586) | Add the health.get and health.list operations |
| P3b-08 | [NSI-588](https://linear.app/nsims/issue/NSI-588) | Build the Health tab and the org "Needs attention" list |
| P3b-09 | [NSI-591](https://linear.app/nsims/issue/NSI-591) | Add MCP get_set_health and bandwise health |
| P3b-10 | [NSI-597](https://linear.app/nsims/issue/NSI-597) | Add the proposals table and proposal operations |
| P3b-11 | [NSI-599](https://linear.app/nsims/issue/NSI-599) | Build the weekly threshold-refit job and health-rule proposals |
| P3b-12 | [NSI-601](https://linear.app/nsims/issue/NSI-601) | Build the proposals inbox |
| P3b-13 | [NSI-604](https://linear.app/nsims/issue/NSI-604) | Add MCP proposal tools, update_set and bandwise proposals |
| P3b-14 | [NSI-608](https://linear.app/nsims/issue/NSI-608) | Add the experiments table and experiment operations |
| P3b-15 | [NSI-610](https://linear.app/nsims/issue/NSI-610) | Dual-run the challenger on a sample after the champion responds |
| P3b-16 | [NSI-613](https://linear.app/nsims/issue/NSI-613) | Start an experiment on production publish of controlled or full sets |
| P3b-17 | [NSI-615](https://linear.app/nsims/issue/NSI-615) | Build the experiment scorer job and the promotion rule |
| P3b-18 | [NSI-618](https://linear.app/nsims/issue/NSI-618) | Add MCP experiment tools and bandwise experiments commands |
| P3b-19 | [NSI-621](https://linear.app/nsims/issue/NSI-621) | Add the set.try_model operation as a job |
| P3b-20 | [NSI-625](https://linear.app/nsims/issue/NSI-625) | Build the model-upgrade candidates job |
| P3b-21 | [NSI-629](https://linear.app/nsims/issue/NSI-629) | Add eval deltas to model.upgrades and the model-upgrades report |
| P3b-22 | [NSI-631](https://linear.app/nsims/issue/NSI-631) | Build the Model upgrades page |
| P3b-23 | [NSI-632](https://linear.app/nsims/issue/NSI-632) | Add MCP try_model and bandwise upgrade list and try |
| P3b-24 | [NSI-635](https://linear.app/nsims/issue/NSI-635) | Build the set.improve job with typed edits and holdout rules |
| P3b-25 | [NSI-637](https://linear.app/nsims/issue/NSI-637) | Build the Studio improve screen |
| P3b-26 | [NSI-639](https://linear.app/nsims/issue/NSI-639) | Add bandwise improve and MCP improve_set |
| P3b-27 | [NSI-641](https://linear.app/nsims/issue/NSI-641) | Add eval repeats and a per-question stability metric |
| P3b-28 | [NSI-642](https://linear.app/nsims/issue/NSI-642) | Copy labeled and feedback runs into dataset_cases before purge |
| P3b-29 | [NSI-645](https://linear.app/nsims/issue/NSI-645) | Add the dataset.features endpoint for drafting and calibration |
| P3b-30 | [NSI-647](https://linear.app/nsims/issue/NSI-647) | Compute quality-adjusted value in rollups, health and ROI |
| P3b-31 | [NSI-649](https://linear.app/nsims/issue/NSI-649) | Pass the Phase 3b exit gate |
| P4-01 | [NSI-633](https://linear.app/nsims/issue/NSI-633) | Build @bandwise/client with run, run<T>, reportFeedback and route helpers |
| P4-02 | [NSI-634](https://linear.app/nsims/issue/NSI-634) | Keep @bandwise/client fetch-only and test it in the edge runtime |
| P4-03 | [NSI-636](https://linear.app/nsims/issue/NSI-636) | Handle 429 with Retry-After in a single retry layer |
| P4-04 | [NSI-638](https://linear.app/nsims/issue/NSI-638) | Mint browser tokens through POST /api/v1/tokens/browser |
| P4-05 | [NSI-640](https://linear.app/nsims/issue/NSI-640) | Support publishable pk_ mode |
| P4-06 | [NSI-643](https://linear.app/nsims/issue/NSI-643) | Build @bandwise/react components and headless hooks |
| P4-07 | [NSI-644](https://linear.app/nsims/issue/NSI-644) | Add theming through CSS variables with accessible defaults |
| P4-08 | [NSI-646](https://linear.app/nsims/issue/NSI-646) | Build apps/example-embed using both modes |
| P4-09 | [NSI-648](https://linear.app/nsims/issue/NSI-648) | Write integration recipes for Next.js, Express, curl and httpx |
| P4-10 | [NSI-650](https://linear.app/nsims/issue/NSI-650) | Pass the Phase 4 exit gate |
| P4b-01 | [NSI-652](https://linear.app/nsims/issue/NSI-652) | Add app profile fields language, framework and repo_url |
| P4b-02 | [NSI-654](https://linear.app/nsims/issue/NSI-654) | Add app_opportunities and the opportunity operations |
| P4b-03 | [NSI-656](https://linear.app/nsims/issue/NSI-656) | Build the console "Describe your app" form |
| P4b-04 | [NSI-657](https://linear.app/nsims/issue/NSI-657) | Add MCP opportunity tools, create_app and bandwise opportunities |
| P4b-05 | [NSI-659](https://linear.app/nsims/issue/NSI-659) | Add the pattern enum and the pattern advisor to the drafting prompt |
| P4b-06 | [NSI-660](https://linear.app/nsims/issue/NSI-660) | Prefill the Definition Studio from an Opportunity |
| P4b-07 | [NSI-663](https://linear.app/nsims/issue/NSI-663) | Build the packages/codegen TypeScript target |
| P4b-08 | [NSI-665](https://linear.app/nsims/issue/NSI-665) | Add the set.codegen operation and route |
| P4b-09 | [NSI-668](https://linear.app/nsims/issue/NSI-668) | Add bandwise codegen and MCP generate_client |
| P4b-10 | [NSI-669](https://linear.app/nsims/issue/NSI-669) | Add the console "Use in your app" tab |
| P4b-11 | [NSI-671](https://linear.app/nsims/issue/NSI-671) | Add app_set_bindings and the binding operations |
| P4b-12 | [NSI-673](https://linear.app/nsims/issue/NSI-673) | Build the app page and the set Consumers panel |
| P4b-13 | [NSI-674](https://linear.app/nsims/issue/NSI-674) | Make interface.breaking use bindings plus recent app runs |
| P4b-14 | [NSI-675](https://linear.app/nsims/issue/NSI-675) | Enforce the Bandwise-Interface header on runs |
| P4b-15 | [NSI-676](https://linear.app/nsims/issue/NSI-676) | Build bandwise init |
| P4b-16 | [NSI-677](https://linear.app/nsims/issue/NSI-677) | Write .bandwise/lock.json from bandwise codegen |
| P4b-17 | [NSI-678](https://linear.app/nsims/issue/NSI-678) | Build bandwise check with exit code 2 on drift |
| P4b-18 | [NSI-679](https://linear.app/nsims/issue/NSI-679) | Decide the ADR-009 Python section |
| P4b-19 | [NSI-681](https://linear.app/nsims/issue/NSI-681) | Build the Python client, Python codegen and examples/fastapi |
| P4b-20 | [NSI-684](https://linear.app/nsims/issue/NSI-684) | Decide the ADR-009 Standalone section |
| P4b-21 | [NSI-686](https://linear.app/nsims/issue/NSI-686) | Build the standalone export and POST /api/v1/runs/ingest |
| P4b-22 | [NSI-688](https://linear.app/nsims/issue/NSI-688) | Review codegen output and bandwise init tokens for security |
| P4b-23 | [NSI-690](https://linear.app/nsims/issue/NSI-690) | Pass the Phase 4b exit gate |
| P5-01 | [NSI-651](https://linear.app/nsims/issue/NSI-651) | Build plugin-sdk with definePlugin and the plugin interfaces |
| P5-02 | [NSI-653](https://linear.app/nsims/issue/NSI-653) | Build the built-in input adapters |
| P5-03 | [NSI-655](https://linear.app/nsims/issue/NSI-655) | Add the adapter picker to the input editor |
| P5-04 | [NSI-658](https://linear.app/nsims/issue/NSI-658) | Build the built-in actions: webhook, Slack, email and review item |
| P5-05 | [NSI-661](https://linear.app/nsims/issue/NSI-661) | Seed the remaining nine templates, each tagged with a pattern |
| P5-06 | [NSI-662](https://linear.app/nsims/issue/NSI-662) | Add per-org plugin enablement with encrypted config |
| P5-07 | [NSI-664](https://linear.app/nsims/issue/NSI-664) | Build the plugin conformance test suite |
| P5-08 | [NSI-666](https://linear.app/nsims/issue/NSI-666) | Add an example third-party plugin in examples/ |
| P5-09 | [NSI-667](https://linear.app/nsims/issue/NSI-667) | Deliver org event webhooks with HMAC signatures and retries |
| P5-10 | [NSI-670](https://linear.app/nsims/issue/NSI-670) | Publish a GitHub Action for bandwise check and spec diff comments |
| P5-11 | [NSI-672](https://linear.app/nsims/issue/NSI-672) | Pass the Phase 5 exit gate |
| P6-01 | [NSI-680](https://linear.app/nsims/issue/NSI-680) | Scaffold the WXT MV3 extension with activeTab and storage only |
| P6-02 | [NSI-682](https://linear.app/nsims/issue/NSI-682) | Sign in with the device flow and keep the token in session storage |
| P6-03 | [NSI-683](https://linear.app/nsims/issue/NSI-683) | Add the org and set picker |
| P6-04 | [NSI-685](https://linear.app/nsims/issue/NSI-685) | Build evaluate page mode with the web page adapter |
| P6-05 | [NSI-687](https://linear.app/nsims/issue/NSI-687) | Build action picker mode |
| P6-06 | [NSI-689](https://linear.app/nsims/issue/NSI-689) | Enforce the autonomy rule for extension clicks |
| P6-07 | [NSI-691](https://linear.app/nsims/issue/NSI-691) | Default web page adapter sets to high risk with adversarial cases |
| P6-08 | [NSI-692](https://linear.app/nsims/issue/NSI-692) | Review the extension against the threat model |
| P6-09 | [NSI-693](https://linear.app/nsims/issue/NSI-693) | Pass the Phase 6 exit gate |
| P7-01 | [NSI-694](https://linear.app/nsims/issue/NSI-694) | Add the MCP HTTP transport and any missing 3b and 4b tools |
| P7-02 | [NSI-695](https://linear.app/nsims/issue/NSI-695) | Authenticate the MCP server with an agent token only |
| P7-03 | [NSI-696](https://linear.app/nsims/issue/NSI-696) | Package plugins/claude-code with bandwise-operator and bandwise-integrate |
| P7-04 | [NSI-697](https://linear.app/nsims/issue/NSI-697) | Keep the bandwise-builder skill out of the plugin |
| P7-05 | [NSI-698](https://linear.app/nsims/issue/NSI-698) | Publish a marketplace repo or local marketplace entry |
| P7-06 | [NSI-699](https://linear.app/nsims/issue/NSI-699) | Pass the Phase 7 exit gate |
