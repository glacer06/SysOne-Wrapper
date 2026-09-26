# ADR-009: App integration, deploy targets and interface versioning

- **Status:** accepted (decided by Nick, 2026-09-26), except the Python target and the Standalone target sections, which stay proposed. Each needs separate acceptance before Phase 4b builds it.
- **Date:** 2026-09-26
- **Owner:** Architect / Lead
- **Contract impact:** `SetInterface`, `Opportunity`, `DeployTarget`, new manifest fields, `RunResult.interfaceMajor` and `interfaceHash`, new tables `app_opportunities` and `app_set_bindings`, new version columns `interface_hash` and `interface_major`, new scope `runs:write`, new `runs.source` value `ingest`.

## Context

Nick asked that SysOne "setup, manage and deploy the right Jev code for apps that want to use Jev effectively." Before this ADR:

- SysOne started from a question set, never from an app. An `apps` row held only tokens and allowed origins, and nothing helped find where a System One decision fits in an app.
- The only client was an untyped TypeScript `run(setRef, state)`. The official JS SDK infers answer types from the questions, and the Python SDK has typed classes, so moving from the SDK to SysOne cost developers type safety. Python apps got no client at all.
- Nothing warned an app when a publish renamed or removed an option it branches on. Channels move to any newly published version, so an app checking `decisions.category.value === "newsletter"` would silently take the wrong branch after an editor renamed the option to `bulk_mail`.
- Nothing recorded which apps use which sets, on which channel, through which code.
- Every app had to call `/api/v1` at runtime. There was no way to export a set as code that calls TypeSafe directly, and no way to bring runs made outside SysOne back into the ledger, review queue or calibration.
- TypeSafe advises keeping questions and thresholds in one reviewable place in code. Golden rule 10 says they live in the spec, not in code, so an agent following it would refuse to emit that file.

## Decision

### 1. Integrate flow and opportunities

The integrate flow has six steps: describe the app, find opportunities, accept one, build the set in the Definition Studio (prefilled from the opportunity), wire it in, and publish.

`app_opportunities` records proposals from two producers that share one contract:

- **Agent path:** the customer-side `sysone-integrate` skill runs in the customer's repo, loads the official typesafe skill, and uses its "find opportunities" and "applicable cookbooks" prompts. It posts summaries, never source code, with scope `apps:write`.
- **Console path:** a "Describe your app" form, where `llm-client` drafts opportunities from a description plus any pasted snippets.

Server-side scanning of customer repos is out of scope until an ADR approves it.

The pattern advisor tags each opportunity with one pattern from the enum below and the spec skeleton it implies. `fan_out`, `confidence_routing`, `composite_scoring` and `intent_routing` link to TypeSafe's pattern pages under `docs.typesafe.ai/patterns`. `cascade` (escalate low-confidence cases to an LLM) and `top_choice` (take the best option without thresholds, as TypeSafe's confidence guide suggests when only the best option matters) have no pattern page of their own. `keep_in_code` is a valid answer: arithmetic, date logic and exact rules stay in code. Cookbook matching stays in the agent path, through the official skill.

```ts
Opportunity = {
  appId: string,
  source: "agent" | "console",
  location: { file: string, lines: string } | null,
  currentApproach: "regex" | "if_else" | "llm_call" | "manual" | "other",
  decisionSummary: string,
  primitiveGuess: QuestionTypeId,
  pattern: "fan_out" | "confidence_routing" | "composite_scoring" | "intent_routing" | "cascade" | "top_choice" | "keep_in_code",
  tenSecondFit: boolean,                // passes the Studio's 10-second fit test
  status: "proposed" | "accepted" | "rejected" | "built",
  setId: string | null,
}
```

### 2. Deploy targets

```ts
DeployTarget = "managed" | "managed_typed" | "standalone"
```

| Target | What the app runs | What it keeps | When |
|---|---|---|---|
| `managed` (default) | `@sysone/client` or plain HTTP calling `/api/v1` by set ref | Live edits, rollout enforcement, review, the savings ledger, calibration | Exists |
| `managed_typed` | A generated typed wrapper over `/api/v1` | Everything `managed` keeps, plus compile-time types | Phase 4b |
| `standalone` | Generated code that calls TypeSafe directly with the customer's own key | The questions and thresholds as of export; review, ledger and calibration only when ingest is on; no live edits and no rollout enforcement | End of Phase 4b, after separate acceptance |

Build order: `managed`, then `managed_typed`, then `standalone`.

