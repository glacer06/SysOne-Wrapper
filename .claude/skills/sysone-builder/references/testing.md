# Testing and verification

## Layers

| Layer | Tool | Runs |
|---|---|---|
| Unit (core, jev-client, billing math) | Vitest | Every PR |
| Contract (fixtures vs zod, OpenAPI snapshot) | Vitest | Every PR |
| Tenancy (cross-tenant suite, RLS) | Vitest + Postgres container | Every PR |
| Integration (API routes, RBAC, audit, cache) | Vitest + Postgres + mocked transport | Every PR |
| E2E (console, embed) | Playwright, fixture transport | Every PR |
| Live smoke | `pnpm smoke` against Jev | Nightly, and before release; needs `TYPESAFE_API_KEY` |
| Evals | `pnpm eval` | On demand, CI gate on publish-critical sets |
| Load (rate fairness) | k6 | Before Phase 2 exit and before launch |

## Fixtures

- Stored in `packages/jev-client/fixtures/*.json` as `{ request, response }`, keyed by a hash of the request.
- `pnpm fixtures:record` (needs `TYPESAFE_API_KEY`) re-records and scrubs headers and IDs.
- A contract test validates every fixture's response against the zod answer schemas, so SDK or API drift fails CI.
- Minimum set: one of each question type, a multi-stage run, a choice with a "none" option chosen, a noul near 0.5, and 401, 422, 429, 529 errors.

## Router tests

Table-driven, covering every band edge for every type: exactly at `high`, just below, exactly at `medium`, just below, per-option overrides, noul at `trueAt`, `falseAt`, inside each margin, and 0.5. 100% branch coverage is required.

## Cross-tenant suite

Generated from the repository list. For each repository method:

- Called with org A's context, it cannot read or write org B's rows.
- With the repo's org filter bypassed (test hook), RLS alone still returns zero rows.
- Each API route called with org B's token for an org A resource returns 404.

## Security tests

- Vault encrypt/decrypt round trip and KEK rotation.
- Log scrubber: no `sk_`, `pk_`, TypeSafe key material, or raw state in logs.
- Bundle scan: build output of `apps/example-embed` and `packages/react` contains no key patterns.
- Webhook signature rejection for Stripe and plugin webhooks.

## Live smoke (`pnpm smoke`)

Skipped when `TYPESAFE_API_KEY` is missing. Runs one call per question type and one two-stage run, on `jev-latest` and on the pinned version. Asserts response shape, `usage.input_tokens > 0`, and total cost under $0.001.

## Evals (`packages/evals`)

Input: a dataset of `{ state, expected }` per question. Output:

- Per question: accuracy (choice), MAE (score), Brier score (noul), confusion matrix.
- Per band: precision, coverage (share routed `auto`), ECE, reliability table.
- Cost, p50 and p95 latency.

Gates: high-band precision at or above the set's target; no regression beyond the configured margin versus the production version's last eval.

```
pnpm eval --org <slug> --set email-urgency --version 3 --dataset gold
```

## Playwright

- Test-only credentials auth behind `E2E=1`. Fixture transport via `JEV_TRANSPORT=fixture`.
- Core flows: sign in, switch between three orgs, create set, publish, call API, publish v2, API serves v2 with no redeploy, roll back, API serves v1.
- One permissions test per role.
- Playground diff, review queue resolve-to-dataset, Definition Studio happy path, billing upgrade in Stripe test mode, platform impersonation banner.
