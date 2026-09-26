# SysOne Wrapper: Plan

**Owner:** Nick Sims
**Date:** 2026-09-26
**Status:** Phase 0 complete. The scaffold and frozen contracts are built with a green gate, and Nick accepted ADRs 002 to 010 on 2026-09-26 (ADR-002 picks Better Auth). ADR-011 (OpenRouter route) is proposed. Phase 1 is next.

## Why this exists

TypeSafe's Jev is a new kind of model. It doesn't write. It decides. You hand it `state` and a few typed questions, and it returns typed answers with probabilities and a calibrated confidence number, in well under a second, for $0.042 per million input tokens (Jev 1.13) with free output. That makes it cheap enough to put a judgment call at every decision point in software: routing, triage, guardrails, PR safety, which LLM to use, which context to keep.

Raw API calls leave a lot on the table. Nobody owns the questions. There's no versioning, no review loop for the uncertain cases, no way to change a threshold without a deploy, and no proof the thing is saving money. SysOne is that missing layer, sold as a multi-tenant product and used by Nick across his own orgs (SGR, Personal, Dallas).

On 2026-09-26 Nick set the bar:

> This wrapper needs to be able to setup, manage and deploy the right Jev code for apps that want to use Jev effectively and improve its effectiveness. It should have a UI/UX but also be headless so an agent can manage it as well. This should work for Jev and also any new System One models that are released by TypeSafe.

That becomes four commitments:

- **Headless parity (ADR-007).** Everything the console does is an operation that the API, the `sysone` CLI and the MCP server also expose, so an agent can run the product.
- **Any System One model (ADR-008).** Model facts are registry data and code names are neutral, so a new TypeSafe model is a registry row, not a rewrite.
- **App setup and deploy (ADR-009).** SysOne finds decision points in an app, builds the set, and wires it in through generated typed code, with interface versions that fail loudly.
- **Effectiveness loop (ADR-010).** Apps report outcomes, audit samples keep precision honest, and thresholds, questions and models improve through proposals, experiments and human approval.

## What the product covers

| Nick's ask | Where it lives |
|---|---|
| Extension | Plugin SDK (Phase 5), Chrome extension with evaluate and action picker modes (Phase 6), MCP server (stdio in Phase 3, HTTP in Phase 7), Claude Code plugin (Phase 7) |
| Inputs | Input schema per set, input adapters, state builder with backtick path autocomplete, redaction, token preflight |
| Managed live | Channels and release pointers, rollout stage per channel pointer, publish, rollback, version pinning, cache with epoch invalidation, no redeploys |
| Managed questions | Question editor (form and JSON), versions and diffs, lints, template library, Definition Studio, eval gates |
| Goal | `goals` with an intent statement and a typed QualityTarget; every set belongs to one |
| Confidence levels | Per-question policies, three bands, band-to-action mapping, rollout stages per channel, calibration reports |
| Options | Choice options (up to 255 with a "none" nudge) and score levels (2 to 10), both API-wide rules; noul criteria, composites and weights |
| Full administration | Multi-tenant orgs, five roles, platform super-admin, audit log, keys, billing, retention, PII, reports, alerts |
| Wide flexibility | Structured instructions, multi-stage runs, composites, LLM escalation, pluggable transports, plugins, API, embed, MCP |
| Set up apps | App profile, opportunity finder (agent and console), pattern advisor, Definition Studio prefill, generated typed clients, app bindings (Phase 4b) |
| Deploy | Deploy targets managed, managed_typed, standalone (ADR-009); specs as code; `sysone codegen` and `sysone check`; interface versioning (Phases 3 and 4b) |
| Headless | Management API with console parity, agent tokens with approvals, `@sysone/cli`, MCP server, event feed (Phases 2 and 3) |
| Improve effectiveness | App feedback, audit sampling, quality targets, threshold suggestions, set health, proposals, champion/challenger, improve mode (Phases 3 and 3b) |
| Any System One model | Model registry, limits and prices as data, new-model detection, try-on-model upgrades, contract watch (Phases 0, 1, 3, 3b) |

## Sources

- TypeSafe docs, verified 2026-09-26: `https://docs.typesafe.ai/llms.txt`, `/api.md`, `/models.md`, `/confidence.md`, `/agent-skill.md`, `/sdk/javascript.md`, `/sdk/python/usage.md`, `/model-jaggedness/jev-1.13.md`, `/concepts/how-to-build-with-system-one.md`, `/patterns/fan-out.md`, `/cookbooks/consistency_choice_cookbook.md`
- TypeSafe OpenAPI spec: `https://api.typesafe.ai/openapi.json` (v0.2.0)
- Official agent skill: `https://github.com/typesafe-ai/skills`
- Every, "How to Get the Most Out of Jev" (2026-09-23): Definition Studio workflow, the 10-second rule, the email urgency checks, comparator prices
- Linas, "How to Use Jev AI" (2026-09-22): shadow mode to production path, reasoning-effort controller, gateway availability (OpenRouter and Vercel now documented by TypeSafe)
- The Code, "A developer's guide to start using Jev" (2026-09-26): setup path, context pruning (fast-jev-compaction), browser action picker (browser-use/jev-ultrafast), log-line pager, PR auto-merge and LLM routing use cases

