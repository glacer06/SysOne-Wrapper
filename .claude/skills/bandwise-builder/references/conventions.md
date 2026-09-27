# Conventions

## TypeScript

- `strict: true`, `noUncheckedIndexedAccess: true`, ESM everywhere.
- No `any`. Use `unknown` and narrow with zod.
- zod at every boundary: HTTP input, DB JSON columns, System One responses, env, plugin config.
- Types come from zod (`z.infer`), not the other way around.
- Node 22.13+ for the dev toolchain (the root `engines` field): vitest 5 needs ^22.12 and ESLint 10 needs ^22.13 within Node 22. Node 20+ stays the runtime floor for code that only runs the TypeSafe SDK, such as a standalone export in a customer app.

## zod

- System One response schemas use `.passthrough()`, so fields a newer API adds are kept, not dropped.
- Runs store the raw answer JSON.
- An answer whose `type` has no question-type module is stored raw with the warning `unknown_answer_type`. Its decision gets band `low` and effective action `fallback`. It never throws.
- Specs use a strict schema: unknown keys fail, including `rollout` ([spec-schema.md](spec-schema.md)).

## Naming

- DB: `snake_case` tables and columns. TS: `camelCase`. Drizzle maps between them.
- Question IDs: `^[a-z][a-z0-9_]{0,63}$`.
- Token prefixes: `sk_live_`, `sk_test_`, `pk_live_` (app tokens), `sa_live_` (agent tokens). TypeSafe and OpenRouter keys are never shown beyond `key_last4`.
- Audit actions: `noun.verb`, for example `set.publish`, `key.rotate`, `member.role_change`.
- Operation ids use `noun.verb` and are identical to the audit action they write: `set.publish`, `channel.rollback`, `rollout.change` ([management-api.md](management-api.md)).
- Scopes use `noun:verb`: `sets:write`, `release:production`.
- Code, schemas, columns, error codes and env vars say `systemOne` or `system_one`, never `jev`: `SystemOneTransport`, `system_one_cost_micro_usd`, `system_one_unavailable`, `SYSTEM_ONE_TRANSPORT`. UI copy, doc examples and catalog data may say Jev, and model IDs such as `jev-1.13.0` stay as TypeSafe names them.
- Files: one exported concept per file in `core`. Tests next to source as `*.test.ts`.

## Next.js

- Server Actions and `/api/v1` route handlers are thin adapters over the operation registry in `apps/console/src/server/operations`. No capability exists only in the console. Console UI code calls operations, never repositories. Route handlers also serve webhooks and jobs.
- Every operation runs through `runOperation`: resolve `TenantContext`, call `can()`, apply the approval gate, run inside `withTenant`, write audit and events.
- UI: shadcn/ui + Tailwind, TanStack Table for data grids. Charts follow the repo's chart palette.

## HTTP

- Mutating operations accept `Idempotency-Key`; app and agent tokens must send it.
- Drafts use `ETag` (the `spec_hash`) and `If-Match`. A mismatch is `412 precondition_failed`.
- Long-running work returns `202 { jobId }`, polled at `GET /api/v1/jobs/{id}`.
- `?dryRun=true` previews write nothing.
- Details: [management-api.md](management-api.md).

## Env

- All env access goes through `apps/console/src/env.ts` (t3-env) and is marked `server-only`.
- `.env.example` lists every variable. Never commit `.env*` files with values.
- Core never reads env.
- Provider base URLs are constants in core (`SYSTEM_ONE_PROVIDER_BASE_URLS`), never env. `system-one-client` passes `baseURL` on every SDK client, so the SDK's own `TYPESAFE_BASE_URL` fallback can never redirect an org key (ADR-011).

## Errors

- One error envelope: `{ error: { code, message, requestId, retryable, details?, gates?, requiredScope?, currentEtag?, runId? } }`. Codes are listed in [api.md](api.md).
- Lint rule ids are stable strings (for example `model.alias_past_shadow`, `interface.breaking`). Agents and tests match on them, so never rename one; add a new id instead.
- Map third-party errors at the edge (`system-one-client`, `billing`). Never leak raw provider messages that might carry payloads.

## Logging

- Structured JSON logs with `requestId`, `orgId`, `setId`, `runId`.
- Never log state, keys, or tokens. The log scrubber test enforces it.
- Every SDK client sets an explicit `logLevel` (`'warn'`) and a scrubbing logger. `debug` is never allowed in production.

## Money and time

- Money is integer micro-USD. Format only at display.
- Timestamps are `timestamptz`, UTC. IDs are uuidv7 for time-ordered tables.

## Dependencies

- TypeSafe SDK upgrades (JS and Python) go through a Renovate PR that re-records fixtures and passes `pnpm smoke`.
- The SDKs are pre-1.0. A caret range on a `0.x` version already stays within that minor. Never widen past it without that PR.

## CLI

- Every `bandwise` command supports `--json` and never prompts without a TTY.
- Exit codes: `0` ok, `1` error, `2` diff or drift, `3` approval pending.
- Details: [headless-and-agents.md](headless-and-agents.md).

## Git

- Conventional commits: `feat(core): ...`, `fix(db): ...`, `docs(skill): ...`.
- One branch (and worktree) per agent per task. Changesets for publishable packages.
- PR template has a **Contract impact** section. Anything other than "none" needs an ADR link.

## Writing (docs, UI copy, PR text)

Nick's voice rules apply to every piece of prose in this repo:

- No em dashes to separate thoughts. Use a period or a comma.
- No emojis.
- Skip AI filler: leverage, utilize, delve, seamless, robust, comprehensive, cutting-edge, streamline, empower, unlock, furthermore, moreover.
- Short, direct sentences mixed with longer ones. Plain words. Concrete examples.
