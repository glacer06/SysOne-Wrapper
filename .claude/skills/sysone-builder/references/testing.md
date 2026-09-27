# Testing and verification

## Layers

| Layer | Tool | Runs |
|---|---|---|
| Unit (core, system-one-client, billing math, learning) | Vitest | Every PR |
| Contract (fixtures vs zod, OpenAPI snapshot) | Vitest | Every PR |
| Parity (operations, routes, OpenAPI paths, MCP tools) | Vitest | Every PR |
| Codegen snapshots | Vitest | Every PR |
| Tenancy (cross-tenant suite, RLS) | Vitest + PGlite (Postgres in WebAssembly, in process, as `sysone_app`) | Every PR |
| Integration (API routes, RBAC, audit, cache, idempotency, approvals) | Vitest + Postgres (PGlite) + mocked transport | Every PR |
| E2E (console, embed) | Playwright, fixture transport | Every PR |
| Live smoke | `pnpm smoke` against every model in the smoke list | Nightly, and before release; needs `TYPESAFE_API_KEY` |
| Contract watch | Platform job diffing TypeSafe's `openapi.json`, `llms.txt` and `models.md` against committed snapshots | Nightly |
| Evals | `pnpm eval` (internal), `sysone eval run` (customers) | On demand; required when publishing to a production pointer in `controlled` or `full` |
| Load (rate fairness) | k6 | Before Phase 2 exit and before launch |

## Fixtures

- Stored in `packages/system-one-client/fixtures/*.json` as `{ request, response, openapiVersion }`, keyed by a hash of the request. The request includes `model`, so the same questions on two models are two fixtures.
- `pnpm fixtures:record [--model <id>] [--provider typesafe|openrouter|vercel]` (needs `TYPESAFE_API_KEY`, `OPENROUTER_API_KEY` for `--provider openrouter`, or `AI_GATEWAY_API_KEY` for `--provider vercel`) re-records, scrubs headers and IDs, and records TypeSafe's `openapi.json` `info.version` with each fixture. Fixtures are stored per provider (ADR-011). The documented OpenRouter example is committed as `packages/core/src/contracts/__fixtures__/openrouter-systemone-response.json`.
- The fixture contract test validates every fixture's response against the `passthrough` zod answer schemas, so new fields pass and a changed shape fails. It also fails when the live `openapi.json` version is newer than the fixtures' version, until they are re-recorded. PR CI reads that version from the committed contract snapshot, so it needs no network.
- Minimum set: one of each question type, a multi-stage run, a choice with a "none" option chosen, a noul near 0.5, a response whose `model` differs from the requested alias (`jev-latest` answered by `jev-1.13.0`), 401, 422, 429 and 529 errors, and an outage (HTTP 503) per provider for the ADR-012 outage rule (`typesafe/outage-503`, `openrouter/outage-503`, `vercel/outage-503`). Vercel AI Gateway (ADR-013) adds `vercel/noul`, `vercel/choice`, `vercel/score` and `vercel/evaluation-fallback`, which the client must reject as `system_one_invalid_response`. Fixtures carry an optional `source` (`recorded`, `hand-authored` or `doc-derived`) and, on a response fixture, optional `responseHeaders`.
- Every row of the errors table in [system-one-api-contract.md](system-one-api-contract.md) has a unit test with a synthetic response, including 400, 403, 404, 408, `APIUserAbortError` and a timeout.
- LLM fixtures live in `packages/llm-client/fixtures/<route>/*.json` as `{ name, route, request, completion | error }`, keyed by a hash of the `LlmCompletionRequest` (model, system, prompt, maxOutputTokens). `FixtureLlmTransport` (subpath `@sysone/llm-client/fixture`) replays them. The committed set is hand-authored from `buildEscalationRequest`: an Anthropic choice and noul escalation, an Anthropic 529, a `typesafe/jev-router` choice and an OpenRouter 402. Transport tests use canned HTTP bodies; no unit test calls Anthropic or OpenRouter.

## Router tests

Table-driven, 100% branch coverage required.

- **Band edges** for every type: exactly at `high`, just below, exactly at `medium`, just below, per-option overrides, noul at `trueAt`, `falseAt`, inside each margin, and 0.5.
- **Effective action:** one test row per row of the normative stage x band x action table in [confidence-policy.md](confidence-policy.md), on the production channel and on staging (no side-effect dispatch unless `dispatchActionsOnStaging`).
- **Relevance:** a decision whose `relevantWhen` fails is `relevant: false`, creates no review item, runs no action, does not lower `runBand` or `overallAction`, and is left out of calibration metrics and savings.
- **Skipped and empty decisions:** a question in a skipped spec stage has no `answers` entry and gives `{ value: null, band: low, relevant: false, action: fallback, effectiveAction: fallback, executed: false }`. A composite with no term left gives the same with `kind: composite` and no `level` ([savings-model.md](savings-model.md)).
- **Composites:** the level picks the action; the band is the minimum band of the question terms (check terms count as `high`); only the band feeds `runBand` ([spec-schema.md](spec-schema.md)).
- **Conservative ordering:** `overallAction` follows `review` > `fallback` > `escalate_to_llm` > `auto`.
- **Unknown answer type:** stored raw, band `low`, `effectiveAction: fallback`, warning `unknown_answer_type`, and nothing throws.

