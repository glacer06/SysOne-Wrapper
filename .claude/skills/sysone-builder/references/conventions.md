# Conventions

## TypeScript

- `strict: true`, `noUncheckedIndexedAccess: true`, ESM everywhere.
- No `any`. Use `unknown` and narrow with zod.
- zod at every boundary: HTTP input, DB JSON columns, Jev responses, env, plugin config.
- Types come from zod (`z.infer`), not the other way around.
- Node 20+ (the TypeSafe SDK requires it).

## Naming

- DB: `snake_case` tables and columns. TS: `camelCase`. Drizzle maps between them.
- Question IDs: `^[a-z][a-z0-9_]{0,63}$`.
- Token prefixes: `sk_live_`, `sk_test_`, `pk_live_`. Jev keys are never shown beyond `key_last4`.
- Audit actions: `noun.verb`, for example `set.publish`, `key.rotate`, `member.role_change`.
- Files: one exported concept per file in `core`. Tests next to source as `*.test.ts`.

## Next.js

- Server Actions for console mutations. Route handlers for `/api/v1`, webhooks, and jobs.
- Every server action and route: resolve `TenantContext`, call `can()`, run inside `withTenant`, write audit.
- UI: shadcn/ui + Tailwind, TanStack Table for data grids. Charts follow the repo's chart palette.

## Env

- All env access goes through `apps/console/src/env.ts` (t3-env) and is marked `server-only`.
- `.env.example` lists every variable. Never commit `.env*` files with values.
- Core never reads env.

## Errors

- One error envelope: `{ error: { code, message, requestId } }`. Codes are listed in `api.md`.
- Map third-party errors at the edge (`jev-client`, `billing`). Never leak raw provider messages that might carry payloads.

## Logging

- Structured JSON logs with `requestId`, `orgId`, `setId`, `runId`.
- Never log state, keys, or tokens. The log scrubber test enforces it.

## Money and time

- Money is integer micro-USD. Format only at display.
- Timestamps are `timestamptz`, UTC. IDs are uuidv7 for time-ordered tables.

## Git

- Conventional commits: `feat(core): ...`, `fix(db): ...`, `docs(skill): ...`.
- One branch (and worktree) per agent per task. Changesets for publishable packages.
- PR template has a **Contract impact** section. Anything other than "none" needs an ADR link.

## Writing (docs, UI copy, PR text)

Nick's voice rules apply to every piece of prose in this repo:

- No em dashes to separate thoughts. Use a period or a comma.
- No emojis.
- Skip AI filler: leverage, utilize, delve, seamless, robust, comprehensive, cutting-edge, furthermore, moreover.
- Short, direct sentences mixed with longer ones. Plain words. Concrete examples.
