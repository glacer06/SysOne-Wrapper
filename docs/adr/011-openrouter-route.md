# ADR-011: OpenRouter as a second route to System One models

- **Status:** proposed
- **Date:** 2026-09-26
- **Owner:** Architect / Lead, reviewed by the Security reviewer
- **Decider:** Nick
- **Amends:** ADR-008 section 8 (gateways stay out of v1) and the keys table in ADR-003 and data-model.md
- **Contract impact:** additive. New `SystemOneProvider` enum (`typesafe | openrouter`), `SYSTEM_ONE_PROVIDER_BASE_URLS` and the id helpers in `system-one.ts`. New `ModelRoute`, `RouteLimits`, `resolveRoute`, `effectiveLimits` and `registryIdForResolved` in `models.ts`. Optional `id`, `provider` and `usage.cost` on `SystemOneResponse`. Optional `provider` and `providerCostUsd` on `RunCall`, and `reportedCostMicroUsd`. Required `provider` on `ResolvedKey`, `SystemOneCallOptions`, `EffectiveModel`, `RunSinkRecord` and `RunDryRunResult`, required `systemOneProvider` on `RunSettings` and `PublishCtx`, plus `PublishCtx.modelRoutes`. `KeyResolver` and `ModelCatalog.effective` take a provider, and `ModelCatalog` gains `routes(provider)`. `PriceBook.get` takes an optional provider. Optional `provider` on the `model.alias_moved` event data. Tables: `org_typesafe_keys` becomes `org_system_one_keys`, and `system_one_model_routes` is new.

## Context

On 2026-09-25 OpenRouter published a System One endpoint. Verified against OpenRouter's docs and Models API on 2026-09-26:

- `POST https://openrouter.ai/api/v1/systemone` implements TypeSafe's request and response shapes. The official `@typesafe-ai/sdk` works against it by setting `baseURL: "https://openrouter.ai/api"` and passing an OpenRouter API key. No TypeSafe account is needed, and calls bill to OpenRouter credits.
- Model ids: OpenRouter maps bare TypeSafe ids (`jev-1.13` becomes `typesafe/jev-1.13`, `jev-latest` becomes `~typesafe/jev-latest`), and ids with an author prefix pass through. The response `model` is an OpenRouter id with a build date, such as `typesafe/jev-1.13-20260917`.
- Responses add `id` (a generation id), `provider` (`"TypeSafe"`) and `usage.cost`, the USD charge for that request. The SDK passes them through.
- OpenRouter lists Jev with a 32,000 token context for state plus questions, at $0.042 per million input tokens and $0 output. TypeSafe direct documents 64,000 tokens per request and 32,000 for state plus the longest question.
- The SDK's `client.models.list()` fails against OpenRouter, because `GET /api/v1/models` there returns OpenRouter's own shape. OpenRouter's Models API lists `typesafe/*` and `~typesafe/*` entries, and the `~typesafe/jev-latest` page shows its current target ("Latest model Jev 1.13"). Checked 2026-09-27: the entries appear only with `?output_modalities=decisions`; the plain listing returns chat models. `typesafe/jev-1.13` carries `canonical_slug` `typesafe/jev-1.13-20260917`, and `~typesafe/jev-latest` carries `alias_target.slug` `typesafe/jev-1.13`.
- OpenRouter also runs a Decisions API at `POST /api/alpha/decisions`. It is alpha and has its own request shape.
- Separately, OpenRouter lists `typesafe/jev-router` (launched 2026-09-25, announced by TypeSafe on X): a free, OpenAI-compatible chat model that uses Jev to pick the best LLM and reasoning effort per request, with a 1M token context and multimodal input. It is an LLM router, not a System One endpoint.

Why decide now:

