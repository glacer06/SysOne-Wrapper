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
- [ ] `system-one-client`: `SdkTransport`, `FixtureTransport`, error mapping per [system-one-api-contract.md](../system-one-api-contract.md), per-surface timeouts and retry budgets, explicit `logLevel` and a scrubbing logger, request id capture, per-org client cache, model list and alias probe helpers (these replace the old drift helper). `FixtureTransport` also ships as its own subpath export that never imports `@typesafe-ai/sdk`, so `sysone run --local` can use it
- [ ] OpenRouter route in `system-one-client` (ADR-011; build behind the provider setting, default `typesafe`, until the ADR is accepted): the same `SdkTransport` with `baseURL` from `SYSTEM_ONE_PROVIDER_BASE_URLS[opts.provider]`, one client per provider and key fingerprint, the OpenRouter status mapping (402, 413, 502, 503, 524, 529) from [system-one-api-contract.md](../system-one-api-contract.md#routes), and `requestId` from the response `id` when no `x-typesafe-request-id` header comes back
- [ ] Model id mapping through route rows: send `resolveRoute(...).providerModelId`, map the response `model` back with `registryIdForResolved`, warn `model_resolved_unmapped` when no route knows it
- [ ] Preflight from the effective limits (`ModelCatalog.effective(name, provider).limits`): jev-1.13.0 on OpenRouter blocks a request over 32,000 tokens that TypeSafe direct would accept
- [ ] Call cost from `usage.cost` when present (`reportedCostMicroUsd`, stored as `RunCall.providerCostUsd`), else the price book ([savings-model.md](../savings-model.md))
- [ ] `llm-client`: `LlmTransport` port and a fixture transport

## Integrations
- [ ] `packages/cli` local mode: `pnpm sysone run --local spec.json state.json` (fixture transport only; no network, no key). The code lives in `packages/cli/src/local/**`, the only CLI folder that may import `core` and the fixture subpath export of `system-one-client`. It never imports the SDK transport ([architecture.md](../architecture.md#packages-and-boundaries)). Demo spec: the skill's `templates/question-set.example.json`. The seeded question templates in [definition-studio.md](../definition-studio.md) are a different thing and arrive in Phases 3 and 5.

## Platform / Tenancy
- [x] Full Drizzle schema with every table in [data-model.md](../data-model.md), with `org_id` and RLS on every tenant table (migration 0001), including the platform tables `system_one_models` (seeded from `packages/core/src/models/catalog.ts`), `system_one_model_routes` (seeded from `SEED_MODEL_ROUTES`) and `model_alias_observations` (with `provider`). The keys table ships as `org_system_one_keys` with a `provider` column, so no rename migration is ever needed
- [x] `withTenant(ctx, fn)` with transaction-local `set_config`
- [x] RLS setting test: every policy and `withTenant` use `app.org_id`
- [x] Repositories for every table; no raw `db` export
- [x] Immutability trigger on published versions
- [x] Two-org seed
- [x] Dev implementations: local KEK vault, in-memory limiter and quota

## QA
- [ ] Recorded fixtures (see [testing.md](../testing.md) minimum set), including a response whose `model` differs from the requested alias
- [ ] OpenRouter fixtures, recorded with `pnpm fixtures:record --provider openrouter` (needs `OPENROUTER_API_KEY`): a noul, choice and score response with `id`, `provider` and `usage.cost`, one through `~typesafe/jev-latest`, and a 402 error
- [ ] Fixture contract test against zod; each fixture records TypeSafe's `openapi.json` version
- [ ] Pinned-classification table test (registry `kind` only)
- [ ] `packages/evals` CLI: `pnpm eval --org <slug> --set <slug> --version <n> --dataset <name> [--model <id>] [--repeats <k>]`
- [x] Cross-tenant suite generator
- [ ] Live smoke script across the models in the smoke list per [testing.md](../testing.md), with `--provider openrouter` when `OPENROUTER_API_KEY` is set

## Exit gate
- A spec runs end to end against fixtures and returns a valid `RunResult` with bands, actions, cost, and savings.
- Router and compiler at 100% branch coverage.
- Usage events written for every run, each with the resolved model.
- Cross-tenant suite passes, including with the repo filter bypassed.
- `pnpm smoke` passes when `TYPESAFE_API_KEY` is set, and `pnpm smoke --provider openrouter` passes when `OPENROUTER_API_KEY` is set.
- A fixture run on the `openrouter` provider sends `typesafe/jev-1.13`, stores `model_resolved` as the OpenRouter id, prices the call from `usage.cost`, and fails preflight above 32,000 tokens.
- Preflight limits come from the profile: a fake 16k profile blocks a 20k state.
- An unknown answer type is stored raw and never throws.
- `templates/question-set.example.json` lints with zero errors against the `jev-1.13.0` seed profile.
- `pnpm sysone run --local` runs the demo spec with no network access and no `TYPESAFE_API_KEY` set.
- The boundary lint rejects a deliberate import of the SDK transport from `packages/cli/src/local/**`.
