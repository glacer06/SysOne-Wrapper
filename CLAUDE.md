# Bandwise

Multi-tenant SaaS kit around TypeSafe's **System One** models (Jev is the first and the default). Orgs set up apps, build versioned question sets, tune confidence bands, publish them live, call them from any app by ID or through generated typed code, and see what every run cost and saved. It is headless first: the console, the `bandwise` CLI, the MCP server and agents share one management API.

**Always load the `bandwise-builder` skill** (`.claude/skills/bandwise-builder/SKILL.md`) before planning or writing code here. It holds the architecture, contracts, phase checklists, and team playbook. For Jev and other System One models themselves, install the official skill (`claude plugin marketplace add typesafe-ai/skills`, then `claude plugin install typesafe@typesafe-ai`) and read `https://docs.typesafe.ai/llms.txt`.

## Status

Phase 0 is done. Part two (monorepo scaffold, zod contracts, operation registry, `openapi.json`) is built and the gate is green. Nick accepted ADRs 002 to 010 on 2026-09-26 (Better Auth, key vault, cache, jobs runner, billing, headless parity, model registry, app integration, rollout pointers), and the contracts in `packages/core/src/contracts` are frozen. The ADR-009 Python and Standalone sections stay proposed. ADR-011 (OpenRouter as a second route to System One models) is proposed. Nick accepted ADR-012 (outage rule and liveness) on 2026-09-27 and the contracts carry `onUnavailable`. On 2026-09-27 Nick also accepted Amendment 1 to ADR-012 (outage rule defaults to `review`), ADR-013 (Vercel AI Gateway as a third route), ADR-014 (per-question calibration, Phase 3b), ADR-015 (escalation spend as the number owners tune) ADR-016 (the product and code are named Bandwise) and ADR-018 (everything on `bandwise.dev`: marketing at `www`, the app and `/api/v1` at `app`, docs at `docs`, `bandwise.ai` redirects; early-access signups in our database; Supabase as the database host, used as plain Postgres). Phase 1 code is merged and the gate is green; the exit gate waits only on real fixtures and the live smoke test, which need a `TYPESAFE_API_KEY`, `OPENROUTER_API_KEY` or `AI_GATEWAY_API_KEY`. The public docs site lives in `apps/docs` (docs.bandwise.dev). The marketing site lives in `apps/web` (www.bandwise.dev, design notes in `apps/web/DESIGN.md`). Before Phase 2, `apps/console` serves only the early-access route and one page on app.bandwise.dev; see `docs/runbooks/early-access.md`. On 2026-09-28 Nick accepted ADR-020: the dogfood track (phase D) comes next, before the rest of Phase 2. Bandwise is used on Bandwise first, starting with Claude Code hooks on this repo, local with his own TypeSafe key, then hosted for the `internal` org, every set in `shadow` until he moves it. See `.claude/skills/bandwise-builder/references/phases/phase-d.md`. D1's CLI side is built: `bandwise run --live`, receipts, `bandwise report`, `bandwise hook`, `bandwise hooks install` and the shadow dogfood sets in `.bandwise/sets/`; see `docs/runbooks/dogfood.md`. D0's fixtures and smoke still need a run from Nick's shell. On 2026-09-29 Nick accepted ADR-020 Amendment 1 (launch profiles: `bandwise launch` may start the agent CLI with a model and effort from a reviewed profiles file). See `docs/PLAN.md` and `.claude/skills/bandwise-builder/references/phases/`.

## Commands

```
pnpm dev                 # console on localhost
pnpm --filter @bandwise/docs dev   # public docs site (apps/docs) on localhost:3001
pnpm turbo lint typecheck test build
pnpm db:migrate          # drizzle-kit migrations
pnpm fixtures:record [--model <id>] [--provider typesafe|openrouter|vercel]   # re-record System One fixtures (TYPESAFE_API_KEY, OPENROUTER_API_KEY or AI_GATEWAY_API_KEY)
pnpm smoke [--model <id>] [--provider typesafe|openrouter|vercel]            # live System One smoke test (same keys)
pnpm eval --org <slug> --set <slug> --version <n> --dataset <name> [--snapshot <id>] [--model <id>] [--repeats <k>]
pnpm bandwise run --local spec.json state.json   # local fixture mode of @bandwise/cli
pnpm bandwise run --live spec.json state.json    # live, with TYPESAFE_API_KEY from your shell (ADR-020)
pnpm bandwise report --since 7d                  # sum ~/.bandwise/receipts.jsonl per set
pnpm bandwise <command> --json   # the same CLI customers install from npm; see references/headless-and-agents.md
pnpm kit:export [dir]    # generate and scan the public bandwise-kit tree (default dist-kit/); see docs/runbooks/kit-release.md
```

## Golden rules

1. Tenant isolation everywhere: `org_id` + RLS on every tenant table, all DB access through `withTenant`.
2. System One keys never leave the server. No browser SDK usage.
3. `packages/core` is pure. No I/O.
4. Contracts in `packages/core/src/contracts` change only through an ADR.
5. Published versions are immutable. Pin a versioned model ID before a set enters controlled rollout.
6. Every mutation writes an audit row. Every run returns the standard `RunResult` envelope with cost and savings.
7. No live System One calls in unit tests.
8. Headless parity: every console capability is an operation that `/api/v1`, the CLI and the MCP server also expose.
9. Model facts (limits, question types, prices) are data from the model registry. Code identifiers say `systemOne`, not `jev`.
10. Agents propose, humans approve: high-risk agent operations wait for a human approval; moves toward safety are never gated.

## Env vars

`TYPESAFE_API_KEY`, `OPENROUTER_API_KEY` (platform key for the OpenRouter route, ADR-011, and `--provider openrouter` smoke and fixtures), `AI_GATEWAY_API_KEY` (platform key for the Vercel AI Gateway route, ADR-013, and `--provider vercel` smoke and fixtures), `DATABASE_URL`, `AUTH_SECRET`, `BANDWISE_KEK`, `BANDWISE_JWT_SIGNING_KEY` (ES256 key for browser tokens), `SYSTEM_ONE_TRANSPORT` (`sdk` or `fixture`), `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `REDIS_URL`, `ANTHROPIC_API_KEY`. Never commit `.env*` files with values.

System One base URLs are constants in core (`SYSTEM_ONE_PROVIDER_BASE_URLS`), never env, so no env var can send an org key to another host. The provider is picked per org and per set, not per deployment.

Customer tools (`bandwise` CLI, MCP server) read `BANDWISE_TOKEN` and `BANDWISE_BASE_URL` or a named profile; they never hold a TypeSafe, OpenRouter or AI Gateway key. One exception (ADR-020): the CLI's local live mode (`bandwise run --live`, `bandwise hook`) reads the developer's own key from their environment, in one module, and never stores, prints or forwards it.

## Writing rules for every doc, UI string, commit, and PR

- No em dashes to separate thoughts. Use a period or a comma.
- No emojis.
- Skip AI filler: leverage, utilize, delve, seamless, robust, comprehensive, cutting-edge, streamline, empower, unlock, furthermore, moreover.
- Plain words, short sentences mixed with longer ones, concrete examples.
