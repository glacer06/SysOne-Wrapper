# Phase 1: Core engine and tenant-aware data layer

**Owners:** Core Engine, Platform / Tenancy (schema), QA, Integrations (local CLI). **Needs:** Phase 0 contracts.

## Core Engine
- [ ] Spec compiler: each `QuestionSetSpec` stage to a System One payload through the `QuestionTypeModule` modules (`noul`, `choice`, `score`) in `packages/core/src/question-types` ([spec-schema.md](../spec-schema.md), section 9)
- [ ] Stage orchestrator: checks, `when` conditions, `stateFrom` merges (`answers.<qid> = { value, band }`), batch split when a stage exceeds the profile limits
- [ ] Confidence router per the normative table in [confidence-policy.md](../confidence-policy.md): per-option overrides, noul bands, relevance (`relevantWhen`), composites (level and band), routes, run band, and the conservative order `review > fallback > escalate_to_llm > auto`
- [ ] Cost and savings math per [savings-model.md](../savings-model.md) (all three kinds)
- [ ] Token preflight from the `ModelProfile` limits (80 percent warning), never from constants ([system-one-models.md](../system-one-models.md))
- [ ] Lints with stable rule ids from [architecture.md](../architecture.md), including the model lints and the model weakness lints
- [ ] `interfaceOf` and `diffInterface` ([spec-schema.md](../spec-schema.md), section 11)
- [ ] `authz.ts` role matrix
- [ ] `system-one-client`: `SdkTransport`, `FixtureTransport`, error mapping per [system-one-api-contract.md](../system-one-api-contract.md), per-surface timeouts and retry budgets, explicit `logLevel` and a scrubbing logger, request id capture, per-org client cache, model list and alias probe helpers (these replace the old drift helper)
- [ ] `llm-client`: `LlmTransport` port and a fixture transport

## Integrations
- [ ] `packages/cli` local mode: `pnpm sysone run --local spec.json state.json` (fixture by default, live with a key). Demo spec: `templates/question-set.example.json` (templates are seeded in Phases 3 and 5).

## Platform / Tenancy
- [ ] Full Drizzle schema with every table in [data-model.md](../data-model.md), with `org_id` and RLS on every tenant table (migration 0001), including the platform tables `system_one_models` (seeded from `packages/core/src/models/catalog.ts`) and `model_alias_observations`
- [ ] `withTenant(ctx, fn)` with transaction-local `set_config`
- [ ] RLS setting test: every policy and `withTenant` use `app.org_id`
- [ ] Repositories for every table; no raw `db` export
- [ ] Immutability trigger on published versions
- [ ] Two-org seed
- [ ] Dev implementations: local KEK vault, in-memory limiter and quota

## QA
- [ ] Recorded fixtures (see [testing.md](../testing.md) minimum set), including a response whose `model` differs from the requested alias
- [ ] Fixture contract test against zod; each fixture records TypeSafe's `openapi.json` version
- [ ] Pinned-classification table test (registry `kind` only)
- [ ] `packages/evals` CLI: `pnpm eval --org <slug> --set <slug> --version <n> --dataset <name> [--model <id>] [--repeats <k>]`
- [ ] Cross-tenant suite generator
- [ ] Live smoke script across the models in the smoke list per [testing.md](../testing.md)

## Exit gate
- A spec runs end to end against fixtures and returns a valid `RunResult` with bands, actions, cost, and savings.
- Router and compiler at 100% branch coverage.
- Usage events written for every run, each with the resolved model.
- Cross-tenant suite passes, including with the repo filter bypassed.
- `pnpm smoke` passes when `TYPESAFE_API_KEY` is set.
- Preflight limits come from the profile: a fake 16k profile blocks a 20k state.
- An unknown answer type is stored raw and never throws.
