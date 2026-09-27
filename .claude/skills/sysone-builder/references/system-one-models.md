# System One models

Owner: Platform / Tenancy (the `system_one_models` table, registry sync, alias probe, contract watch, platform Models page). Core Engine owns the `ModelProfile` contract, the `ModelCatalog` port, preflight, lints and the question-type modules. Decision records: [ADR-008](../../../../docs/adr/008-system-one-model-registry.md), and [ADR-011](../../../../docs/adr/011-openrouter-route.md) (proposed) for providers and routes (section 15). Facts checked against `docs.typesafe.ai` and `https://api.typesafe.ai/openapi.json` (info.version 0.2.0) on 2026-09-26. The live docs win.

## 1. Scope

- Every System One model is served by the same endpoint, `POST /v1/systemone`. The request's `model` field picks the model (`docs.typesafe.ai/models.md`).
- Jev is the first family and the default. Every SysOne contract is model-agnostic: code, schemas, columns, error codes and env vars say `systemOne` or `system_one`. UI copy, examples and catalog data may say Jev.
- A new model that uses the existing question types is a data change: a registry row, a price row, fixtures and a smoke run (recipe in section 12). No code or contract change.

What the API contract itself guarantees for every model (endpoint, request, response, errors, SDK use) is in [system-one-api-contract.md](system-one-api-contract.md).

## 2. What the API gives

- `GET /v1/models` returns `name`, `description` and `release_date` for each entry, and nothing else (openapi.json 0.2.0, `ModelMetadata`).
- It lists the names the calling key can reach. Today that is the aliases.
- Versioned IDs such as `jev-1.13.0` work in the `model` field without being listed.
- It does not say what an alias points to, and it gives no limits, prices or question types.
- The response's `model` field reports the versioned ID that answered, even when the request sent an alias.

So SysOne curates model facts itself and learns alias targets by watching responses.

## 3. ModelProfile contract

```ts
ModelProfile = {
  id: string,                          // "jev-1.13.0", "jev-latest"
  family: string,                      // "jev"
  kind: "versioned" | "alias",
  aliasTarget: string | null,          // last observed versioned ID, aliases only
  status: "unreviewed" | "preview" | "stable" | "deprecated" | "retired",
  releaseDate: string | null,          // YYYY-MM-DD
  retireAt: string | null,
  questionTypes: QuestionTypeId[],     // subset of "noul" | "choice" | "score"
  limits: {
    requestTokens: number,             // state plus all questions
    statePlusLongestQuestionTokens: number,
    rpm: number,                       // published requests per minute per account
    tokensPerSec: number,
  } | null,                            // null only while unreviewed
  inputModalities: string[],           // ["text"]
  weaknesses: string[],                // ids from section 10
  supersedes: string[],                // model or family ids this model can replace (section 11);
                                       // set by the platform admin at review; [] for none
  docsUrl: string,
  jaggednessUrl: string | null,
  lastReviewed: string,                // date a human checked the row against the docs
}
```

Where it lives:

| Store | Purpose |
|---|---|
| `packages/core/src/models/catalog.ts` | Seed rows (section 13), used by tests and to seed the table |
| `system_one_models` | Platform table, one row per `ModelProfile`. No `org_id`. Only the platform admin writes, and every write is audited. |
| `system_one_model_routes` | One `ModelRoute` per model and provider other than TypeSafe: the id to send, whether it is pinned, the provider's resolved ids and limits (section 15) |
| `model_alias_observations (provider, alias, resolved_id, first_seen, last_seen)` | Which build each alias has served, per provider |
| `org_system_one_keys.models text[]` | Registry ids the org's key for that provider can reach. Refreshed when the key is saved or rotated, and nightly. |
| `price_books` | Prices per exact versioned ID (section 8) |

- Core reads profiles through the `ModelCatalog` port in `RunPorts` ([architecture.md](architecture.md)). For a moving name it returns the profile of the last observed versioned model, so core stays pure.
- **Reachability.** Reachability is per provider: a set checks the key for its own provider. A name is available to an org when its key lists it, or when it is the observed target of an alias the key lists. The API accepts versioned IDs that are not listed, so this rule keeps `jev-1.13.0` usable for a key that lists only `jev-latest`. At run time a `403` from TypeSafe still maps to `system_one_forbidden`.
- `limits` may be null only on an `unreviewed` row. A review cannot move a row to `preview` or `stable` without limits.

