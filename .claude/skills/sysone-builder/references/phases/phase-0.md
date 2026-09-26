# Phase 0: Skill and scaffold

**Owner:** Architect / Lead (Docs supports). **Blocks:** everything.

## Part one: skill and plan (this PR)
- [x] `.claude/skills/sysone-builder/SKILL.md` and all references
- [x] Root `CLAUDE.md` and `README.md`
- [x] `docs/PLAN.md` and `docs/adr/001-stack.md`
- [x] ADRs 007 to 010 drafted with status proposed
- [x] Templates: example question set, ADR, plugin

## Part two: scaffold and contracts
- [x] pnpm workspace + turborepo with empty packages from [architecture.md](../architecture.md)
- [x] `packages/config`: tsconfig (strict), eslint with `eslint-plugin-boundaries` rules, vitest preset
- [x] `packages/core/src/contracts`: every contract below as zod, with neutral names per ADR-008. Ports and store interfaces are TypeScript interfaces whose payloads are these zod types. The link after each group is where the shape is defined:
  - `QuestionSetSpec` (strict, no `rollout`), `TenantContext` (with the agent actor), `Channel`, `RolloutStage`, `PublishCtx`, the ports (`SystemOneTransport`, `ModelCatalog`, `LlmTransport` and the rest) and the store interfaces: [architecture.md](../architecture.md)
  - `ConfidencePolicy` (discriminated union), `BandActions`, `ActionRef`: [confidence-policy.md](../confidence-policy.md)
  - `RunRequest`, `RunDryRunResult`, `SystemOneRequest`, `SystemOneAnswer`, `SystemOneResponse`, `QuestionTypeModule`, `Condition`, `Check`, `FallbackConfig`, `SetInterface`: [spec-schema.md](../spec-schema.md)
  - `RunResult`, `Decision`, `RunCost`: [savings-model.md](../savings-model.md)
  - Error envelope v2, `ErrorDetail` (one item of `error.details`), `GateResult` (one item of `error.gates`), `Manifest` (the body of `GET /sets/{ref}/manifest`): [api.md](../api.md)
  - `OperationDef`, `DryRunResult`: [management-api.md](../management-api.md). `SpecDiff`: [below](#specdiff)
  - `ModelProfile`: [system-one-models.md](../system-one-models.md)
  - `DeployTarget`, `Opportunity`: [deploy-and-codegen.md](../deploy-and-codegen.md)
  - `FeedbackReport`, `QualityTarget`, `SetHealth`, `ThresholdProposal`, `LabelingPolicy`: [effectiveness-loop.md](../effectiveness-loop.md)
  - `EventEnvelope`, `EventType` (the union of the event catalog): [events.md](../events.md)
- [x] Operation registry skeleton in `apps/console/src/server/operations`: `OperationDef`, a `runOperation` stub, and one entry for every operation in the [management-api.md](../management-api.md#catalog) catalog, with handlers stubbed.
  - An entry gets real zod input and output schemas where management-api.md or a reference it links gives the shape, for example `set.run`, `set.publish`, `eval.run`, `draft.validate`, `job.get` and `version.diff` (its output is [`SpecDiff`](#specdiff)). Where only one side is given, the other side uses the placeholder below.
  - Any input with no given shape is `z.object({}).passthrough()`, and any such output is `z.unknown()`. Mark each one `// shape: Phase <n>, owner Platform / Tenancy`, with `<n>` from the Phase column of its catalog row. This keeps every path in `openapi.json` while the shape is still open.
  - List operations take `limit` and `cursor` and return `{ data, nextCursor }` per the route conventions, even while their items are `z.unknown()`.
- [x] OpenAPI generated from zod and the operation registry, committed as `packages/core/openapi.json`
- [x] Seed `ModelProfile` data for `jev-1.13.0`, `jev-latest` and `jev-preview` in `packages/core/src/models/catalog.ts` ([system-one-models.md](../system-one-models.md))
- [x] `apps/console` placeholder page and `src/env.ts`
- [x] `.env.example` with `TYPESAFE_API_KEY`, `DATABASE_URL`, `AUTH_SECRET`, `SYSONE_KEK`, `SYSONE_JWT_SIGNING_KEY`, `SYSTEM_ONE_TRANSPORT`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `REDIS_URL`, `ANTHROPIC_API_KEY` (ADR-011 adds `OPENROUTER_API_KEY`)
- [x] GitHub Actions CI: `pnpm i`, `pnpm turbo lint typecheck test build`
- [x] PR template with contract, tenancy, and security impact sections
- [x] ADRs 002 to 010: auth library, key vault, cache, jobs runner, billing model, headless parity, System One model registry and neutral naming, app integration and deploy targets, rollout on pointers and the effectiveness loop. ADRs 007 to 010 are reviewed and accepted here, before the contracts freeze; the ADR-009 Python and Standalone sections stay proposed. Done 2026-09-26: Nick accepted ADRs 002 to 010 (ADR-002 picks Better Auth). ADR-011 (OpenRouter route) was added after the freeze and stays proposed; its contract additions are optional or provider-typed so the rest of the contracts did not move.

## SpecDiff

No reference defines `SpecDiff` yet, so its shape is fixed here. It is the output of `version.diff` and the `diff` field of `DryRunResult`.

```ts
SpecDiff = {
  from: string,                   // each side as resolved: "slug@7" or "slug@draft"
  to: string,
  changes: Array<{                // sorted by path
    path: string,                 // JSON Pointer into the spec
    op: "add" | "remove" | "replace",
    before?: unknown,             // absent for "add"
    after?: unknown,              // absent for "remove"
  }>,
  interface: { breaking: string[], additive: string[] },   // diffInterface(from, to), spec-schema.md section 11
}
```

## Exit gate
- `pnpm i && pnpm turbo lint typecheck test build` passes on the scaffold.
- Boundary lint catches a deliberate bad import in a test fixture.
- `openapi.json` contains a path for every management operation, and the parity test skeleton runs.
- `templates/question-set.example.json` parses with the strict `QuestionSetSpec` schema. Linting it with zero errors against the `jev-1.13.0` seed profile is a Phase 1 exit check, because lints land in Phase 1.
- The same spec plus a `rollout` key fails with rule `spec.unknown_key` at path `/rollout`.
- Every row in `packages/core/src/models/catalog.ts` parses as `ModelProfile`.
- A sample `RunResult` round-trips through its zod schema: parse, serialize and parse again give an equal value. Phase 0 uses a hand-written sample; Phase 1 adds recorded ones.
- ADRs 007 to 010 have status accepted. Only the ADR-009 Python and Standalone sections stay proposed.
- A fresh agent asked to "add a question set feature" loads this skill. It passes when it names `spec-schema.md`, `architecture.md` and `phases/phase-3.md`.
- A fresh agent asked to "let an agent publish a set" passes when it names `management-api.md`, `security.md` and `headless-and-agents.md`.
- A fresh agent asked to "add a new System One model" passes when it names `system-one-models.md`.
