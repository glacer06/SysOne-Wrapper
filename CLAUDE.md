# SysOne Wrapper

Multi-tenant SaaS kit around TypeSafe's **System One** models (Jev is the first and the default). Orgs set up apps, build versioned question sets, tune confidence bands, publish them live, call them from any app by ID or through generated typed code, and see what every run cost and saved. It is headless first: the console, the `sysone` CLI, the MCP server and agents share one management API.

**Always load the `sysone-builder` skill** (`.claude/skills/sysone-builder/SKILL.md`) before planning or writing code here. It holds the architecture, contracts, phase checklists, and team playbook. For Jev and other System One models themselves, install the official skill (`claude plugin marketplace add typesafe-ai/skills`, then `claude plugin install typesafe@typesafe-ai`) and read `https://docs.typesafe.ai/llms.txt`.

## Status

Phase 0 is done. Part two (monorepo scaffold, zod contracts, operation registry, `openapi.json`) is built and the gate is green. Nick accepted ADRs 002 to 010 on 2026-09-26 (Better Auth, key vault, cache, jobs runner, billing, headless parity, model registry, app integration, rollout pointers), and the contracts in `packages/core/src/contracts` are frozen. The ADR-009 Python and Standalone sections stay proposed. ADR-011 (OpenRouter as a second route to System One models) is proposed. Nick accepted ADR-012 (outage rule and liveness) on 2026-09-27 and the contracts carry `onUnavailable`. Phase 1 code is merged and the gate is green; the exit gate waits only on real fixtures and the live smoke test, which need a `TYPESAFE_API_KEY` or `OPENROUTER_API_KEY`. Phase 2 starts when Nick says so. See `docs/PLAN.md` and `.claude/skills/sysone-builder/references/phases/`.

## Commands

```
pnpm dev                 # console on localhost
pnpm turbo lint typecheck test build
pnpm db:migrate          # drizzle-kit migrations
pnpm fixtures:record [--model <id>] [--provider typesafe|openrouter]   # re-record System One fixtures (TYPESAFE_API_KEY or OPENROUTER_API_KEY)
pnpm smoke [--model <id>] [--provider typesafe|openrouter]            # live System One smoke test (same keys)
pnpm eval --org <slug> --set <slug> --version <n> --dataset <name> [--snapshot <id>] [--model <id>] [--repeats <k>]
pnpm sysone run --local spec.json state.json   # local fixture mode of @sysone/cli
pnpm sysone <command> --json   # the same CLI customers install from npm; see references/headless-and-agents.md
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

`TYPESAFE_API_KEY`, `OPENROUTER_API_KEY` (platform key for the OpenRouter route, ADR-011, and `--provider openrouter` smoke and fixtures), `DATABASE_URL`, `AUTH_SECRET`, `SYSONE_KEK`, `SYSONE_JWT_SIGNING_KEY` (ES256 key for browser tokens), `SYSTEM_ONE_TRANSPORT` (`sdk` or `fixture`), `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `REDIS_URL`, `ANTHROPIC_API_KEY`. Never commit `.env*` files with values.

System One base URLs are constants in core (`SYSTEM_ONE_PROVIDER_BASE_URLS`), never env, so no env var can send an org key to another host. The provider is picked per org and per set, not per deployment.

Customer tools (`sysone` CLI, MCP server) read `SYSONE_TOKEN` and `SYSONE_BASE_URL` or a named profile; they never hold a TypeSafe or OpenRouter key.

## Writing rules for every doc, UI string, commit, and PR

- No em dashes to separate thoughts. Use a period or a comma.
- No emojis.
- Skip AI filler: leverage, utilize, delve, seamless, robust, comprehensive, cutting-edge, streamline, empower, unlock, furthermore, moreover.
- Plain words, short sentences mixed with longer ones, concrete examples.
