# ADR-008: System One model registry and neutral naming

- **Status:** accepted (decided by Nick, 2026-09-26)
- **Amended by:** ADR-011 (proposed): a second provider route through OpenRouter, provider-aware routes and keys. Until ADR-011 is accepted, this ADR's section 8 stands.
- **Date:** 2026-09-26
- **Owner:** Architect / Lead
- **Contract impact:** `ModelProfile`, a `ModelCatalog` port in `RunPorts`, `QuestionTypeModule`, preflight and lint signatures that take a profile, renamed `RunResult` cost fields, `system_one_*` error codes, renamed tables and columns, new tables `system_one_models` and `model_alias_observations`, `org_typesafe_keys.models`, and the package rename to `packages/system-one-client`.

## Context

Nick's requirement: "This should work for Jev and also any new System One models that are released by TypeSafe."

What TypeSafe provides (checked against the live docs and `https://api.typesafe.ai/openapi.json`, info.version 0.2.0, on 2026-09-26):

- Every System One model is served by `POST /v1/systemone` and picked by the request's `model` field (`docs.typesafe.ai/models.md`).
- `GET /v1/models` returns only `name`, `description` and `release_date` per entry. It lists what the calling key can reach, and today it lists the aliases. Versioned IDs such as `jev-1.13.0` are accepted whether or not they appear. It does not say what an alias points to, and it gives no limits, prices or question types.
- The response's `model` field reports the versioned ID that answered.

So SysOne has to curate model facts itself. Before this ADR:

- Preflight hard-coded 32k and 64k tokens, and the rate budget assumed 1,200 requests per minute.
- Cost used a `$0.042` per million literal, assumed output is always free, and the contract named a `model_prices` store that does not exist next to `price_books`.
- The nightly drift job compared alias targets from `GET /v1/models`, a field the API does not return, so it could never fire.
- Nothing defined "pinned". The repo named only `jev-latest` and `jev-preview` as aliases, while TypeSafe's own docs also use the partial IDs `jev` and `jev-1.13`, so the alias lint could pass names that move.
- The router, compiler, composites, manifest, editor and Studio each switched on the question type string.
- Jev-branded names (`jevCostUsd`, `jev_*` error codes, `JevTransport`, `org_jev_keys`, `packages/jev-client`) were about to freeze in public contracts that allow only additive change in v1. A second model's cost and outages would be reported under Jev names for the life of v1.

## Decision

### 1. Model profiles are curated data

```ts
ModelProfile = {
  id: string,                          // "jev-1.13.0", "jev-latest"
  family: string,                      // "jev"
  kind: "versioned" | "alias",
  aliasTarget: string | null,          // last observed versioned ID, for aliases
  status: "unreviewed" | "preview" | "stable" | "deprecated" | "retired",
  releaseDate: string | null,
  retireAt: string | null,
  questionTypes: QuestionTypeId[],
  limits: { requestTokens: number, statePlusLongestQuestionTokens: number, rpm: number, tokensPerSec: number } | null,
  inputModalities: string[],           // ["text"]
  weaknesses: string[],                // ids such as "counting", "date_comparison", "inverted_noul"
  supersedes: string[],                // model or family ids this model can replace; [] for none
  docsUrl: string,
  jaggednessUrl: string | null,
  lastReviewed: string,
}
```

- `supersedes` is required. The platform admin sets it at review. Without it a new family never shows up as an upgrade candidate for sets on an older family. The migration that adds the column backfills `[]` on rows written before it, and the zod schema does not default it.
- Platform table `system_one_models` holds the profiles. It has no `org_id`. Only the platform admin writes to it, and every write is audited.
- `model_alias_observations (alias, resolved_id, first_seen, last_seen)` records which versioned model each alias has served.
- `org_typesafe_keys.models text[]` records the names each org key can send. It is refreshed when the key is saved or rotated, and nightly.
- A `ModelCatalog` port in `RunPorts` gives core the profile as data, and resolves a moving name to the profile of its last observed versioned model. Core stays pure.
- Seed data: `jev-1.13.0` (versioned, stable; 64,000 tokens per request, 32,000 for state plus the longest question, 1,200 requests per minute, 250,000 tokens per second; noul, choice and score; text input), plus `jev-latest` and `jev-preview` as aliases whose last observed target is `jev-1.13.0`.

Lifecycle:

| Status | Meaning |
|---|---|
| `unreviewed` | Inserted by the registry sync. Allowed in the playground. Cannot be published. |
| `preview` | Orgs opt in with the `allowPreviewModels` setting. |
| `stable` | Available to every org whose key can reach it. |
| `deprecated` | Publish lint warning. |
| `retired` | Publish lint error after `retireAt`. |

### 2. Pinned versus moving

A model name counts as pinned only when the registry marks it `kind: "versioned"`. Aliases, partial IDs and unknown names count as moving.

