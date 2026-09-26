# SysOne Wrapper

Multi-tenant SaaS kit around TypeSafe's **Jev** (System One) model. Orgs build versioned question sets, tune confidence bands, publish them live, call them from any app by ID, and see what every run cost and saved.

**Always load the `sysone-builder` skill** (`.claude/skills/sysone-builder/SKILL.md`) before planning or writing code here. It holds the architecture, contracts, phase checklists, and team playbook. For Jev itself, install the official skill (`claude plugin marketplace add typesafe-ai/skills`, then `claude plugin install typesafe@typesafe-ai`) and read `https://docs.typesafe.ai/llms.txt`.

## Status

Phase 0 part one (skill and plan) is done. The monorepo scaffold and contracts come next. See `docs/PLAN.md` and `.claude/skills/sysone-builder/references/phases/`.

## Commands (available once Phase 0 part two lands)

```
pnpm dev                 # console on localhost
pnpm turbo lint typecheck test build
pnpm db:migrate          # drizzle-kit migrations
pnpm fixtures:record     # re-record Jev fixtures (needs TYPESAFE_API_KEY)
pnpm smoke               # live Jev smoke test (needs TYPESAFE_API_KEY)
pnpm eval --set <slug> --version <n> --dataset <name>
pnpm sysone run spec.json state.json
```

## Golden rules

1. Tenant isolation everywhere: `org_id` + RLS on every tenant table, all DB access through `withTenant`.
2. Jev keys never leave the server. No browser SDK usage.
3. `packages/core` is pure. No I/O.
4. Contracts in `packages/core/src/contracts` change only through an ADR.
5. Published versions are immutable. Pin model IDs once thresholds are tuned.
6. Every mutation writes an audit row. Every run returns the standard `RunResult` envelope with cost and savings.
7. No live Jev calls in unit tests.

## Env vars

`TYPESAFE_API_KEY`, `DATABASE_URL`, `AUTH_SECRET`, `SYSONE_KEK`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `REDIS_URL`, `ANTHROPIC_API_KEY`. Never commit `.env*` files with values.

## Writing rules for every doc, UI string, commit, and PR

- No em dashes to separate thoughts. Use a period or a comma.
- No emojis.
- Skip AI filler: leverage, utilize, delve, seamless, robust, comprehensive, cutting-edge, streamline, furthermore, moreover.
- Plain words, short sentences mixed with longer ones, concrete examples.