- Nick can run Jev today with an OpenRouter key and no TypeSafe account. Without this ADR, SysOne cannot use that key at all.
- ADR-008 section 8 kept gateways out of v1 and said a later gateway would be "configuration on the existing SDK transport (base URL, key, provider model ID)" with a registry mapping. The contracts froze in Phase 0 part two. Adding the provider now, while no Phase 1 code exists, keeps it additive: the fields are provider-typed or optional, and no table has shipped.
- The same model differs by provider in the id sent, the id that answers, the context limit and how cost is reported. Those are model facts, so golden rule 9 says they are data.

## Decision

### 1. A provider is a route, not a new transport

`SystemOneProvider = "typesafe" | "openrouter"`. Both use the same `SdkTransport` in `system-one-client`. The provider picks the SDK `baseURL` from `SYSTEM_ONE_PROVIDER_BASE_URLS` in core (`https://api.typesafe.ai`, `https://openrouter.ai/api`) and the key. `SYSTEM_ONE_TRANSPORT` (`sdk` or `fixture`) stays a per-deployment mechanism switch and does not name a provider.

- `baseURL` is always passed explicitly from the core constant, never from env. The SDK falls back to `TYPESAFE_BASE_URL`, and no env var may redirect an org key.
- Only the System One API is used. OpenRouter's Decisions API is not used: it is alpha and would need a second request compiler.

### 2. Provider per org, override per set

- `organizations.default_system_one_provider` (default `typesafe`) and `question_sets.system_one_provider` (null means the org default).
- The pointer resolver puts the result in `ResolvedRun.settings.systemOneProvider`. One run uses one provider for every call.
- Core passes the provider to `KeyResolver`, `ModelCatalog.effective` and every `SystemOneTransport.call`. Changing a set's provider re-runs the model lints.
- A missing key for the chosen provider fails the run with `system_one_auth`. There is no automatic failover to the other provider, because that would change the build, the limits and who bills the org.

### 3. Provider-aware registry: one profile, route rows per provider

- `ModelProfile` stays one row per model. A new platform table `system_one_model_routes` holds one `ModelRoute` per model and provider other than TypeSafe: `providerModelId` (the id sent), `pinned`, `resolvedIds` (response `model` values accepted as this model), `limits` (each nullable) and `docsUrl`.
- TypeSafe is the identity route and has no rows. For any other provider, a missing row means the model is not reachable there.
- `resolveRoute` returns the id to send, whether the route is pinned (the profile is versioned and the row is `pinned`) and the effective limits. `effectiveLimits` tightens each profile limit by the route's value and never loosens one. Preflight reads the effective limits, so jev-1.13.0 on OpenRouter gets 32,000 tokens per request.
- `registryIdForResolved` maps a response `model` back to a registry id for pricing and pinning. A value no route knows gets warning `model_resolved_unmapped`, a `model_alias_observations` row with the provider, and `model.alias_moved` with `provider`.
- Seed rows: `jev-1.13.0` on OpenRouter as `typesafe/jev-1.13` with `resolvedIds` `["typesafe/jev-1.13-20260917"]`, and `jev-latest` as `~typesafe/jev-latest`. Both have the 32,000 token limits and are not pinned.
- **Pinning.** `typesafe/jev-1.13` answers with dated builds, so it can move under one name. Until a dated id is confirmed as a request id, no OpenRouter route is pinned, and `model.alias_past_shadow` keeps sets on OpenRouter in `inactive` or `shadow`. Golden rule 5 is unchanged.
- **Registry sync.** TypeSafe keys list with `GET /v1/models`. OpenRouter keys list with OpenRouter's Models API, never `client.models.list()`. The `~typesafe/jev-latest` target from OpenRouter feeds alias detection next to the passive and probe observations. OpenRouter's and TypeSafe's `jev-latest` are tracked apart.

### 4. Keys per provider: `org_system_one_keys`