| Name | Classification |
|---|---|
| `jev-latest` | moving |
| `jev-preview` | moving |
| `jev` | moving |
| `jev-1.13` | moving |
| `jev-1.13.0` | pinned |
| `foo-2.0.0` (never seen) | moving, inserted as `unreviewed` |

Moving names are allowed only in the `inactive` and `shadow` rollout stages. The lint `model.alias_past_shadow` is an error when a moving model would serve a channel in `controlled` or `full`. It replaces the old "alias with tuned thresholds" lint, and the pin requirement moves to the shadow-to-controlled gate (ADR-010).

### 3. Limits and lints read the profile

- Signatures become `preflight(spec, state, profile)` and `lint(spec, profile)`. For a moving name they use the profile of its last observed resolved model.
- Default limiter budgets are a per-model setting (about 1,000 requests per minute for `jev-1.13.0`, roughly 83 percent of the published 1,200), and limiter keys include the model.
- API-wide rules stay constants in `system-one-api-contract.md`: at most 255 options per choice, and 2 to 10 score levels.
- Model lints: `model.unknown`, `model.unreviewed`, `model.not_available_to_org`, `model.deprecated`, `model.question_type_unsupported` and `model.alias_past_shadow`. Weakness lints fire only when the target model's profile lists the weakness id, so a newer model that drops a weakness stops the lint.
- At run time, a model that is unknown, unreviewed or not reachable by the org key returns `422 model_unavailable`.

### 4. Detecting new models and alias moves

`GET /v1/models` returns no alias targets, so detection works in four ways:

1. **Passive.** `RunSink` compares each run's `model_requested` to `model_resolved` against the last observation. A new pair updates `aliasTarget` and emits `model.alias_moved`, which is also an auto-demote trigger for sets on that alias.
2. **Active probe.** Each night, every alias with no traffic that day gets a one-noul request with a tiny state, and the response `model` is recorded.
3. **Listing.** Each night, `GET /v1/models` is called with each org key. Reachable names go into `org_typesafe_keys.models`. An unseen name is inserted as `unreviewed` with null limits, and the platform admin is alerted.
4. **Contract watch.** Each night, `openapi.json`, `llms.txt` and `models.md` are diffed against committed snapshots, including the keys of `components.schemas.Question.discriminator.mapping`. A change alerts the platform admin and opens an issue.

Publishing on an `unreviewed` model is blocked.

### 5. Question types stay closed, and live in one module each

- The v1 union `noul | choice | score` is closed by design. TypeSafe documents exactly these three, and the OpenAPI `Question` is a discriminated `oneOf` on `type`.
- All per-type logic lives in one `QuestionTypeModule` per type under `packages/core/src/question-types`: `{ id, questionSchema, answerSchema, compile, band, compositeValue?, lints, manifestHint, uiKind }`. The router, compiler, composites, manifest, editor and Studio iterate over the module map instead of switching on the type string.
- A new type needs a follow-up to this ADR, one module and one React renderer.
- The editor, the Studio and the lints offer only the types in the target model's `questionTypes`.
- System One response schemas use zod `passthrough`, and runs store the raw answer JSON. The API answers in the type that was asked, so an unknown answer type should never arrive. If one does, it is stored raw with band `low`, effective action `fallback` and warning `unknown_answer_type`, and nothing throws.

### 6. Pricing by resolved model

- `cost = input_tokens * price.in + output_tokens * price.out`, looked up in `price_books` by `model_resolved`. The Jev 1.13 row is $0.042 per million input tokens and $0 for output.
- System One price rows are keyed by exact versioned ID. Alias rows are rejected, because an alias row would misprice runs after the alias moves.
- Unpriced model: in BYO key mode the run succeeds with cost `null` and warning `model_unpriced`. In platform key mode the run is refused with `422 model_unpriced`, because it cannot be billed. The registry sync alerts when a stable model has no price row.
- `usage_events` and `usage_daily` carry the resolved model, so billing, savings and upgrade comparisons can split by model.

### 7. Neutral naming

Code, schemas, columns, error codes and env vars say `systemOne` or `system_one`. UI copy, docs examples and catalog data may say Jev. The SKILL.md description keeps "Jev" so the skill still triggers.

| From | To |
|---|---|
| `packages/jev-client` | `packages/system-one-client` |
| `JevTransport` | `SystemOneTransport` |
| `RunPorts.jev` | `RunPorts.systemOne` |
| `JevResponse`, `JevAnswer` | `SystemOneResponse`, `SystemOneAnswer` |
| `RunResult.cost.jevInputTokens`, `jevCostUsd` | `systemOneInputTokens`, `systemOneCostUsd` |
| `jev_cost_usd` (formula variable) | `system_one_cost_usd` |
| `runs.jev_cost_micro_usd`, `runs.jev_calls` | `runs.system_one_cost_micro_usd`, `runs.system_one_calls` |
| `usage_events.kind` `jev_input_tokens`; `usage_daily` `jev_input_tokens`, `jev_cost_micro_usd` | `system_one_input_tokens`; `system_one_input_tokens`, `system_one_cost_micro_usd` |
| `org_jev_keys` | `org_typesafe_keys` |
| `jev_auth`, `jev_invalid_request`, `jev_rate_limited`, `jev_overloaded`, `jev_unavailable` | `system_one_auth`, `system_one_invalid_request`, `system_one_rate_limited`, `system_one_overloaded`, `system_one_unavailable` |
| `JEV_TRANSPORT` | `SYSTEM_ONE_TRANSPORT` |
| `model_prices` | `price_books` |
| `references/jev-api-contract.md` | `references/system-one-api-contract.md` |

