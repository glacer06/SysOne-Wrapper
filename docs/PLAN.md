# SysOne Wrapper: Plan

**Owner:** Nick Sims
**Date:** 2026-09-26
**Status:** Phase 0 part one complete (builder skill and plan)

## Why this exists

TypeSafe's Jev is a new kind of model. It doesn't write. It decides. You hand it `state` and a few typed questions, and it returns typed answers with probabilities and a calibrated confidence number, in well under a second, for $0.042 per million input tokens with free output. That makes it cheap enough to put a judgment call at every decision point in software: routing, triage, guardrails, PR safety, which LLM to use, which context to keep.

Raw API calls leave a lot on the table. Nobody owns the questions. There's no versioning, no review loop for the uncertain cases, no way to change a threshold without a deploy, and no proof the thing is saving money. SysOne is that missing layer, sold as a multi-tenant product and used by Nick across his own orgs (SGR, Personal, Dallas).

## What the product covers

| Nick's ask | Where it lives |
|---|---|
| Extension | Plugin SDK (Phase 5), Chrome extension with evaluate and action picker modes (Phase 6), Claude Code plugin and MCP server (Phase 7) |
| Inputs | Input schema per set, input adapters, state builder with backtick path autocomplete, redaction, token preflight |
| Managed live | Channels and release pointers, publish, rollback, version pinning, cache with epoch invalidation, no redeploys |
| Managed questions | Question editor (form and JSON), versions and diffs, lints, template library, Definition Studio, eval gates |
| Goal | `goals` table with intent statement and success metric; every set belongs to one |
| Confidence levels | Per-question policies, three bands, band-to-action mapping, rollout stages, calibration reports |
| Options | Choice options (up to 255 with a "none" nudge), score levels (2 to 10), noul criteria, composites and weights |
| Full administration | Multi-tenant orgs, five roles, platform super-admin, audit log, keys, billing, retention, PII, reports, alerts |
| Wide flexibility | Structured instructions, multi-stage runs, composites, LLM escalation, pluggable transports, plugins, API, embed, MCP |

## Sources

- TypeSafe docs, verified 2026-09-26: `https://docs.typesafe.ai/llms.txt`, `/api.md`, `/models.md`, `/confidence.md`, `/agent-skill.md`, `/sdk/javascript.md`
- Official agent skill: `https://github.com/typesafe-ai/skills`
- Every, "How to Get the Most Out of Jev" (2026-09-23): Definition Studio workflow, the 10-second rule, the email urgency checks, comparator prices
- Linas, "How to Use Jev AI" (2026-09-22): shadow mode to production path, reasoning-effort controller, gateway availability (unverified)
- The Code, "A developer's guide to start using Jev" (2026-09-26): setup path, context pruning (fast-jev-compaction), browser action picker (browser-use/jev-ultrafast), log-line pager, PR auto-merge and LLM routing use cases

## Architecture in one screen

```
                     +-------------------- apps/console (Next.js) --------------------+
  browser  ------->  | tenant console | platform admin | /api/v1 | webhooks | jobs    |
                     +-----+----------------+----------------+----------------+-------+
                           |                |                |                |
                     packages/tenancy  packages/billing  packages/db    packages/jev-client --> Jev
                     (context, vault,  (plans, Stripe,   (Drizzle, RLS,  (SDK transport,
                      tokens, limits)   meters)           withTenant)     fixtures)
                           \                |                /
                            +------- packages/core (pure) --+
                              contracts, compiler, router, savings, lints

  host apps  --> @sysone/client (server) --> /api/v1        @sysone/react (browser, no secrets)
  Chrome ext --> console session token --> /api/v1         MCP server --> sk_ token --> /api/v1
```

Full detail is in `.claude/skills/sysone-builder/references/architecture.md`.

## Key decisions

