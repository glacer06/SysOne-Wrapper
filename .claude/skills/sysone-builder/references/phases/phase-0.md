# Phase 0: Skill and scaffold

**Owner:** Architect / Lead (Docs supports). **Blocks:** everything.

## Part one: skill and plan (this PR)
- [x] `.claude/skills/sysone-builder/SKILL.md` and all references
- [x] Root `CLAUDE.md` and `README.md`
- [x] `docs/PLAN.md` and `docs/adr/001-stack.md`
- [x] ADRs 007 to 010 drafted with status proposed
- [x] Templates: example question set, ADR, plugin

## Part two: scaffold and contracts
- [ ] pnpm workspace + turborepo with empty packages from [architecture.md](../architecture.md)
- [ ] `packages/config`: tsconfig (strict), eslint with `eslint-plugin-boundaries` rules, vitest preset
- [ ] `packages/core/src/contracts`: `QuestionSetSpec` (no rollout, strict), `ConfidencePolicy` (discriminated union), `RunRequest`, `RunResult`, `TenantContext` with the agent actor, `OperationDef`, error envelope v2, `ModelProfile`, `QuestionTypeModule`, `Condition`, `Check`, `FallbackConfig`, `SetInterface`, `DeployTarget`, `Opportunity`, `FeedbackReport`, `QualityTarget`, `SetHealth`, `ThresholdProposal`, `EventEnvelope`, ports (`SystemOneTransport`, `ModelCatalog`, `LlmTransport` and the rest), store interfaces (zod). Neutral names per ADR-008.
- [ ] Operation registry skeleton in `apps/console/src/server/operations`: `OperationDef`, a `runOperation` stub, and zod input and output schemas for every operation in [management-api.md](../management-api.md) (handlers stubbed)
- [ ] OpenAPI generated from zod and the operation registry, committed as `packages/core/openapi.json`
- [ ] Seed `ModelProfile` data for `jev-1.13.0`, `jev-latest` and `jev-preview` in `packages/core/src/models/catalog.ts` ([system-one-models.md](../system-one-models.md))
- [ ] `apps/console` placeholder page and `src/env.ts`
- [ ] `.env.example` with `TYPESAFE_API_KEY`, `DATABASE_URL`, `AUTH_SECRET`, `SYSONE_KEK`, `SYSONE_JWT_SIGNING_KEY`, `SYSTEM_ONE_TRANSPORT`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `REDIS_URL`, `ANTHROPIC_API_KEY`
- [ ] GitHub Actions CI: `pnpm i`, `pnpm turbo lint typecheck test build`
- [ ] PR template with contract, tenancy, and security impact sections
- [ ] ADRs 002 to 010: auth library, key vault, cache, jobs runner, billing model, headless parity, System One model registry and neutral naming, app integration and deploy targets, rollout on pointers and the effectiveness loop. ADRs 007 to 010 are reviewed and accepted here, before the contracts freeze; the ADR-009 Python and Standalone sections stay proposed.

Contract detail lives in [spec-schema.md](../spec-schema.md), [architecture.md](../architecture.md), [confidence-policy.md](../confidence-policy.md), [savings-model.md](../savings-model.md), [management-api.md](../management-api.md), [system-one-models.md](../system-one-models.md), [deploy-and-codegen.md](../deploy-and-codegen.md), [effectiveness-loop.md](../effectiveness-loop.md) and [events.md](../events.md).

## Exit gate
- `pnpm i && pnpm turbo lint typecheck test build` passes on the scaffold.
- Boundary lint catches a deliberate bad import in a test fixture.
- `openapi.json` contains a path for every management operation, and the parity test skeleton runs.
- A fresh agent asked to "add a question set feature" loads this skill and names the right files.
- A fresh agent asked to "let an agent publish a set" or "add a new System One model" loads this skill and names the right files.