The prefix is `systemOne`, not `model`, because the envelope already carries LLM fields (`counterfactualLlmCostUsd`, `escalationCostUsd`, `comparatorModel`), and "model cost" would be ambiguous next to them.

### 8. Gateways stay out of v1

ADR-011 (proposed) revisits this section: OpenRouter confirmed a System One endpoint on 2026-09-25, and ADR-011 adds it as a second provider through the same SDK transport, as the last sentence below anticipates.

TypeSafe's Python SDK usage page documents OpenRouter and Vercel AI Gateway, each with its own base URL, key and model ID. Cloudflare Workers AI is not documented. SysOne calls TypeSafe server-side, so gateways are out of scope for v1. If one is added later, it is configuration on the existing SDK transport (base URL, key, provider model ID), not a new transport, and the registry maps each canonical model ID to the provider's ID so pinning, pricing and upgrades treat them as one model.

## Options considered

| Option | Pros | Cons |
|---|---|---|
| Constants per model in code | Simple and typed | Every new model is a code change and a release; limits drift from the docs without anyone noticing |
| Read limits and types from `GET /v1/models` | No curation work | Not possible: the endpoint returns only `name`, `description` and `release_date` |
| Classify pinned names by pattern, such as `^[a-z][a-z0-9-]*-\d+\.\d+\.\d+$` | Needs no data | Encodes a naming scheme TypeSafe never promised: gateway IDs and new naming schemes are misread, and an unseen `foo-2.0.0` counts as pinned before anyone has reviewed it |
| Model-prefixed field names (`modelCostUsd`, `model_cost_micro_usd`) | Short | Ambiguous next to the LLM counterfactual and escalation fields |
| Keep the Jev names and rename in v2 | No doc changes now | Needs a v2 API and a migration for a rename that costs nothing before the freeze |
| Curated registry, profile-driven limits and neutral names (chosen) | A new model is a data change; contracts stay model-agnostic | The platform admin must review each new model's entry |

## Consequences

- Adding a System One model that uses existing question types is a data change (registry row and price row) plus recorded fixtures and `pnpm smoke` on the new ID. No code or contract change.
- The platform admin gets a Models review page in Phase 3, and alerts for unreviewed names, contract changes and stable models with no price.
- The renames cost nothing now and would be breaking after the freeze. Every doc applies them in the same pass, and ADR-001's package row is amended.
- Fixtures must include a response whose `model` differs from the requested alias. Tests must cover the pinned classification table above, and preflight with a fake 16k profile blocking a 20k state.
- Ownership: Platform / Tenancy owns `system_one_models` and the registry sync and contract watch jobs. Core Engine owns the question-type modules, preflight and lints, and `packages/system-one-client`.
- Docs that carry the detail: [system-one-models.md](../../.claude/skills/sysone-builder/references/system-one-models.md) (profiles, lifecycle, detection, seed table, upgrade flow), [system-one-api-contract.md](../../.claude/skills/sysone-builder/references/system-one-api-contract.md) (API-wide rules, errors, pricing formula), [spec-schema.md](../../.claude/skills/sysone-builder/references/spec-schema.md) (`QuestionTypeModule`), [architecture.md](../../.claude/skills/sysone-builder/references/architecture.md), [data-model.md](../../.claude/skills/sysone-builder/references/data-model.md), [savings-model.md](../../.claude/skills/sysone-builder/references/savings-model.md), [conventions.md](../../.claude/skills/sysone-builder/references/conventions.md) and [testing.md](../../.claude/skills/sysone-builder/references/testing.md).

## Rollout

- **Phase 0 part two:** `ModelProfile`, `ModelCatalog`, `QuestionTypeModule`, the profile-taking signatures and every rename land before the contracts freeze. This ADR is accepted in the same step.
- **Phase 1:** the seed catalog in `packages/core/src/models/catalog.ts`, the `system_one_models` table, the registry sync, the alias probe and the contract watch job.
- **Phase 3:** the platform Models pages, `GET /api/v1/models` and the model lints in the editor.
- **Phase 3b:** the model upgrade flow (try-model and the Model upgrades report), per ADR-010.
- **Reversal:** the registry is data. A wrong entry is corrected, deprecated or retired by the platform admin, with an audit row. The renames have no reversal cost because no code exists yet.
