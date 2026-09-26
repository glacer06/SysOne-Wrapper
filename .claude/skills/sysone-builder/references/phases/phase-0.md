# Phase 0: Skill and scaffold

**Owner:** Architect / Lead (Docs supports). **Blocks:** everything.

## Part one: skill and plan (this PR)
- [x] `.claude/skills/sysone-builder/SKILL.md` and all references
- [x] Root `CLAUDE.md` and `README.md`
- [x] `docs/PLAN.md` and `docs/adr/001-stack.md`
- [x] Templates: example question set, ADR, plugin

## Part two: scaffold and contracts
- [ ] pnpm workspace + turborepo with empty packages from `architecture.md`
- [ ] `packages/config`: tsconfig (strict), eslint with `eslint-plugin-boundaries` rules, vitest preset
- [ ] `packages/core/src/contracts`: `QuestionSetSpec`, `ConfidencePolicy`, `RunRequest`, `RunResult`, `TenantContext`, ports, store interfaces, error envelope (zod)
- [ ] OpenAPI generated from zod, committed as `packages/core/openapi.json`
- [ ] `apps/console` placeholder page and `src/env.ts`
- [ ] `.env.example` with `TYPESAFE_API_KEY`, `DATABASE_URL`, `AUTH_SECRET`, `SYSONE_KEK`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `REDIS_URL`, `ANTHROPIC_API_KEY`
- [ ] GitHub Actions CI: `pnpm i`, `pnpm turbo lint typecheck test build`
- [ ] PR template with contract, tenancy, and security impact sections
- [ ] ADRs 002 to 006: auth library, key vault, cache, jobs runner, billing model

## Exit gate
- `pnpm i && pnpm turbo lint typecheck test build` passes on the scaffold.
- Boundary lint catches a deliberate bad import in a test fixture.
- A fresh agent asked to "add a question set feature" loads this skill and names the right files.
