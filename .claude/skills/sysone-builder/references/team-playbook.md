# Team playbook

This is how a team of Claude agents (and humans) builds SysOne in parallel without stepping on each other.

## Roles and ownership

| Role | Owns | Active from |
|---|---|---|
| **Architect / Lead** | This skill, `packages/core/src/contracts`, `openapi.json`, ADRs, boundary lint rules, merge order. Reviews every PR that crosses packages. | Phase 0 |
| **Core Engine** | `packages/core` (compiler, stages, router, composites, lints, cost + savings, preflight), `packages/jev-client` | Phase 1 |
| **Platform / Tenancy** | `packages/db` (schema, RLS, `withTenant`, repos), `packages/tenancy` (auth wiring, vault, tokens, rate limits), `/api/v1` routes, audit, cache | Phase 1 (schema), Phase 2 |
| **Billing / Savings** | `packages/billing` (plans, entitlements, Stripe, meter outbox, webhooks), savings rollups, reports, price book | Phase 2 |
| **Console UI** | `apps/console` UI: org switcher, editor, policy editor, playground, runs, review queue, evals, Definition Studio, dashboards, settings, platform admin UI | Phase 2 (shell), Phase 3 |
| **Embed Kit** | `packages/client`, `packages/react`, `apps/example-embed` | Phase 4 (can start against mocks in Phase 3) |
| **QA / Evals** | `packages/evals`, fixtures, cross-tenant suite, Playwright, k6, CI gates, live smoke job | Phase 0 onward |
| **Extensions** | `packages/plugin-sdk`, `plugins-builtin`, `apps/extension-chrome`, `packages/mcp-server`, `plugins/claude-code` | Phase 5 onward |
| **Security reviewer** (part-time) | Threat model; reviews every change to keys, authz, tokens, webhooks, embed, extension | Phase 2 onward |
| **Docs** | Skill references, API docs, embed quickstart, DPA and subprocessor notes | Continuous |

If a file isn't in your lane, don't edit it. Open a handoff (below).

## Contracts that make parallel work possible

1. **zod schemas** in `packages/core/src/contracts`: `QuestionSetSpec`, `ConfidencePolicy`, `RunRequest`, `RunResult`, `TenantContext`, error envelope.
2. **Ports**: `JevTransport`, `KeyResolver`, `RateLimiter`, `QuotaGuard`, `RunSink`, `ActionRegistry`, `PriceBook`. Each has an in-memory or fixture implementation so nobody waits on anybody.
3. **Store interfaces**: `VersionStore`, `RunStore`, `ReviewStore`, `AuditStore`.
4. **`openapi.json`** generated from zod, plus MSW handlers generated from it.
5. **Plugin interfaces**: `InputAdapter`, `QuestionTemplate`, `ActionHandler`.

Changing any of these needs an ADR (`templates/adr.md`) approved by the Architect, plus updated fixtures and mocks in the same PR.

## Order of work

```
Phase 0  Architect alone: skill, CLAUDE.md, plan docs, then scaffold + contracts
   |
Phase 1  Core Engine  ||  Platform (schema + RLS)  ||  QA (fixtures, cross-tenant harness)
   |
Phase 2  Platform (auth, keys, tokens, limits)  ||  Billing (Stripe, outbox)  ||  Console shell
   |
Phase 3  Console UI  ||  Platform (/api/v1)  ||  Billing (reports)  ||  Embed Kit on mocks
   |
Phase 4  Embed Kit (real API)  ||  QA (bundle scan, E2E)
   |
Phase 5  Extensions (plugins, templates)
   |
Phase 6  Chrome extension   ||   Phase 7  MCP + Claude Code plugin
```

## Working rules

- **One worktree and branch per agent per task.** Name: `<role>/<phase>-<short-task>`, for example `core/p1-router`.
- **Small PRs.** One checklist item or a tight group per PR.
- **Tests first** against fixtures or in-memory stores.
- **Run the gate before pushing:** `pnpm turbo lint typecheck test`.
- **Update the phase checklist** in the same PR that completes an item.
- **Don't guess Jev behavior.** Read the live docs or run `pnpm smoke`. Record new fixtures when behavior matters.

## Handoff protocol

When you need a change in someone else's lane, open an issue or PR comment with:

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
- **Long sessions** (optional, unverified): The Code (2026-09-26) describes `tamaratran/fast-jev-compaction`, a plugin that uses Jev to prune stale tool calls on `/compact`. It reportedly needs `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1` and Claude Code 2.1.274+. Try it on long agent sessions if you want; don't make the team depend on it.
- **Connectors**: Stripe, Linear, and Sentry MCP servers need authorization in claude.ai before an agent can use them.