### 3. Set interface and compatibility

```ts
SetInterface = {
  inputSchema: JSONSchema7,
  questions: Array<{ id: QuestionId, type: QuestionTypeId, options?: string[], levels?: number }>,
  composites: string[],
  routeOutputs: string[],
}
```

- Pure functions `interfaceOf(spec)` and `diffInterface(a, b) -> { breaking[], additive[] }`. Breaking means removing or renaming a question or option, changing a type or a level count, removing a route output, or narrowing the input schema.
- Versions store `interface_hash` and `interface_major`.
- The publish lint `interface.breaking` is an error when the channel's set has consumers (app bindings, or runs with an `app_id` in the last 30 days) and the major is unchanged. The editor clears it by bumping the major with a written reason, which is audited.
- `RunResult` carries `interfaceMajor` and `interfaceHash`. The manifest gains what codegen needs: question types, choice option keys, score level counts, composite ids, route outputs, the action enum, `interfaceMajor` and `interfaceHash`. It still exposes no instructions, criteria or thresholds.
- Clients may send `SysOne-Interface: <major>`. If the channel's version has a different major, the API returns `409 interface_mismatch` with the current major. The server never falls back to an older version in the same major, because that would break rollback and caching.
- Caller rule: branch on `route` and `effectiveAction` where possible. Raw `decisions[id].value` is part of the interface.

### 4. Codegen, TypeScript first

`packages/codegen` is pure: `SetInterface` plus the manifest in, `Record<path, string>` out. It imports only core contracts.

The TypeScript output, `sysone/generated/<slug>.ts`, contains:

- a `State` type built from the input schema
- one decision type per question: a choice becomes a union of its option keys, a score becomes `number`, and a noul becomes `boolean | null` (null is the low band)
- a `Route` union built from the route outputs
- `run<Slug>(client, state)`, returning a typed `RunResult` through `@sysone/client`'s generic `run<T>()`
- an `on<Slug>Action(result, handlers)` dispatcher that switches on `overallAction` and calls one app-supplied handler per action, so the file stays read-only and the app owns every side effect
- a header naming the slug, channel, version, interface major and hash, generator version, and "do not edit"

It holds no questions, thresholds or keys.

Surfaces: `GET /api/v1/sets/{ref}/codegen?lang=ts|py&channel=&version=&appId=` (scope `sets:read`), `sysone codegen`, the MCP tool `generate_client`, and a "Use in your app" tab in the console.

### 5. Python target

**Needs separate acceptance before Phase 4b builds it.**

- `packages/client-py` is generated from `openapi.json`, not written by hand. Toolchain: httpx, pydantic v2, uv, ruff and pyright in CI.
- The codegen Python target emits pydantic models and a run function over `packages/client-py`.
- `examples/fastapi` is the sample app.
- This is the only place a second toolchain enters the repo. ADR-001 still covers SysOne's own stack.

### 6. App bindings

`app_set_bindings` records `app, set, channel, target, runtime (ts|py|http), interface_major, interface_hash, generator_version, source_ref (commit or PR URL), created_by_user_id, created_by_token_id, created_at, removed_at`.

- Bindings are written by `sysone codegen`, by the codegen endpoint when `appId` is passed, and by the console "Use in app" action. Audit actions are `binding.create` and `binding.remove`.
- The console app page shows the sets in use, channel, served version, interface major and last run.
- The set page has a Consumers panel (bindings plus apps with runs in the last 30 days). It appears in the publish dialog and feeds `interface.breaking`.

### 7. Delivering code into a customer repo

- Code reaches a customer repo only through a local write. `sysone codegen` writes the generated files and `.sysone/lock.json` (`{ slug, channel, version, interfaceMajor, interfaceHash, generatorVersion, fileHashes }`) and records an app binding. The developer or their coding agent commits with their own git credentials, so SysOne needs no repo access.
- `sysone check` runs in the customer's CI. It exits 2 when the lock's interface major differs from the channel's live major, or when a generated file was edited.
- A hosted GitHub App that opens PRs is deferred. It adds a `contents:write` surface, and it needs its own ADR and Security reviewer sign-off first.

### 8. Standalone target

**Needs separate acceptance before Phase 4b builds it.**