## Architecture in one screen

```
                   +----------------------------- apps/console (Next.js) ------------------------------+
  browser  ----->  | tenant console | platform admin | /api/v1 + operations registry | webhooks | jobs |
                   +-----+----------------+----------------+----------------+--------------------------+
                         |                |                |                |
                   packages/tenancy  packages/billing  packages/db    packages/system-one-client --> System One (Jev)
                   (context, vault,  (plans, Stripe,   (Drizzle, RLS,  (SDK transport,
                    tokens, limits)   meters)           withTenant)     fixtures)
                         \                |                /
                          +------- packages/core (pure) --+
                            contracts, compiler, router, savings, lints

  host apps  --> @sysone/client or generated client --> /api/v1   @sysone/react (browser, no secrets)
  agents, CI --> sysone CLI or MCP server --> sa_ agent token --> /api/v1
  Chrome ext --> device flow agent token --> /api/v1
```

Full detail is in `.claude/skills/sysone-builder/references/architecture.md`.

## Key decisions

- **Tenancy from migration 0001.** `org_id` and RLS on every tenant table, plus a repository layer. Cross-tenant requests return 404.
- **One source of truth per set.** `QuestionSetSpec` holds questions, thresholds, composites, routes, and savings settings. Published versions never change. Rollout is not in the spec; it lives on each channel's release pointer.
- **Three bands, four actions, five rollout stages (inactive, shadow, controlled, full, paused).** Callers act on `effectiveAction`, which already accounts for the rollout stage.
- **Savings on every run.** Three kinds (decision counterfactual, escalation avoided, context pruned), labeled as estimates with their assumptions shown.
- **Keys stay on the server.** BYO keys (TypeSafe, and OpenRouter once ADR-011 is accepted) are envelope-encrypted per org and provider. Embeds use app tokens. The extension, the CLI and the MCP server never see a TypeSafe key.
- **Headless parity (ADR-007):** one operation registry behind console, API, CLI and MCP; agent tokens with role ceilings and human approvals.
- **Model registry (ADR-008):** model facts are curated data; names in code are neutral (`systemOne`).
- **Deploy targets and interface versioning (ADR-009).**
- **Rollout on pointers and the effectiveness loop (ADR-010).**

- OpenRouter docs, verified 2026-09-26: `openrouter.ai/docs/guides/community/typesafe-sdk.md`, `/guides/community/jev.md`, the System One API reference (`POST /api/v1/systemone`), and the Models API entries `typesafe/*` and `~typesafe/*`

ADRs are in `docs/adr/`: `002-auth-library.md` to `006-billing-model.md`, `007-headless-parity.md`, `008-system-one-model-registry.md`, `009-app-integration-and-deploy-targets.md`, `010-rollout-pointers-and-effectiveness-loop.md`, and `011-openrouter-route.md` (proposed).

## Phases

| Phase | What ships | Exit gate (short form) |
|---|---|---|
| 0 | Builder skill, plan, scaffold, frozen contracts (operation registry skeleton, error envelope v2, ModelProfile, SetInterface, agent actor), ADRs 002 to 010, CI | Scaffold passes lint, typecheck, test, build |
| 1 | Core engine with question-type modules and limits from model profiles, system-one-client, llm-client, model registry seed, schema with RLS, fixtures, local CLI | End-to-end run on fixtures; cross-tenant suite passes |
| 2 | Auth, orgs, keys, app tokens, agent tokens and device flow, approvals, idempotency, rate limits with an eval bucket, Stripe foundation, platform admin | Three-org switch with no leak; Stripe reconciles within 0.1%; an agent token never exceeds its user's role |
| 3 | Console and management API with parity, `sysone` CLI, MCP server (stdio), event feed, feedback API, audit sampling, rollout gates and auto-demote, model registry pages | Publish v2 and roll back from the console or the API with no app redeploy; an agent using only the CLI or MCP runs create to production, waiting for human approval |
| 3b | Effectiveness loop: threshold suggester and replay, set health, proposals, champion/challenger across versions and models, model upgrades, Studio improve mode | An agent tunes a set from labels and promotes a challenger after admin approval; injected drift auto-demotes |
| 4 | Embed kit: `@sysone/client` (edge-safe, typed run, feedback), `@sysone/react`, integration recipes, example app | No secrets in bundles; under 15 kB gzip |
| 4b | Integrate and deploy: opportunities, TypeScript codegen, app bindings, `sysone init`, `codegen` and `check`, interface-breaking guard; Python and standalone behind ADR-009 | An agent wires a set into a sample Next.js repo with no console clicks |
| 5 | Plugin SDK, adapters (including the web page adapter), actions, eleven templates tagged by pattern, org event webhooks | Templates build working sets; actions idempotent |
| 6 | Chrome extension: evaluate page, action picker | No keys in extension; nothing sent before a click |
| 7 | MCP HTTP transport, Claude Code plugin with operator and integrate skills, marketplace | Install, then set up and run a set from a prompt |