## Cost and savings tests

- Money math follows [savings-model.md](savings-model.md#money-math): integer micro-USD and one `round_half_up` per term. Test vector: 318 input tokens on `jev-1.13.0` (42,000 micro-USD per Mtok) cost 13 micro-USD.
- A run with two System One calls prices each call by its own `modelResolved` and sums the results. When the calls resolve to different models, the run carries warning `model_resolved_mixed`, and the top-level `modelResolved` is the first call's.
- Every `*Usd` field in `RunCost` equals its stored micro-USD integer divided by 1e6.

## Model registry tests

- Pinned classification, from the registry `kind` only ([system-one-models.md](system-one-models.md)):

| Name | Expected |
|---|---|
| `jev-latest` | moving |
| `jev-preview` | moving |
| `jev` | moving |
| `jev-1.13` | moving |
| `jev-1.13.0` | pinned |
| `foo-2.0.0` (unseen) | moving, and the registry sync inserts it as `unreviewed` |

- Preflight uses the profile: a fake profile with a 16k state budget blocks a 20k state with `preflight_too_large`, and the `jev-1.13.0` profile lets the same state through.
- Model lints: `model.unknown`, `model.unreviewed`, `model.not_available_to_org`, `model.deprecated` (warning, then error after `retireAt`), `model.question_type_unsupported` and `model.alias_past_shadow` each fire on a minimal bad spec and stay quiet on a clean one.
- Weakness lints fire only when the profile lists the weakness: a fake profile without `counting` silences `weakness.counting`.
- Alias observation: replaying the alias-move fixture writes one `model_alias_observations` row and emits `model.alias_moved` once.
- Pricing: runs are priced by `model_resolved`; an alias price row is rejected; an unpriced model gives cost `null` and warning `model_unpriced` in BYO key mode and `422 model_unpriced` in platform key mode.

## Cross-tenant suite

Generated from the repository list. For each repository method:

- Called with org A's context, it cannot read or write org B's rows.
- With the repo's org filter bypassed (test hook), RLS alone still returns zero rows.
- Each API route called with org B's token for an org A resource returns 404.

## Security tests

- Vault encrypt/decrypt round trip and KEK rotation.
- Log scrubber: no `sk_`, `pk_`, `sa_live_`, TypeSafe key material, or raw state in logs.
- Bundle scan: build output of `apps/example-embed` and `packages/react`, and generated browser code, contains no key patterns.
- Webhook signature rejection for Stripe and plugin webhooks.
- RLS setting name: every policy and `withTenant` use `app.org_id`. A schema scan fails on any other setting name.
- SDK client construction: a check fails when a `TypeSafeClient` is built without an explicit `logLevel`, or with `debug` in production.
- The test split is never returned by any endpoint: dataset cases, export, features and eval details.
- Agent token role ceiling: demote the user and the token loses the permission on the next request.

## Headless API tests

The surface is in [management-api.md](management-api.md).

- **Parity:** every operation in the registry has a route and an OpenAPI path; every curated MCP tool maps to an operation ([headless-and-agents.md](headless-and-agents.md)).
- A replayed publish with the same `Idempotency-Key` creates no version.
- A replayed run with the same `Idempotency-Key` creates no second `runId`, action or usage event.
- An `If-Match` mismatch on `PUT /draft` or publish returns `412 precondition_failed` with the current ETag.
- An agent publish to a protected set returns `202` with a pending approval and stays pending until a human approves it; the stored input then runs unchanged.
- Moves toward safety (rollback, pause, demote, experiment stop, token revoke) are never gated.
- `rollout.change` risk: `inactive` to `shadow` is normal; `shadow` to `controlled` and any move out of `paused` need an approval. Lowering `agentApprovals` needs an approval even when the setting is `off`.
- A token without the scope gets `403 insufficient_scope` in its own org and `404` for a resource in another org.
- Holdout: per-case calibration results come back only with `includeCases: true`, and those cases are then burned; agent labels do not count toward gates until a human confirms them.

## Policy replay tests

- Re-routing stored answers under a candidate policy makes zero System One calls (the transport's call count stays 0).
- On fixtures, replay under a policy gives the same decisions, bands and effective actions as a live run with that policy.
- Replay reads the stored `checks` and never re-runs checks, so a run whose state was purged replays the same relevance, as long as no condition reads `input`.
- `suggestThresholds` returns `insufficientData` below the label minimum, and otherwise the loosest threshold whose 95 percent Wilson lower bound meets the target ([effectiveness-loop.md](effectiveness-loop.md)).

## Codegen tests

- One snapshot per seeded template, for each target language ([deploy-and-codegen.md](deploy-and-codegen.md)).
- Generated TypeScript passes `tsc --noEmit`.
- Generated Python passes pyright once `packages/client-py` lands.
- The standalone band and route helper is golden-tested against the core router table: the router test inputs give the same bands and routes.

## Live smoke (`pnpm smoke`)

- Skipped when `TYPESAFE_API_KEY` is missing.
- Smoke list: `jev-preview`, `jev-latest`, each pinned version in use by any set, and every registry model with status `preview` or `stable`. `pnpm smoke --model <id>` runs one model. `pnpm smoke --provider openrouter` runs the list through OpenRouter's route rows when `OPENROUTER_API_KEY` is set, and `pnpm smoke --provider vercel` through the Vercel route rows when `AI_GATEWAY_API_KEY` is set. On Vercel the `versioned_model` check is reported as skipped, because Vercel documents no versioned id.
- Per model: one call per question type in the profile's `questionTypes`, and one two-stage run.
- Asserts response shape, `usage.input_tokens > 0`, a versioned ID in the response `model`, and total cost under $0.001 per model.

## Evals (`packages/evals`)

```
pnpm eval --org <slug> --set <slug> --version <n> --dataset <name> [--snapshot <id>] [--model <id>] [--repeats <k>]
```

This command is internal. Customers use `sysone eval run` ([headless-and-agents.md](headless-and-agents.md)).

- Offline by default: the fixture transport answers from recorded fixtures and gives deterministic synthetic answers for the rest (the report says how many calls were synthetic), and the folder store reads `<org>/sets/<set>/v<n>.json` and `<org>/datasets/<name>.jsonl` under `packages/evals/data` (or `--data`). `--transport sdk`, or `SYSTEM_ONE_TRANSPORT=sdk`, runs live and needs `TYPESAFE_API_KEY`, `OPENROUTER_API_KEY` or `AI_GATEWAY_API_KEY` for `--provider`.
- A case is `{ id?, state, expected, tags?, split? }`. `expected` maps a decision id to an option key (choice), `true` or `false` (noul), a level index (score) or a level (composite).
- Evals run on the staging channel in `shadow`, so no action is dispatched. Coverage and review load read the policy `action`.

- Input: a dataset of `{ state, expected }` per question. Without `--snapshot`, the eval takes a new dataset snapshot.
- `--model` evaluates the version's spec under another model without publishing. The model upgrade flow uses it.
- `eval_runs` record `model` and `snapshot_id`.

Metrics:

- Per question: accuracy (choice), MAE (score), Brier score (noul), confusion matrix.
- Per band: precision with its 95 percent Wilson lower bound, coverage (share routed `auto`), review load, ECE, reliability table.
- Cost, p50 and p95 latency.
- Stability, optional. `--repeats <k>` turns it on (off by default; use k = 3). Repeats run on a 10 percent sample of cases, within the eval cost cap. Each repeat adds a throwaway `uid` field to the state, as TypeSafe's consistency cookbooks do. Stability is the share of cases whose value and band stay the same across repeats. It measures sensitivity to an irrelevant field plus repeat variation, not identical-request variation alone.

Gates ([confidence-policy.md](confidence-policy.md), quality targets):

- High-band precision lower bound at or above `highPrecision` in the goal's `QualityTarget`. Below the label minimum the gate returns `insufficient_data`.
- Regression gate: the champion and the candidate are scored on the same snapshot. The candidate's high-band precision lower bound is not below the champion's, its coverage is not below the champion's minus `gate_margins.coverageDrop`, and its review load is not above the champion's plus `gate_margins.reviewLoadRise` (defaults 0.02 and 0.10; [data-model.md](data-model.md)).
- Evals are required when publishing to a production pointer in `controlled` or `full`.

## Load (k6)

- Rate fairness: one noisy org cannot starve another within the global budget.
- A 5,000-case eval in org A does not move org A's production p95 by more than 10 percent.

## Playwright

- Test-only credentials auth behind `E2E=1`. Fixture transport via `SYSTEM_ONE_TRANSPORT=fixture`.
- Core flows: sign in, switch between three orgs, create set, publish, call API, publish v2, API serves v2 with no redeploy, roll back, API serves v1.
- One permissions test per role.
- Playground diff, review queue resolve-to-dataset, Definition Studio happy path, billing upgrade in Stripe test mode, platform impersonation banner.