- One generated constants file per set (`typesafe/<slug>.questions.ts` or `.py`) holds every question, criterion, threshold and weight, and a pinned model.
- A generated band and route helper with those constants inlined is golden-tested against `packages/core` on the router table.
- Calls go through `@typesafe-ai/sdk` or the Python `typesafe-sdk`, using the customer's own server-side key.
- Optional `POST /api/v1/runs/ingest` (scope `runs:write`, `runs.source = ingest`) keeps the ledger, review and calibration working.
- SysOne never exports an org's stored TypeSafe key. Standalone code reads the customer's own env key.

### 9. Specs as code and golden rule 10

- Customer repo layout: `sysone.config.json`, `sysone/sets/<slug>.json` and `sysone/datasets/<slug>/<name>.jsonl` (drafting and calibration cases only). Commands: `sysone spec pull`, `push` (`--create` for a set that does not exist yet), `diff` and `validate`, and `sysone datasets push`, which imports the dataset files; the server assigns each case's split. Versions record `source` and `source_ref`.
- The spec file is the one reviewable place TypeSafe recommends. SysOne serves it live, so publishing still needs no app redeploy.
- Golden rule 10 gains a clause, not a reversal: questions and thresholds live in the spec, and generated code derives from the spec into one read-only file that is regenerated, never hand-edited.

## Options considered

| Option | Pros | Cons |
|---|---|---|
| Runtime-only managed calls (status quo) | Nothing new to build | Untyped callers; no Python; publishes can break apps silently; customers who cannot add a runtime hop cannot be served |
| Hosted GitHub App with `contents:write` | Opens PRs for the customer | A new security surface Nick did not ask for; a local write plus `sysone check` covers the need |
| Resolve the newest version within a major on the server | Callers keep working across breaking publishes | Breaks rollback and caching semantics; the served version stops matching the pointer |
| Hand-written Python client | Idiomatic from day one | Drifts from the API; generating it from `openapi.json` keeps it in step |
| Typed codegen, interface versioning, bindings and a gated standalone target (chosen) | Apps get types, loud failures and a record of what uses what | Adds a codegen package, a CLI surface and, if accepted, a Python toolchain |

## Consequences

- Developers keep type safety when they move from the official SDK to SysOne, and a publish that would break a bound app fails loudly instead of silently.
- Editors see which apps a publish will hit before they publish.
- Rollback stays a pointer move per set. App bindings give the history, so no deployment status machine or app-wide rollback is needed.
- Integrations owns `packages/codegen`, `packages/client-py`, `packages/cli` and `examples/*`. Core Engine owns the `interface.breaking` lint. The Security reviewer reviews codegen output and the standalone export.
- Tests: a codegen snapshot per seeded template; generated TypeScript passes `tsc --noEmit`; generated Python passes pyright once `client-py` lands; the standalone helper is golden-tested against the core router table; the bundle scan covers codegen output, so no `sk_` or TypeSafe key appears in browser code.
- Docs that carry the detail: [deploy-and-codegen.md](../../.claude/skills/sysone-builder/references/deploy-and-codegen.md) (integrate flow, targets, codegen, bindings, lock file, standalone), [spec-schema.md](../../.claude/skills/sysone-builder/references/spec-schema.md) (`SetInterface`), [headless-and-agents.md](../../.claude/skills/sysone-builder/references/headless-and-agents.md) (CLI and specs as code), [api.md](../../.claude/skills/sysone-builder/references/api.md) (manifest, `SysOne-Interface`, ingest), [data-model.md](../../.claude/skills/sysone-builder/references/data-model.md), [security.md](../../.claude/skills/sysone-builder/references/security.md) and [phase-4b.md](../../.claude/skills/sysone-builder/references/phases/phase-4b.md).

## Rollout

- **Phase 0 part two:** `SetInterface`, `Opportunity` and `DeployTarget` freeze with the other contracts, along with the manifest and `RunResult` interface fields. The core of this ADR is accepted in the same step. The Python target and the Standalone target sections stay proposed.
- **Phase 3:** `sysone spec pull`, `push`, `diff` and `validate`, and `sysone datasets push`.
- **Phase 4b:** in order: app profile fields and opportunities, the pattern advisor, Studio prefill, TypeScript codegen and its surfaces, app bindings, the `interface.breaking` lint and `SysOne-Interface` enforcement, then `sysone init`, `.sysone/lock.json` and `sysone check`. Last, and only after their sections are accepted: the Python client and codegen target, then the standalone export and `POST /api/v1/runs/ingest`.
- **Reversal:** codegen output is read-only and regenerated, so a bad generator version is fixed by releasing a new one and running `sysone codegen` again. Bindings can be removed without touching the set. If the standalone target is rejected, the managed targets are unaffected.