- Rename `org_typesafe_keys` to `org_system_one_keys` before the first migration ships, and keep its `provider` column, now `typesafe | openrouter`. Unique `(org_id, provider)`. Same envelope encryption (ADR-003).
- Chosen over adding a second table or keeping the old name with a new column, because the table already had a `provider` column and nothing has shipped. The neutral name follows ADR-008's naming rule, and a rename after Phase 1 would cost a migration.
- `KeyResolver(ctx, provider)` returns `{ apiKey, mode, provider }` for that provider only. A key is never sent to another provider's base URL.
- Validation per provider. TypeSafe: `GET /v1/models`. OpenRouter: its Models API lists `typesafe/*` for anyone, so validation also sends one one-noul request; 401 rejects the key, 402 (no credits) saves it with a warning.
- `key.get`, `key.rotate` and `key.revoke` take a `provider`, default `typesafe`. Platform key mode reads `TYPESAFE_API_KEY` or `OPENROUTER_API_KEY` for the run's provider.

### 5. Cost: provider-reported first, price book second

- When a response carries `usage.cost`, that amount, rounded to whole micro-USD, is the call's actual System One cost (`RunCall.providerCostUsd`). The price book is the fallback, and the source for estimates.
- `price_books` gains a nullable `provider`. A row for the run's provider wins over the provider-independent row. No OpenRouter row is seeded, because OpenRouter lists the same Jev price.
- OpenRouter error statuses map by HTTP status (402 to `system_one_auth` without marking the key invalid, 413 to `system_one_invalid_request`, 502, 503 and 524 to `system_one_unavailable`, 529 to `system_one_overloaded`). The request id is the response `id` when no `x-typesafe-request-id` header comes back.

### 6. `typesafe/jev-router` as an optional LLM escalation route

- `llm-client` gains a second, optional route: OpenRouter's OpenAI-compatible chat endpoint over plain `fetch` with the org's OpenRouter key, used only when an `EscalationConfig.model` names an OpenRouter model id such as `typesafe/jev-router`. Studio drafting, improve mode and opportunity drafting stay on Anthropic.
- It never goes through `SystemOneTransport`. Its spend is LLM spend: it adds to `escalationCostUsd`, priced by the provider's reported cost when present, else a price book row. Any routing saving jev-router makes against the comparator is reported as LLM spend, never as System One spend or savings.
- The contract change for this part (`LlmCompletion` carrying a provider and reported cost) lands with the `llm-client` work after acceptance. Nothing in this ADR's current contract diff depends on it.
- The Definition Studio names jev-router as the turnkey option when an app only needs model routing. The LLM router template stays for orgs that need their own model list, bands, gates, review and savings.

### 7. Standalone export

The ADR-009 standalone export may target OpenRouter: an explicit `baseURL: "https://openrouter.ai/api"`, `OPENROUTER_API_KEY` from the customer's env, and the route row's model id. The pinned-model rule still applies, so it waits for a pinned OpenRouter route.

## Options considered

| Option | Pros | Cons |
|---|---|---|
| Stay TypeSafe-only (ADR-008 section 8 as is) | No new surface | Nick cannot use Jev without a TypeSafe account; the first customer on OpenRouter is blocked |
| Treat OpenRouter as a new model family (`typesafe/jev-1.13` as its own profile) | No new table | Duplicates every fact, splits upgrade candidates and health across two ids for one model, and breaks "one model, one profile" |
| Put provider columns on `ModelProfile` (one profile row per provider) | One table | Pinning, weaknesses and upgrades would key on (id, provider); every profile consumer changes; the profile contract is frozen |
| Route rows per provider (chosen) | Profiles unchanged; limits, ids and pinning per provider are data; TypeSafe needs no rows | One more platform table and a mapping step for pricing |
| OpenRouter Decisions API | Official OpenRouter SDKs in three languages | Alpha; a different request shape needs a second compiler; the TypeSafe SDK path already works |
| A separate `OpenRouterTransport` | Isolation | Duplicates retries, error mapping and fixtures for the same wire shape |
| Keys: second table `org_openrouter_keys` | No rename | Two vault code paths and two RLS policies for one concept |
| Keys: rename to `org_system_one_keys` with `provider` (chosen) | One table, neutral name, the column already existed | Doc churn now; free because no migration has shipped |
| Automatic failover between providers | Higher availability | Silent change of build, limits and billing; breaks pinning and cost reports |

