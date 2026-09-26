# Phase 1: Core engine and tenant-aware data layer

**Owners:** Core Engine, Platform / Tenancy (schema), QA. **Needs:** Phase 0 contracts.

## Core Engine
- [ ] Spec compiler: `QuestionSetSpec` stage to Jev payload, using SDK helpers `choice()`, `score()`, `noul()` or raw structured payloads
- [ ] Stage orchestrator: `when` conditions, `stateFrom` merges, batch split when a stage exceeds limits
- [ ] Confidence router per `confidence-policy.md`, including per-option overrides, noul bands, run band, rollout stage effects
- [ ] Composites (weighted) and routes
- [ ] Cost and savings math per `savings-model.md` (all three kinds)
- [ ] Token preflight (32k state + longest question, 64k request, 80% warning)
- [ ] Lints from `architecture.md`
- [ ] `authz.ts` role matrix
- [ ] `jev-client`: `SdkTransport`, `FixtureTransport`, error mapping, per-org client cache, `/v1/models` drift helper
- [ ] CLI: `pnpm sysone run spec.json state.json` (fixture by default, live with a key). Demo spec: document evaluator template.

## Platform / Tenancy
- [ ] Full Drizzle schema from `data-model.md` with `org_id` and RLS on every tenant table (migration 0001)
- [ ] `withTenant(ctx, fn)` with transaction-local `set_config`
- [ ] Repositories for every table; no raw `db` export
- [ ] Immutability trigger on published versions
- [ ] Two-org seed
- [ ] Dev implementations: local KEK vault, in-memory limiter and quota

## QA
- [ ] Recorded fixtures (see `testing.md` minimum set)
- [ ] Fixture contract test against zod
- [ ] Cross-tenant suite generator
- [ ] Live smoke script

## Exit gate
- A spec runs end to end against fixtures and returns a valid `RunResult` with bands, actions, cost, and savings.
- Router and compiler at 100% branch coverage.
- Usage events written for every run.
- Cross-tenant suite passes, including with the repo filter bypassed.
- `pnpm smoke` passes when `TYPESAFE_API_KEY` is set.