- **Tenancy from migration 0001.** `org_id` and RLS on every tenant table, plus a repository layer. Cross-tenant requests return 404.
- **One source of truth per set.** `QuestionSetSpec` holds questions, thresholds, composites, routes, and savings settings. Published versions never change.
- **Three bands, four actions, five rollout stages.** Callers act on `effectiveAction`, which already accounts for the rollout stage.
- **Savings on every run.** Three kinds (decision counterfactual, escalation avoided, context pruned), labeled as estimates with their assumptions shown.
- **Keys stay on the server.** BYO TypeSafe keys are envelope-encrypted per org. Embeds use app tokens. The extension and MCP server never see a Jev key.

## Phases

| Phase | What ships | Exit gate (short form) |
|---|---|---|
| 0 | Builder skill, plan, scaffold, frozen contracts, CI | Scaffold passes lint, typecheck, test, build |
| 1 | Core engine, jev-client, schema with RLS, fixtures | End-to-end run on fixtures; cross-tenant suite passes |
| 2 | Auth, orgs, keys, tokens, rate limits, Stripe foundation, platform admin | Three-org switch with no leak; Stripe reconciles within 0.1% |
| 3 | Console: editor, policies, publish and rollback, playground, review, evals, Studio, dashboards | Publish v2 and rollback via API with no redeploy |
| 4 | Embed kit: `@sysone/client`, `@sysone/react`, example app | No secrets in bundles; under 15 kB gzip |
| 5 | Plugin SDK, built-in adapters and actions, eleven templates | Templates build working sets; actions idempotent |
| 6 | Chrome extension: evaluate page, action picker | No keys in extension; nothing sent before a click |
| 7 | MCP server and Claude Code plugin | Install and run a set from a prompt |

Checklists: `.claude/skills/sysone-builder/references/phases/`.

## Spinning up the team

Each role runs as its own Claude Code session (or subagent) on its own branch and worktree. Every session starts by loading the builder skill. Suggested kickoff prompts:

**Architect / Lead (Phase 0 part two)**
> Load the sysone-builder skill. Complete Phase 0 part two from `references/phases/phase-0.md`: scaffold the pnpm and turborepo workspace, write the zod contracts in `packages/core/src/contracts`, generate `openapi.json`, add boundary lint rules and CI, and draft ADRs 002 through 006. Open a draft PR per logical chunk.

**Core Engine (Phase 1)**
> Load the sysone-builder skill. Build the Core Engine items in `references/phases/phase-1.md`. Start with the confidence router and its table-driven tests, then the compiler, stages, savings math, preflight, and lints. Use the fixture transport only. Don't touch `packages/db`.

**Platform / Tenancy (Phase 1)**
> Load the sysone-builder skill. Build the Platform items in `references/phases/phase-1.md`: the full Drizzle schema from `references/data-model.md` with RLS in migration 0001, `withTenant`, repositories, the immutability trigger, and a two-org seed. Pair with QA on the cross-tenant suite.

**QA / Evals (Phase 1)**
> Load the sysone-builder skill. Build the QA items in `references/phases/phase-1.md`: the fixture minimum set from `references/testing.md`, the fixture contract test, the cross-tenant suite generator, and `pnpm smoke`.

Later phases follow the same pattern: load the skill, open the phase file, stay in your lane, hand off through the protocol in `references/team-playbook.md`.

## Before the first paying customer

- ADR-002 (auth library) decided.
- Stripe, Linear, and Sentry connectors authorized in claude.ai so agents can use them.
- DPA lists TypeSafe (and Anthropic, if Studio drafting is on) as subprocessors.
- TypeSafe rate limits confirmed for the expected load. The published 1,200 RPM and 250k tokens/sec limits are shared across every tenant on the platform key, and TypeSafe says they are adjusting dynamically.

## Open items

- **Gateways:** a newsletter reports Jev on Vercel AI Gateway, OpenRouter, and Cloudflare Workers AI. Not confirmed in TypeSafe docs. `JevTransport` leaves room; verify before building an adapter.
- **Compaction plugin:** `tamaratran/fast-jev-compaction` reportedly needs `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1`. Optional for long agent sessions, not required.
- **Comparator prices:** the defaults in the savings ledger come from Every's 2026-09-23 newsletter. Confirm against vendor pricing pages before the first customer report.
- **Auth library:** Auth.js (approved) versus Better Auth (recommended by design review). Decided in ADR-002.