## Consequences

- Orgs can run System One models with only an OpenRouter key. On OpenRouter, sets stay in `inactive` or `shadow` until a pinned route exists, so the controlled rollout path still needs a TypeSafe key or a confirmed dated OpenRouter id.
- Preflight, pinning, pricing and lints read the route, so a set that works on TypeSafe can fail preflight on OpenRouter (32k against 64k per request). Changing a set's provider re-runs the model lints.
- Reports split System One spend by provider, and show provider-reported cost and price book cost apart.
- Fixtures are recorded per provider. `pnpm fixtures:record` and `pnpm smoke` take `--provider openrouter` and need `OPENROUTER_API_KEY`. The documented OpenRouter example body is committed as a fixture in `packages/core/src/contracts/__fixtures__`.
- The DPA lists OpenRouter as a subprocessor for orgs that use this route.
- Ownership: Core Engine owns the provider contracts and helpers, preflight and the route-aware lints, and `system-one-client`. Platform / Tenancy owns `org_system_one_keys`, `system_one_model_routes`, the registry sync per provider and the provider settings. Integrations owns the standalone provider option. Billing / Savings owns cost reporting.
- Vercel AI Gateway is now the third route, added by [ADR-013](013-vercel-ai-gateway-route.md) through the same mechanism. Cloudflare Workers AI stays unverified and out of scope. Adding one later is another `SystemOneProvider` value plus route rows, through an ADR like this one.
- Docs that carry the detail: [system-one-api-contract.md](../../.claude/skills/sysone-builder/references/system-one-api-contract.md) (Routes), [system-one-models.md](../../.claude/skills/sysone-builder/references/system-one-models.md) (section 15), [architecture.md](../../.claude/skills/sysone-builder/references/architecture.md) (System One providers and transports), [security.md](../../.claude/skills/sysone-builder/references/security.md), [data-model.md](../../.claude/skills/sysone-builder/references/data-model.md), [savings-model.md](../../.claude/skills/sysone-builder/references/savings-model.md), [definition-studio.md](../../.claude/skills/sysone-builder/references/definition-studio.md), [deploy-and-codegen.md](../../.claude/skills/sysone-builder/references/deploy-and-codegen.md), [phase-1.md](../../.claude/skills/sysone-builder/references/phases/phase-1.md) and [phase-2.md](../../.claude/skills/sysone-builder/references/phases/phase-2.md).

## Open questions for Nick

1. Does OpenRouter accept a dated id such as `typesafe/jev-1.13-20260917` as a request model? If yes, the `jev-1.13.0` route row switches to it with `pinned: true`, and sets on OpenRouter can pass shadow. One live call with an OpenRouter key answers it.
2. Is `typesafe/jev-router` billed at $0, or at the price of the LLM it picks? Its `usage.cost` answers it; the savings report depends on it.
3. Should new orgs default to `openrouter` while TypeSafe keys are hard to get, or stay on `typesafe`? This ADR keeps `typesafe`.

## Rollout

- **Now (Phase 0, while proposed):** the additive contracts, the seed route rows, the pure helpers and their tests are in `packages/core`. They do nothing until Phase 1 code reads them. The docs mark every OpenRouter behavior as ADR-011, proposed.
- **Phase 1:** `SdkTransport` provider support, id mapping through route rows, provider-aware preflight, `usage.cost` pricing, the `system_one_model_routes` table and `org_system_one_keys`, OpenRouter fixtures and `pnpm smoke --provider openrouter`. Build behind the provider setting with default `typesafe`.
- **Phase 2:** per-provider keys, validation, platform key per provider, the per-provider registry sync, and the org and set provider settings.
- **After acceptance:** the `llm-client` OpenRouter chat route and the jev-router escalation option.
- **Reversal:** set every org's provider back to `typesafe` and stop accepting OpenRouter keys. The route rows and the provider column stay as data. If this ADR is rejected before Phase 1, drop the route rows and the helpers, and keep the table name `org_system_one_keys` with `provider` fixed to `typesafe`.