Phases 3b and 4b start when Phase 3 lands and run in parallel with Phase 4.

Checklists: `.claude/skills/sysone-builder/references/phases/`.

## Spinning up the team

Each role runs as its own Claude Code session (or subagent) on its own branch and worktree. Every session starts by loading the builder skill. Suggested kickoff prompts:

**Architect / Lead (Phase 0 part two)**
> Load the sysone-builder skill. Complete Phase 0 part two from `references/phases/phase-0.md`: scaffold the pnpm and turborepo workspace, write the zod contracts in `packages/core/src/contracts` (including OperationDef, the error envelope v2, ModelProfile, SetInterface and the agent actor) and the operation registry skeleton, generate `openapi.json`, add boundary lint rules and CI, and draft ADRs 002 through 010. Open a draft PR per logical chunk.

**Core Engine (Phase 1)**
> Load the sysone-builder skill. Build the Core Engine items in `references/phases/phase-1.md`. Start with the confidence router and its table-driven tests, then the compiler, stages, savings math, preflight, and lints. Use the fixture transport only. Don't touch `packages/db`.

**Platform / Tenancy (Phase 1)**
> Load the sysone-builder skill. Build the Platform items in `references/phases/phase-1.md`: the full Drizzle schema from `references/data-model.md` with RLS in migration 0001, `withTenant`, repositories, the immutability trigger, and a two-org seed. Pair with QA on the cross-tenant suite.

**QA / Evals (Phase 1)**
> Load the sysone-builder skill. Build the QA items in `references/phases/phase-1.md`: the fixture minimum set from `references/testing.md`, the fixture contract test, the cross-tenant suite generator, and `pnpm smoke`.

**Integrations (Phase 3)**
> Load the sysone-builder skill. Build the `@sysone/cli` management commands and the MCP stdio server from `references/headless-and-agents.md` against the Phase 3 operations. Stay in `packages/cli` and `packages/mcp-server`.

**Quality / Learning (Phase 3)**
> Load the sysone-builder skill. Build the gate evaluator, auto-demote job and audit sampler from `references/effectiveness-loop.md` in `packages/core/src/learning` and `apps/console/src/jobs/learning`.

Later phases follow the same pattern: load the skill, open the phase file, stay in your lane, hand off through the protocol in `references/team-playbook.md`.

## Before the first paying customer

- ADR-002 (auth library) decided: Better Auth, 2026-09-26. Done.
- ADRs 003 to 010 accepted, 2026-09-26. Done. The ADR-009 Python and Standalone sections still need their own acceptance.
- ADR-011 (OpenRouter route) decided.
- Default `agentApprovals` setting reviewed with the Security reviewer.
- Stripe, Linear (project SysOne, `P-NSI-36`, in the NSIMS team), and Sentry connectors authorized in claude.ai so agents can use them.
- DPA lists TypeSafe (and Anthropic, if Studio drafting is on) as subprocessors, plus OpenRouter for any org that uses the OpenRouter route.
- TypeSafe rate limits confirmed for the expected load. The published 1,200 RPM and 250k tokens/sec limits are shared across every tenant on the platform key, and TypeSafe says they are adjusting dynamically.

## Open items

- **OpenRouter route (ADR-011, proposed):** confirmed 2026-09-25. OpenRouter serves TypeSafe's System One API at `POST https://openrouter.ai/api/v1/systemone`, and the official SDK works with `baseURL: "https://openrouter.ai/api"` and an OpenRouter key. This lets Nick run Jev today with an OpenRouter key and no TypeSafe account. Open question: whether OpenRouter accepts a dated id such as `typesafe/jev-1.13-20260917` as a request model, which a set on OpenRouter needs before it can pass shadow.
- **Other gateways:** Vercel AI Gateway (mentioned in `docs.typesafe.ai/sdk/python/usage.md`) and Cloudflare Workers AI are still unverified. Out of scope. Adding one is another provider value and route rows, through an ADR like ADR-011.
- **`typesafe/jev-router`:** a free OpenRouter chat model (2026-09-25) that uses Jev to pick an LLM and reasoning effort per request. ADR-011 proposes it as an optional escalation route in `llm-client`, reported as LLM spend.
- **Hosted GitHub App** that opens PRs in customer repos: needs an ADR and Security reviewer sign-off.
- **Dev channel and per-environment plugin configs:** not until a customer asks.
- **ConfidencePolicy.measure** (top_probability, margin): later ADR.
- **TypeSafe v1 migration guide:** linked by the official skill, returns 404 today; the contract watch job will flag it.
- **Compaction plugin:** `tamaratran/fast-jev-compaction` reportedly needs `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1`. Optional for long agent sessions, not required.
- **Comparator prices:** the defaults in the savings ledger come from Every's 2026-09-23 newsletter. Confirm against vendor pricing pages before the first customer report.
- **Auth library:** decided in ADR-002 (accepted 2026-09-26): Better Auth with its organization, admin and two-factor plugins.