## 4. Pinned or moving

A model name is pinned only when the registry marks it `kind: "versioned"`. Aliases, partial IDs and unknown names count as moving. SysOne never infers this from the shape of the name.

| Name | Classification | Why |
|---|---|---|
| `jev-latest` | moving | Alias row |
| `jev-preview` | moving | Alias row |
| `jev` | moving | Partial ID used in TypeSafe's examples; not a versioned row |
| `jev-1.13` | moving | Partial ID; not a versioned row |
| `jev-1.13.0` | pinned | Versioned row |
| `foo-2.0.0` (never seen) | moving, inserted as `unreviewed` | The registry sync inserts unseen names with `kind: "alias"` until the platform admin reviews them |

- Moving models are allowed only in the `inactive` and `shadow` rollout stages.
- The lint `model.alias_past_shadow` is an error when a moving model would serve a channel in `controlled` or `full`. The shadow to controlled gate requires a pinned model ([confidence-policy.md](confidence-policy.md)).
- Partial IDs are not seeded. If a customer needs one, the platform admin adds it as an alias row. Until then it gets `model.unknown`.

## 5. Lifecycle

| Status | Meaning | Lint at publish |
|---|---|---|
| `unreviewed` | Inserted by the registry sync. Allowed in the playground. | `model.unreviewed` (error) |
| `preview` | Orgs opt in with the org setting `allowPreviewModels`. | `model.not_available_to_org` (error) without the opt-in |
| `stable` | Available to every org whose key can reach it. | none |
| `deprecated` | Still served. A `retireAt` date is usually set. | `model.deprecated` (warning) |
| `retired` | Past `retireAt`. | `model.deprecated` (error) |

