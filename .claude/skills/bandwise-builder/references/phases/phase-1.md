# Phase 1: Core engine and tenant-aware data layer

**Owners:** Core Engine, Platform / Tenancy (schema), QA, Integrations (local CLI). **Needs:** Phase 0 contracts.

## Core Engine
- [x] Spec compiler: each `QuestionSetSpec` stage to a System One payload through the `QuestionTypeModule` modules (`noul`, `choice`, `score`) in `packages/core/src/question-types` ([spec-schema.md](../spec-schema.md), section 9)
- [x] Stage orchestrator: checks, `when` conditions, `stateFrom` merges (`answers.<qid> = { value, band }`), batch split when a stage exceeds the profile limits
- [x] Confidence router per the normative table in [confidence-policy.md](../confidence-policy.md): per-option overrides, noul bands, relevance (`relevantWhen`), composites (level and band), routes, run band, and the conservative order `review > fallback > escalate_to_llm > auto`
- [x] Cost and savings math per [savings-model.md](../savings-model.md) (all three kinds)
- [x] Token preflight from the `ModelProfile` limits (80 percent warning), never from constants ([system-one-models.md](../system-one-models.md))
- [x] Lints with stable rule ids from [architecture.md](../architecture.md), including the model lints and the model weakness lints
- [x] `interfaceOf` and `diffInterface` ([spec-schema.md](../spec-schema.md), section 11)
- [x] `authz.ts` role matrix
- [x] `system-one-client`: `SdkTransport`, `FixtureTransport`, error mapping per [system-one-api-contract.md](../system-one-api-contract.md), per-surface timeouts and retry budgets, explicit `logLevel` and a scrubbing logger, request id capture, per-org client cache, model list and alias probe helpers (these replace the old drift helper). `FixtureTransport` also ships as its own subpath export that never imports `@typesafe-ai/sdk`, so `bandwise run --local` can use it
- [x] OpenRouter route in `system-one-client` (ADR-011; build behind the provider setting, default `typesafe`, until the ADR is accepted): the same `SdkTransport` with `baseURL` from `SYSTEM_ONE_PROVIDER_BASE_URLS[opts.provider]`, one client per provider and key fingerprint, the OpenRouter status mapping (402, 413, 502, 503, 524, 529) from [system-one-api-contract.md](../system-one-api-contract.md#routes), and `requestId` from the response `id` when no `x-typesafe-request-id` header comes back
- [x] Model id mapping through route rows: send `resolveRoute(...).providerModelId`, map the response `model` back with `registryIdForResolved`, warn `model_resolved_unmapped` when no route knows it
- [x] Vercel AI Gateway route, ADR-013 "Now" rollout: `vercel` in `SystemOneProvider`, base URL `https://ai-gateway.vercel.sh/typesafe`, `toVercelModelId`, the seed route row `jev-latest` as `typesafe-ai/jev` (not pinned, no versioned row), `provider_metadata.gateway.cost` as the provider-reported cost (`responseCostMicroUsd`), and the evaluation fallback guard: no `providerOptions` is sent, and the `x-ai-gateway-evaluation-fallback-triggered` header or a Choice or Score answer with `confidence: 0` and empty `probabilities` fails as `system_one_invalid_response` on the SDK and fixture transports. Doc-derived fixtures in `packages/system-one-client/fixtures/vercel/`, `AI_GATEWAY_API_KEY` for platform key mode, `--provider vercel` on `pnpm smoke` and `pnpm fixtures:record`, and registry sync through `GET /typesafe/v1/models`
- [x] Preflight from the effective limits (`ModelCatalog.effective(name, provider).limits`): jev-1.13.0 on OpenRouter blocks a request over 32,000 tokens that TypeSafe direct would accept
- [x] Call cost from `usage.cost` when present (`reportedCostMicroUsd`, stored as `RunCall.providerCostUsd`), else the price book ([savings-model.md](../savings-model.md))
- [x] Fail closed on outages (ADR-012 Amendment 1): `DEFAULT_ON_UNAVAILABLE` is `review`; the warning lint `outage.fallback_silent` names every gating decision when `onUnavailable` is explicitly `fallback`, since an outage runs no fallback config; `instructions.too_short` says the question id never reaches the model; `AlertKind` gains `escalation_over_budget` for the Phase 3 budget job (ADR-015)
- [x] `llm-client`: `LlmTransport` over `@anthropic-ai/sdk` (`AnthropicLlmTransport`: explicit key, base URL and log level, so no env var or profile steers it), an optional OpenRouter chat route (`OpenRouterLlmTransport`, including `typesafe/jev-router`) that stays off until the config enables it (ADR-011, proposed), `RoutedLlmTransport` and `createLlmTransport` to pick the route by model id, and `FixtureLlmTransport` as its own subpath `@bandwise/llm-client/fixture` that never imports the SDK. Hand-authored LLM fixtures in `packages/llm-client/fixtures/`

## Integrations
- [x] `packages/cli` local mode: `pnpm bandwise run --local spec.json state.json` (fixture transport only; no network, no key). The code lives in `packages/cli/src/local/**`, the only CLI folder that may import `core` and the fixture subpath export of `system-one-client`. It never imports the SDK transport ([architecture.md](../architecture.md#packages-and-boundaries)). Demo spec: the skill's `templates/question-set.example.json`. The seeded question templates in [definition-studio.md](../definition-studio.md) are a different thing and arrive in Phases 3 and 5.

## Platform / Tenancy
- [x] Full Drizzle schema with every table in [data-model.md](../data-model.md), with `org_id` and RLS on every tenant table (migration 0001), including the platform tables `system_one_models` (seeded from `packages/core/src/models/catalog.ts`), `system_one_model_routes` (seeded from `SEED_MODEL_ROUTES`) and `model_alias_observations` (with `provider`). The keys table ships as `org_system_one_keys` with a `provider` column, so no rename migration is ever needed
- [x] `withTenant(ctx, fn)` with transaction-local `set_config`
- [x] RLS setting test: every policy and `withTenant` use `app.org_id`
- [x] Repositories for every table; no raw `db` export
- [x] Immutability trigger on published versions
- [x] Two-org seed
- [x] Dev implementations: local KEK vault, in-memory limiter and quota

## QA
- [x] Recorded fixtures (see [testing.md](../testing.md) minimum set), including a response whose `model` differs from the requested alias. Recorded live on `jev-1.13.0` on 2026-09-30 (D0, NSI-730). `noul-near-half` stays hand-authored (`"source": "hand-authored"`), and `pnpm fixtures:record` skips hand-authored fixtures.
- [ ] OpenRouter fixtures, recorded with `pnpm fixtures:record --provider openrouter` (needs `OPENROUTER_API_KEY`): a noul, choice and score response with `id`, `provider` and `usage.cost`, one through `~typesafe/jev-latest`, and a 402 error. Hand-authored stand-ins from the documented shapes are committed in `packages/system-one-client/fixtures/` (no key was available); re-record them once a key is available.
- [ ] Vercel AI Gateway fixtures, recorded with `pnpm fixtures:record --provider vercel` (needs `AI_GATEWAY_API_KEY`): noul, choice and score with `provider_metadata.gateway.cost`. The committed ones are doc-derived (`"source": "doc-derived"`) from Vercel's documented example. `evaluation-fallback` stays hand-made and is never re-recorded. A live call should also confirm whether Vercel accepts a versioned id, which would allow a pinned Vercel route
- [x] Fixture contract test against zod; each fixture records TypeSafe's `openapi.json` version
- [x] Pinned-classification table test (registry `kind` only), on the `typesafe` and `openrouter` routes: `apps/console/src/jobs/registry/pinned-classification.test.ts`
- [x] `packages/evals` CLI: `pnpm eval --org <slug> --set <slug> --version <n> --dataset <name> [--snapshot <id>] [--model <id>] [--repeats <k>]`. Offline by default on the fixture transport and a folder store (`packages/evals/data`, demo org `demo`, set `ticket-routing`, dataset `tickets`); `--transport sdk` runs live with the provider key. The Postgres eval store lands with the `eval.run` job in Phase 3
- [x] Cross-tenant suite generator
- [x] Live smoke script across the models in the smoke list per [testing.md](../testing.md), with `--provider openrouter` when `OPENROUTER_API_KEY` is set (`packages/evals/src/live`). Without the key it prints why it skipped and exits 0. It passed against a live TypeSafe key on 2026-09-30 (36 checks)

## Platform / Tenancy: registry jobs

- [x] Registry sync, alias observation, alias probe and contract watch as plain async functions in `apps/console/src/jobs/registry` (ADR-005: the Inngest wrapper and the Postgres adapter for their ports land with the runner in Phase 2). Tested against recorded HTTP in `__fixtures__/http`, with no network. The TypeSafe `GET /v1/models` and probe recordings are stand-ins until a key is available; the OpenRouter Models API recording is live
- [x] Contract snapshots for `llms.txt` and `models.md` next to `openapi.json` in `packages/system-one-client/contract` (recorded 2026-09-27)

## Docs site
- [x] Docs site skeleton in `apps/docs` (NSI-713): Fumadocs with built-in search; Introduction; Quickstart for `pnpm bandwise run --local` with a spec the content tests validate; concept pages for question sets and versions, question types, confidence bands and actions, rollout stages and pinned models, the outage rule, cost and savings, and providers; an API reference generated from `packages/core/openapi.json` and marked "Available from Phase 3"; CLI reference and Agents and MCP stubs; `llms.txt` and `llms-full.txt` ([team-playbook.md](../team-playbook.md#docs-site))

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
- `pnpm bandwise run --local` runs the demo spec with no network access and no `TYPESAFE_API_KEY` set.
- The boundary lint rejects a deliberate import of the SDK transport from `packages/cli/src/local/**`.