- The platform admin reviews rows on the platform Models page, or headless with `GET`, `POST` and `PATCH /api/v1/platform/models` (operations `platform_model.list`, `platform_model.create`, `platform_model.update`; [management-api.md](management-api.md)).
- Orgs see the models they can select through `GET /api/v1/models` (`model.list`, CLI `sysone models list`, MCP `list_models`). Unreviewed rows are left out. Preview rows appear only with `allowPreviewModels`.
- Other model lints: `model.unknown` (not in the registry), `model.question_type_unsupported` (a question type is not in the profile's `questionTypes`). All model lints are listed in [architecture.md](architecture.md).
- At run time a model that is unknown, unreviewed or not reachable by the org key returns `422 model_unavailable` ([api.md](api.md)). The playground is the one place an unreviewed model may run.

## 6. Detection

`GET /v1/models` has no alias targets, so SysOne detects changes four ways.

| Method | When | What it does |
|---|---|---|
| Passive | Every run | `RunSink` compares `model_requested` to `model_resolved` against the last row in `model_alias_observations`. A new pair updates `aliasTarget` and emits `model.alias_moved` ([events.md](events.md)). A changed resolved model is also an auto-demote trigger ([confidence-policy.md](confidence-policy.md)). |
| Active probe | Nightly | Each alias with no traffic that day gets a one-noul request with a tiny state. The response `model` is recorded like a run. |
| Listing | Nightly, and when a key is saved or rotated | TypeSafe keys: `GET /v1/models`. OpenRouter keys: OpenRouter's Models API, `GET https://openrouter.ai/api/v1/models?output_modalities=decisions` (the plain listing returns chat models only and leaves System One models out), reading entries `typesafe/*` and `~typesafe/*` and mapping them to registry ids through the route rows (section 15). Reachable ids go into `org_system_one_keys.models`. An unseen name is inserted as `unreviewed` with null limits, and the platform admin is alerted. An OpenRouter id with no route row alerts the platform admin to add one. |
| Contract watch | Nightly | Diffs `openapi.json`, `llms.txt` and `models.md` against committed snapshots, including the keys of `components.schemas.Question.discriminator.mapping`. A change alerts the platform admin and opens an issue. |

The jobs are listed in [architecture.md](architecture.md) (background jobs). Publishing on an `unreviewed` model is always blocked.

When a model reaches `stable`, or `preview` for orgs with `allowPreviewModels`, the model-upgrade candidates job (Phase 3b) finds the sets it could replace. A live set is a candidate when both hold:

- It is pinned to an older model in the same family, or to a model whose id or family is in the new model's `supersedes`.
- The new model's `questionTypes` include every question type the set uses.

A candidate found only through `supersedes` is marked cross-family. Without `supersedes`, a new family never shows up as an upgrade for existing sets. Section 11 covers what happens next.

## 7. Limits as data

- Preflight, lints and default limiter budgets read the profile, never constants. On a provider other than TypeSafe they read the effective limits: each profile limit tightened by the route row's value (`effectiveLimits`, section 15). jev-1.13.0 through OpenRouter gets 32,000 tokens per request, not 64,000. Signatures are `preflight(spec, state, profile)` and `lint(spec, profile, publishCtx?)`. `publishCtx` carries the channel rollout stage, the current interface, consumers and the models the org key can reach ([architecture.md](architecture.md), Lints). Lints that need it are skipped when it is absent; publish and promote always pass it.
- For a moving name they use the profile of its last observed resolved model. In the playground, a row with null limits falls back to the observed target's limits, or to the smallest limits among stable profiles when there is no target.
- Default limiter budgets are a per-model setting, about 83 percent of the published `rpm` (about 1,000 requests per minute for `jev-1.13.0`). Limiter keys include the model. Evals use a separate bucket ([security.md](security.md)).
- API-wide rules stay constants in [system-one-api-contract.md](system-one-api-contract.md): at most 255 options per choice, 2 to 10 score levels, and the question type union.

## 8. Pricing

- Prices live in `price_books`, keyed by the exact versioned ID, with an optional `provider`. Alias rows are rejected, because an alias row would misprice runs after the alias moves. A row for the run's provider wins over a provider-independent row.
- A provider-reported `usage.cost` (OpenRouter sends one) is the call's actual cost and wins over the price book. The price book is the fallback and the source for estimates such as `avgEscalationCostMicroUsd` ([savings-model.md](savings-model.md)).
- Runs are priced by `model_resolved`, mapped to a registry id through the route rows on a provider other than TypeSafe: `system_one_cost_usd = input_tokens * price.in + output_tokens * price.out` ([system-one-api-contract.md](system-one-api-contract.md)).
- Unpriced model: in BYO key mode the run succeeds with cost `null` and warning `model_unpriced`. In platform key mode the run is refused with `422 model_unpriced`, because it cannot be billed.
- The registry sync alerts the platform admin when a `stable` model has no price row.
- `usage_events` and `usage_daily` carry the resolved model, so billing, savings and upgrade comparisons split by model ([savings-model.md](savings-model.md)).

## 9. Question types

- The v1 union `noul | choice | score` is closed by design. The OpenAPI `Question` is a `oneOf` discriminated on `type` with exactly these three.
- A new type needs an ADR, one `QuestionTypeModule` and one React renderer ([spec-schema.md](spec-schema.md), section 9). The contract watch flags a new discriminator key.
- The editor, the Studio and the lints offer only the types in the target model's `questionTypes`.
- An answer of an unknown type is stored raw with band `low`, effective action `fallback` and warning `unknown_answer_type`. Nothing throws.

## 10. Weaknesses

Weakness ids for `jev-1.13.0`, summarized from `docs.typesafe.ai/model-jaggedness/jev-1.13.md` (last reviewed by TypeSafe 2026-09-17).

| Id | Failure mode | Do this instead | Lint ([architecture.md](architecture.md)) |
|---|---|---|---|
| `literal_reading` | Reads scoping words, negations and implied conditions at face value | Write the exact condition and criteria for each option; split an interpretation into two literal questions | Studio guidance |
| `counting` | Does not count characters, terms or list items reliably | Count in code; ask one noul per item and add the answers | `weakness.counting` |
| `arithmetic` | Is not a calculator | Keep all math in code | `weakness.counting` |
| `numeric_precision` | Weak on hex, RGB and other numeric forms; score levels are weak for magnitudes | Convert in code and pass a number or a named bucket; compare a score expectation only to a threshold | Studio guidance |
| `date_comparison` | Reads dates as text, not ordered values | Extract date parts with choices (with a "not stated" option); compare in code | `weakness.date_comparison` |
| `indirection` | Loses accuracy on multi-hop or double-negative questions | Reduce hops; name the relevant state path | Studio guidance |
| `large_irrelevant_state` | Accuracy falls as unrelated state grows | Filter in code first; send only what the question needs | `weakness.large_unreferenced_state` |
| `adversarial_state` | Does not treat state as hostile by default | Precise criteria; adversarial cases in the dataset ([security.md](security.md)) | Studio guidance |
| `contradictory_criteria` | Confused when instructions and criteria disagree | Treat criteria as an extension of the instruction; align them | Studio guidance |
| `inverted_noul` | A noul whose `true` means no performs worse | Word the true criterion positively | `weakness.inverted_noul` |
| `structural_invariants` | A noul and a choice on the same question, or a question and its negation, need not agree | Ask each decision one way; enforce identities in code; tune each question on its own labels | `weakness.threshold_copied` |
| `generation` | Not trained to generate text | Extract candidates with a regex or an LLM; ask a choice over them | `weakness.generation` |

- Weakness lints fire only when the target model's profile lists the id. A newer model that drops a weakness stops the lint, and the Model upgrades report notes it.
- The Studio decomposition prompt includes the target model's `jaggednessUrl` page ([definition-studio.md](definition-studio.md)).

## 11. New model upgrade flow

Phase 3b. Details, gates and the experiment rules are in [effectiveness-loop.md](effectiveness-loop.md).

| Step | What happens | Headless |
|---|---|---|
| Detect | A model reaches `stable`, or `preview` for an org with `allowPreviewModels`. Event `model.available`, whose `candidateSetIds` lists the org's candidate sets ([events.md](events.md)). The candidates job (section 6) lists live sets pinned to an older model in the same family, or to a model or family in the new model's `supersedes`, and only when the new model's `questionTypes` cover the set's question types. The org's Model upgrades page and the `model-upgrades` report show them, with cross-family candidates marked. | `GET /api/v1/model-upgrades` (`model.upgrades`), `sysone upgrade list`, MCP `get_report` |
| Try | `POST /api/v1/sets/{ref}/try-model` with `{ model }` (`set.try_model`, a job). It builds a candidate spec inside the job (the production spec with only `model` changed; the set's draft is not touched), evals both on the same dataset snapshot, re-runs the threshold suggester and opens a `model_upgrade` proposal with the metric deltas. `?dryRun=true` works. | `sysone upgrade try <slug> --model <id>`, MCP `try_model` |
| Promote | Accepting the proposal creates a draft only. Publishing it to a production channel in `controlled` or `full` runs an experiment of kind `model`. Promotion needs an approval for agents. | `sysone proposals accept`, `sysone experiments promote`, MCP `decide_proposal`, `decide_experiment` |
| Deprecate | The platform admin sets `deprecated` and `retireAt`. The Model upgrades page lists sets still pinned to it. After `retireAt` the row is `retired` and `model.deprecated` is an error. | `PATCH /api/v1/platform/models/{id}` |

The end-to-end agent version of this flow is in [headless-and-agents.md](headless-and-agents.md), flow (d).

## 12. Recipe: add a new System One model

1. Read the model's entry on `docs.typesafe.ai/models.md` and its jaggedness page, if it has one.
2. Review the row the registry sync inserted as `unreviewed`, or create one (platform Models page or `POST /api/v1/platform/models`). Fill `family`, `kind`, `releaseDate`, `limits`, `questionTypes`, `inputModalities`, `weaknesses`, `supersedes`, `docsUrl`, `jaggednessUrl` and `lastReviewed`. For an alias, fill `kind: "alias"` and let detection set `aliasTarget`. For the first model of a new family, list the models or families it replaces in `supersedes`, or existing sets never see it as an upgrade (section 6).
3. Add a platform `price_books` row keyed by the exact versioned ID.
4. Record fixtures for the new ID: `pnpm fixtures:record --model <id>` ([testing.md](testing.md)).
5. Run `pnpm smoke --model <id>`.
6. Set the status to `preview` or `stable`.
7. Update the seed table below and `packages/core/src/models/catalog.ts`.
8. If OpenRouter serves it, add a `system_one_model_routes` row from OpenRouter's model page and Models API (section 15), record fixtures with `--provider openrouter`, and run `pnpm smoke --model <id> --provider openrouter`.
9. Decide whether new sets should start on it. If so, move the platform `defaultModel` to the new versioned ID (section 14). Existing sets move only through the upgrade flow (section 11).

If the model adds a question type, stop: that needs an ADR, a `QuestionTypeModule` and a renderer (section 9).

## 13. Seed table

| Id | Family | Kind | Status | aliasTarget | Limits | Question types | Input | Weaknesses |
|---|---|---|---|---|---|---|---|---|
| `jev-1.13.0` | `jev` | versioned | stable | null | requestTokens 64,000; statePlusLongestQuestionTokens 32,000; rpm 1,200; tokensPerSec 250,000 | noul, choice, score | `["text"]` | all ids in section 10 |
| `jev-latest` | `jev` | alias | stable | `jev-1.13.0` | copy of `jev-1.13.0` | copy of `jev-1.13.0` | copy of `jev-1.13.0` | copy of `jev-1.13.0` |
| `jev-preview` | `jev` | alias | preview | `jev-1.13.0` | copy of `jev-1.13.0` | copy of `jev-1.13.0` | copy of `jev-1.13.0` | copy of `jev-1.13.0` |

- All three rows: `supersedes` `[]`, `retireAt` null, `docsUrl` `https://docs.typesafe.ai/models.md`, `lastReviewed` `2026-09-26`.
- `jev-1.13.0`: `jaggednessUrl` `https://docs.typesafe.ai/model-jaggedness/jev-1.13.md`. `releaseDate` stays null until the platform admin confirms it, because `GET /v1/models` reports dates for the aliases only.
- Alias seed rows copy `jev-1.13.0`'s `limits`, `questionTypes`, `inputModalities` and `weaknesses`, so each is a valid `stable` or `preview` row with non-null limits. They have `aliasTarget` `jev-1.13.0`, `releaseDate` null and `jaggednessUrl` null.
- `ModelCatalog` never uses an alias row's limits or weaknesses for a moving name. It uses the profile of the observed target (section 3). The copied values only keep the alias row valid.
- TypeSafe says `jev-preview` moves ahead of `jev-latest` when a preview build exists, and none exists today.
- English is the strongest language. Test other languages on the org's own content before routing on them.
- TypeSafe says rate limits adjust dynamically and can change without notice. Treat `rpm` and `tokensPerSec` as the published values at `lastReviewed`.
- Price row: `jev-1.13.0`, $0.042 per million input tokens, output free ([system-one-api-contract.md](system-one-api-contract.md)).
- Route rows for OpenRouter are in section 15 and `SEED_MODEL_ROUTES` in `catalog.ts`.

## 14. Default model

Jev is the default because of a setting, not because code names it. No template, Studio path or operation hardcodes a model ID.

- **Platform default.** The platform setting `defaultModel` names the model new sets start on. Seed value: `jev-1.13.0`. It changes through `platform_settings.update` ([management-api.md](management-api.md), Platform), which rejects a value that is not a `stable` versioned row.
- **Org override.** `organizations.settings.defaultModel` ([data-model.md](data-model.md)) changes through `settings.update`. It must be a `stable` versioned ID that the org's key can reach (section 3, Reachability); anything else is rejected with `400 invalid_request`. When the override is later no longer `stable` or reachable, the platform default applies.
- **Who uses it.** `set.create` without `fromVersion` (a blank set or `fromTemplate`), `studio.create` (the session's target model) and template builds. `set.create` with `fromVersion` keeps that version's model.
- **Templates never set `model`.** A `QuestionTemplate` builds a `Partial<QuestionSetSpec>` without `model`, and the operation that applies it fills the default ([definition-studio.md](definition-studio.md), `templates/plugin.template.ts`).
- **Written once.** The default is copied into the new draft's `spec.model` when the set or Studio session is created. Changing the platform or org default never changes existing sets, drafts or versions. They move through the draft or the upgrade flow (section 11).
- **Listing.** `model.list` marks the model that is the default for the calling org with `isDefault: true`, so the console picker, `sysone models list` and MCP `list_models` preselect it.
- **Why a versioned ID.** TypeSafe's SDKs default to `jev-latest`, but a moving name cannot serve `controlled` or `full` (section 4). A pinned default lets a new set move past shadow without a model change. When TypeSafe ships a newer stable model, the platform admin moves `defaultModel` after the review in section 12.

## 15. Providers and routes

ADR-011 (proposed) adds a provider dimension. The same registry model can be reached through TypeSafe directly or through OpenRouter, and the two can differ in the id sent, the id that answers, the limits and the price. The API side is in [system-one-api-contract.md](system-one-api-contract.md#routes).

- **One profile, many routes.** `ModelProfile` stays one row per model. A provider other than TypeSafe gets a `ModelRoute` row per model it serves (`system_one_model_routes`, contract in `packages/core/src/contracts/models.ts`):

```ts
ModelRoute = {
  modelId: string,              // registry id, "jev-1.13.0"
  provider: "openrouter",       // never "typesafe": TypeSafe is the identity route and has no rows
  providerModelId: string,      // the id sent: "typesafe/jev-1.13", "~typesafe/jev-latest"
  pinned: boolean,              // true only when providerModelId names exactly one build
  resolvedIds: string[],        // response `model` values accepted as this model: "typesafe/jev-1.13-20260917"
  limits: { requestTokens, statePlusLongestQuestionTokens, rpm, tokensPerSec },   // each number | null
  docsUrl: string,
  lastReviewed: string,
}
```

- **Missing route.** A model with no route row for a provider is not reachable there: lint `model.not_available_to_org`, and `422 model_unavailable` at run time.
- **Pure helpers in core.** `resolveRoute(profile, provider, routes)` returns the id to send, whether it is pinned (the profile is versioned and the route row is `pinned`) and the effective limits. `effectiveLimits(profileLimits, routeLimits)` tightens each limit and never loosens one. `registryIdForResolved(provider, responseModel, routes)` maps a response `model` back to a registry id, or null. `toOpenRouterModelId` and `fromOpenRouterModelId` mirror OpenRouter's documented id rule.
- **Pinning off TypeSafe.** A route is pinned only when its row says so. OpenRouter's `typesafe/jev-1.13` answers with dated builds such as `typesafe/jev-1.13-20260917`, so its seed row is not pinned, and `model.alias_past_shadow` treats a set on it as moving. A response whose `model` is not in the route's `resolvedIds` gets warning `model_resolved_unmapped`, is recorded in `model_alias_observations`, and emits `model.alias_moved` with `provider: "openrouter"`.
- **OpenRouter alias targets.** OpenRouter's Models API and the `~typesafe/jev-latest` model page show the alias's current target (on 2026-09-26: "Latest model Jev 1.13"). The nightly listing records it next to the passive and probe observations, so an OpenRouter alias move is detected even with no traffic. OpenRouter's `~typesafe/jev-latest` and TypeSafe's `jev-latest` are tracked apart, because they can point at different builds for a while.
- **Registry sync per provider.** The SDK's `client.models.list()` fails against OpenRouter, because OpenRouter's `GET /api/v1/models` returns its own shape. The sync reads OpenRouter's Models API directly for OpenRouter keys (section 6).

Seed route rows (OpenRouter's Jev pages and Models API, 2026-09-26):

| Model id | Provider | providerModelId | Pinned | resolvedIds | Limits | Docs |
|---|---|---|---|---|---|---|
| `jev-1.13.0` | openrouter | `typesafe/jev-1.13` | no | `typesafe/jev-1.13-20260917` | requestTokens 32,000; statePlusLongestQuestionTokens 32,000; rpm and tokensPerSec null | `https://openrouter.ai/typesafe/jev-1.13` |
| `jev-latest` | openrouter | `~typesafe/jev-latest` | no | none (an alias; targets live in `model_alias_observations`) | same as above | `https://openrouter.ai/typesafe` |

- OpenRouter lists Jev at $0.042 per million input tokens and $0 output, the same as TypeSafe, so no provider-specific price row is seeded. `usage.cost` carries the actual charge.
- OpenRouter publishes no per-model rpm or tokens per second for Jev, so the route leaves them null and the profile's values apply as a ceiling. OpenRouter's own 429s map to `system_one_rate_limited`.
- `jev-preview` has no OpenRouter route.
- **Other gateways.** TypeSafe's Python SDK usage page (`docs.typesafe.ai/sdk/python/usage.md`) also mentions Vercel AI Gateway (`https://ai-gateway.vercel.sh/typesafe`, model `typesafe-ai/jev`). It is not verified against Vercel's own docs and is out of scope, like Cloudflare Workers AI, which neither documents. Adding one later is another `SystemOneProvider` value plus route rows, through an ADR.
