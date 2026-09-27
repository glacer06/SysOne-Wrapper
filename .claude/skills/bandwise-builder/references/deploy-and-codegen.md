# Deploy and codegen

Owner: Integrations (`packages/codegen`, `packages/cli`, `packages/client-py`, `examples/*`), with Docs. Platform / Tenancy owns the operations and routes behind these surfaces ([management-api.md](management-api.md)). Core Engine owns `interfaceOf`, `diffInterface` and the `interface.breaking` lint. Console UI owns the app pages, the "Use in your app" tab and the Consumers panel. The Security reviewer reviews codegen output and the standalone export. Phase 4b unless a section says otherwise. Decision record: [ADR-009](../../../../docs/adr/009-app-integration-and-deploy-targets.md).

This file answers one question: how does the right System One code get into a customer's app, stay correct as sets change, and stay managed? The examples use Jev because it is the default model. Nothing here depends on a specific model.

## 1. Integrate flow

Six steps take an app from "no System One code" to a live, typed call site. Each step works from the console, the CLI and the MCP server, because each one is an operation ([headless-and-agents.md](headless-and-agents.md)).

| Step | Console | CLI | MCP tool | Operation |
|---|---|---|---|---|
| 1. Describe the app | App page: language, framework, repo URL | `bandwise init` | none (use the CLI) | `app.create`, `app.update` |
| 2. Find opportunities | "Describe your app" form | `bandwise opportunities add` (from the `bandwise-integrate` skill) | `add_opportunity` | `opportunity.create` |
| 3. Accept one | Opportunities list: accept or reject | `PATCH /api/v1/apps/{id}/opportunities/{oid}` | none | `opportunity.update` |
| 4. Build the set | Definition Studio, prefilled from the opportunity | `bandwise sets create`, `bandwise spec pull\|push\|validate` | `create_set`, `update_draft`, `validate_draft` | `studio.create`, `set.create`, `draft.update` |
| 5. Wire it in | "Use in your app" tab | `bandwise codegen`, then `bandwise check` | `generate_client` | `set.codegen`, `binding.create` |
| 6. Publish | Publish dialog with the Consumers panel | `bandwise publish`, `bandwise promote`, `bandwise rollout set` | `publish`, `promote`, `change_rollout` | `set.publish`, `channel.promote`, `rollout.change` |

- Step 4 follows [definition-studio.md](definition-studio.md). A Studio session started from an opportunity stores its `opportunity_id`, and the opportunity prefills the intent sentence, the state fields and seed examples.
- When the set exists, link it with `opportunity.update` (`setId`, `status: "built"`). The Studio does this when a session that started from an opportunity is promoted.
- Step 1 creates an app and an app token, which need the admin role, so `bandwise init` needs an admin ceiling (section 8).
- Step 6 goes through the normal gates and approvals. An agent's production publish or promotion on a protected or live set waits for a human ([management-api.md](management-api.md#approvals)). Section 8, Go live, lists the production steps: promote, a production token, production codegen, a CI token and the rollout.
- The end-to-end agent version of this flow is flow (b) in [headless-and-agents.md](headless-and-agents.md).

## 2. Apps and opportunities

### Apps

`apps` gains three profile fields ([data-model.md](data-model.md), Apps and integration):

- `language`: `ts`, `py` or `other`. Picks the default codegen target.
- `framework`: free text, for example `nextjs`, `express`, `fastapi`. Picks the recipe in section 10.
- `repo_url`: optional. A label for people. Bandwise never clones or reads it.

### Opportunity contract

An opportunity is one place in an app where a System One decision could replace fragile code or an LLM call. Both producers write the same contract to `app_opportunities`.

```ts
Opportunity = {
  appId: string,
  source: "agent" | "console",
  location: { file: string, lines: string } | null,   // a path and a line range, never file contents
  currentApproach: "regex" | "if_else" | "llm_call" | "manual" | "other",
  decisionSummary: string,                               // plain language, for example "decide whether an inbound email needs a reply today"
  primitiveGuess: QuestionTypeId,                        // "noul" | "choice" | "score" in v1
  pattern: Pattern,                                      // section 3
  tenSecondFit: boolean,                                 // passes the Studio's 10-second fit test
  status: "proposed" | "accepted" | "rejected" | "built",
  setId: string | null,
}

Pattern = "fan_out" | "confidence_routing" | "composite_scoring" | "intent_routing"
        | "cascade" | "top_choice" | "keep_in_code"
```

The server adds `id`, `created_by_user_id`, `created_by_token_id` and `created_at`. Status moves `proposed` to `accepted` or `rejected`, and `accepted` to `built` once a set is linked.

### Producers

**Agent path.** The customer-side `bandwise-integrate` skill (shipped in Phase 7, [headless-and-agents.md](headless-and-agents.md)) runs in the customer's repo:

1. It loads the official `typesafe` skill and runs its two starter prompts from `docs.typesafe.ai/agent-skill.md`: "explore the project and find opportunities for using intelligent judgement to stand in for complex parsing or other fragile code", and "analyze my code and see if there are any applicable cookbooks".
2. For each candidate it applies the 10-second fit test and picks a pattern (section 3).
3. It posts summaries with `bandwise opportunities add` or the MCP tool `add_opportunity`, using an agent token with `apps:write`. It sends a file path and line range, never source code.

**Console path.** The app page has a "Describe your app" form: a description plus optional pasted snippets. `llm-client` drafts opportunities from them with the pattern table in its prompt. Pasted snippets are used for drafting and are not stored; only the drafted summaries are. The drafting call is metered like Studio drafting.

Server-side scanning of customer repos is out of scope until an ADR approves it (PLAN.md, Open items).

## 3. Pattern advisor

Every opportunity and every seeded template carries one `pattern`. The pattern picks the spec skeleton that Studio step 3 starts from ([definition-studio.md](definition-studio.md)). In the console path, `llm-client` picks the pattern with this table in its prompt. In the agent path, the `bandwise-integrate` skill picks it, and cookbook matching stays there, through the official `typesafe` skill. Bandwise keeps no cookbook catalog of its own.

| Pattern | Use when | TypeSafe source | Spec skeleton |
|---|---|---|---|
| `fan_out` | Several independent judgments about the same input, some only relevant in some cases | `docs.typesafe.ai/patterns/fan-out.md` | One spec stage holding every question. Speculative questions get `relevantWhen` and state their premise. Code reads only the applicable answers. |
| `confidence_routing` | One judgment where acting on a wrong answer is costly | `docs.typesafe.ai/patterns/confidence-routing.md` | One gating, thresholded question: high `auto`, medium `review`, low `review` or `fallback` |
| `composite_scoring` | A complex judgment that splits into weighted atomic checks | `docs.typesafe.ai/patterns/composite-scoring.md` | Several noul or score questions, a `composites` block with weights and `levelThresholds`, and `routes` on the composite |
| `intent_routing` | Incoming requests go to different handlers | `docs.typesafe.ai/patterns/intent-routing.md` | A choice over intents with a "none of these" option, `routes` per intent, low band to `review` or `escalate_to_llm` |
| `cascade` | An LLM does the job today and most cases are easy | No pattern page; closest is `docs.typesafe.ai/cookbooks/sde_cascade.md` | The question or questions with low band `escalate_to_llm`, and `savings.kind: "escalation_avoided"` ([savings-model.md](savings-model.md)) |
| `top_choice` | Only the best option matters and a wrong pick is cheap | `docs.typesafe.ai/agent-skill.md` (Common issues) and `docs.typesafe.ai/confidence.md` | A choice with the top-choice preset from [confidence-policy.md](confidence-policy.md): not gating, no thresholds, every band `auto` |
| `keep_in_code` | Arithmetic, dates, exact rules, lookups | `docs.typesafe.ai/concepts/how-to-build-with-system-one.md` | No System One question. The logic stays in app code, or becomes a `checks` entry in a set that has other questions ([spec-schema.md](spec-schema.md)) |

- `keep_in_code` is a valid answer. The advisor says so instead of forcing a question onto a job code does better. The target model's weakness list ([system-one-models.md](system-one-models.md)) is part of that call: counting and date comparison stay in code on `jev-1.13.0`.
- The seeded templates in [definition-studio.md](definition-studio.md) carry the same tag, so a template picked for an opportunity matches its pattern.

## 4. Deploy targets

```ts
DeployTarget = "managed" | "managed_typed" | "standalone"
```

| Target | What the app runs | What it keeps | When to pick it | Status |
|---|---|---|---|---|
| `managed` (default) | `@bandwise/client` or plain HTTP calling `/api/v1` by set ref | Live edits, rollout enforcement, review, the savings ledger, calibration | Any app that can make one HTTP call to Bandwise per decision | Exists (Phase 4 client) |
| `managed_typed` | A generated typed wrapper (section 6) over `@bandwise/client` or `client-py` | Everything `managed` keeps, plus compile-time types and a loud failure on interface changes | The default for TypeScript apps; Python once ADR-009's Python section is accepted | Phase 4b |
| `standalone` | Generated code that calls TypeSafe directly with the customer's own key (section 9) | The questions and thresholds as of export. Review, ledger and calibration only when ingest is on. No live edits, no rollout enforcement. | The app cannot add Bandwise as a runtime hop or subprocessor, or the customer wants a copy they fully own | End of Phase 4b, after ADR-009's Standalone section is accepted |

Build order: `managed`, then `managed_typed`, then `standalone`. Every binding records its target (section 7).

## 5. Set interface and compatibility

App code depends on a set's interface: its input schema, question ids and types, choice option keys, score level counts, composite ids and route outputs. `SetInterface`, `interfaceOf(spec)` and `diffInterface(a, b)` are defined in [spec-schema.md](spec-schema.md), section 11.

**Versions.** Every published version stores `interface_hash` (hash of the canonical `SetInterface` JSON) and `interface_major`. The first published version of a set has major 1. Without a bump, a new version takes the set's current major (the highest it has published), and an additive change only changes the hash. Only an explicit bump raises the major. The major belongs to the version, and published versions are immutable, so a version keeps its major when it is promoted.

**The `interface.breaking` lint.** At publish, core diffs the new interface against the interface each checked channel serves. The checked channels are the target channel, plus production when the target is staging, because a staging version is meant to be promoted. The lint is an error when, for one checked channel, all three hold:

- the set has consumers on that channel: app bindings that are not removed, or apps with runs on that channel in the last 30 days;
- `diffInterface` against that channel's interface reports a breaking change: a removed or renamed question or option, a changed type or level count, a removed route output, or a narrower input schema;
- the new version's major equals the major that channel serves.

The editor clears it by bumping the major with a written reason: the publish input carries `interfaceBump: { reason }`, and the new version gets the set's highest major plus one. A publish with a bump is never a no-op, even when the spec is unchanged. The reason is audited on the release event, and the publish emits `interface.breaking_published` with the affected binding ids ([events.md](events.md)). Additive changes never block. A publish dry run shows the change in `interfaceChange` ([management-api.md](management-api.md#dry-runs)). The lint's inputs are the `PublishCtx` fields in [architecture.md](architecture.md) (Lints).

**Promote.** `channel.promote` runs the same lint against production, using the promoted version's stored major, and takes no bump. If it fails (production gained consumers after the staging publish), publish to staging again with `interfaceBump`, then promote.

**Runtime check.** Clients may send `Bandwise-Interface: <major>`. When the channel's version has a different major, the run returns `409 interface_mismatch`, and the message names the live major ([api.md](api.md)). The server never falls back to an older version in the same major, because that would break rollback and caching. Generated clients always send the header.

Rollback can move a channel back across a major. Apps built for the newer major then get `409 interface_mismatch` until they regenerate or the channel moves forward again. That loud failure is intended. The rollback dry run lists the bindings on the newer major.

**What carries the interface.** The manifest (`GET /api/v1/sets/{ref}/manifest`) and every `RunResult` carry `interfaceMajor` and `interfaceHash`. The manifest also gives codegen the question types, choice option keys, score level counts, composite ids, route outputs and the action enum. It never exposes instructions, criteria or thresholds.

**Caller rule.** Branch on `route` and `effectiveAction` where possible, and act on the route only when `overallAction` is `auto` ([spec-schema.md](spec-schema.md), Routes). Raw `decisions[id].value` is part of the interface, so an app that reads it depends on the major.

## 6. Codegen

`packages/codegen` is pure. It imports only core contracts, does no I/O, and turns a `SetInterface` plus the manifest into files:

```ts
generate(input: {
  setInterface: SetInterface,
  manifest: Manifest,
  lang: "ts" | "py",
  channel: "production" | "staging",
  version: number,
  generatorVersion: string,
}): Record<string, string>          // path -> file contents
```

### TypeScript output

One file per set: `bandwise/generated/<slug>.ts`. It contains:

- a header naming the slug, channel, version, interface major and hash, generator version, and "do not edit";
- a `State` type built from `input.schema`;
- one decision type per question: a choice becomes a union of its option keys, a score becomes `number`, a noul becomes `boolean | null` (null is the low band), and a composite becomes `number` (0 to 1);
- a `Route` union built from the route outputs and `defaultRoute`;
- `run<Slug>(client, state, options?)`, which returns a typed `RunResult` through `@bandwise/client`'s generic `run<T>()` and always sends `Bandwise-Interface`;
- a typed `switch` over the effective action. App code passes one handler per action, so the app owns every side effect and never edits the file.

It holds no questions, instructions, criteria, thresholds or keys.

For the example spec (`templates/question-set.example.json`, slug `email-triage`):

```ts
// Generated by @bandwise/codegen 0.1.0. Do not edit. Regenerate with `bandwise codegen email-triage`.
// set: email-triage  channel: production  version: 7  interface: 2 (sha256:4f1c9e...)
import type { BandwiseClient, RunOptions, RunResult } from "@bandwise/client";

export const SET = "email-triage";
export const INTERFACE_MAJOR = 2;
export const INTERFACE_HASH = "sha256:4f1c9e...";

export type State = {
  email: { from: string; subject: string; body: string; signature?: string };
  me: { name?: string; known_contacts?: string[] };
};

export type Decisions = {
  real_person: boolean | null;
  someone_waiting: boolean | null;
  cost_of_ignoring: number;
  category: "work_request" | "scheduling" | "personal" | "newsletter" | "transactional" | "none_of_these";
  work_type: "decision" | "information" | "review" | "none_of_these";
  urgency: number;
};

export type Route = "urgent" | "read_later" | "normal";

export type EmailTriageResult = RunResult<Decisions, Route>;

export function runEmailTriage(client: BandwiseClient, state: State, options?: RunOptions) {
  return client.run<EmailTriageResult>(SET, state, { ...options, interfaceMajor: INTERFACE_MAJOR });
}

export function onEmailTriageAction<T>(result: EmailTriageResult, handlers: {
  auto: (r: EmailTriageResult) => T;             // act on r.route and r.decisions
  review: (r: EmailTriageResult) => T;           // a person decides in the review queue
  escalate_to_llm: (r: EmailTriageResult) => T;  // the server escalated; do not act on these decisions
  fallback: (r: EmailTriageResult) => T;         // keep your existing path
}): T {
  switch (result.overallAction) {                // the most conservative effectiveAction
    case "auto": return handlers.auto(result);
    case "review": return handlers.review(result);
    case "escalate_to_llm": return handlers.escalate_to_llm(result);
    case "fallback": return handlers.fallback(result);
  }
}
```

What `@bandwise/client` must export for this (Phase 4, Embed Kit): `BandwiseClient`, `RunOptions` (`channel?`, `idempotencyKey?`, `externalRef?`, `interfaceMajor?`, `includeProbabilities?`) and a generic `RunResult<D, R>` whose `decisions[k].value` is `D[k]` and whose `route` is `R | null`. See [savings-model.md](savings-model.md) for the untyped envelope.

### Python output (behind ADR-009)

Needs the ADR-009 Python section accepted first. `bandwise/generated/<slug_with_underscores>.py` holds the same header, pydantic v2 models for `State` and `Decisions`, `Route` as a `Literal`, and `run_<slug>(client, state)` over the client generated in `packages/client-py`. Generated Python passes pyright.

### Surfaces

| Surface | Details |
|---|---|
| `GET /api/v1/sets/{ref}/codegen?lang=ts\|py&channel=&version=&appId=&target=` | Operation `set.codegen`, scope `sets:read`. Defaults: `lang=ts`, `channel=production`, the version that channel serves, `target=managed_typed`. Returns `{ files, lock, bindingId? }`, where `lock` is the lock entry in section 8. With `appId` it also records a binding and needs `apps:write`. A channel with no published version returns `404 not_found`. `target=standalone` is section 9. |
| `bandwise codegen <slug> --lang ts\|py [--channel <c>] [--version <n>] [--target standalone] [--app <id>]` | Calls the endpoint, writes the files and `.bandwise/lock.json`, and records a binding. Channel and version map to the query parameters. Generate for the channel the app's token is bound to. |
| MCP `generate_client` | Returns the files and the lock entry. The coding agent writes them into the repo. |
| Console "Use in your app" tab | Shows the generated file for the app's language, a copy and download button, the plain HTTP snippet, and a "Use in app" action that records a binding |

## 7. App bindings

`app_set_bindings` records which app uses which set, on which channel, through which target and code ([data-model.md](data-model.md)): `app, set, channel, target, runtime (ts|py|http), interface_major, interface_hash, generator_version, source_ref (commit or PR URL), created_by_user_id, created_by_token_id, created_at, removed_at`.

- **Writers:** `bandwise codegen`, the codegen endpoint when `appId` is passed, and the console "Use in app" action. All three go through `binding.create`.
- **History:** a new binding for the same app, set and channel sets `removed_at` on the previous row and inserts a new one. The table is the deploy history. There is no deployment status machine and no app-wide rollback; rollback stays a pointer move per set.
- **App page:** the sets in use, channel, served version, interface major, and last run (from `runs.app_id`).
- **Set page:** a Consumers panel lists bindings plus apps with runs in the last 30 days. The publish dialog shows it, and it feeds `interface.breaking` (section 5).
- **Audit and events:** audit actions `binding.create` and `binding.remove`; event `binding.created` ([events.md](events.md)).

## 8. Delivering code into an app repo

Code reaches a customer repo only through a local write. Bandwise needs no repo access.

1. `bandwise codegen email-triage --lang ts` writes `bandwise/generated/email-triage.ts` and updates `.bandwise/lock.json`, then records a binding.
2. The developer or their coding agent reviews the diff and commits with their own git credentials.
3. `bandwise check` runs in their CI.

`.bandwise/lock.json` holds one entry per set:

```json
{
  "sets": [
    {
      "slug": "email-triage",
      "channel": "production",
      "version": 7,
      "interfaceMajor": 2,
      "interfaceHash": "sha256:4f1c9e...",
      "generatorVersion": "0.1.0",
      "fileHashes": { "bandwise/generated/email-triage.ts": "sha256:9a02b7..." }
    }
  ]
}
```

`bandwise check` reads the lock and calls `set.get` for each set:

| Result | Exit code |
|---|---|
| Lock matches the channel's live major, and every generated file matches its hash | `0` |
| Only the interface hash changed (an additive publish). Prints a notice to regenerate for new options. | `0` |
| The channel's live major differs from the lock's `interfaceMajor` | `2` |
| A generated file was edited, deleted or is missing from the lock | `2` |
| Auth, network or unknown set | `1` |

A GitHub Actions job:

```yaml
name: bandwise
on: [pull_request]
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npx -y @bandwise/cli check
        env:
          BANDWISE_TOKEN: ${{ secrets.BANDWISE_TOKEN }}
          BANDWISE_BASE_URL: ${{ vars.BANDWISE_BASE_URL }}
```

- `BANDWISE_TOKEN` here is an agent token with `sets:read` only. Agent tokens expire within 90 days, so CI tokens need rotation ([security.md](security.md)).
- Phase 5 publishes a GitHub Action that runs `bandwise check` and comments `bandwise spec diff` on PRs.
- A hosted GitHub App that opens PRs is deferred. It adds a `contents:write` surface and needs its own ADR and Security reviewer sign-off first ([PLAN.md](../../../../docs/PLAN.md), Open items).

### `bandwise init`

`bandwise init` sets up an app repo in one command:

1. Uses the chosen profile, or `BANDWISE_TOKEN` and `BANDWISE_BASE_URL`.
2. Creates the app through `app.create`, with `language` and `framework` read from `package.json` or `pyproject.toml` and `repo_url` from the git remote.
3. Creates an `sk_test_` app token with scopes `run` and `feedback:write`, bound to the `staging` channel, through `app_token.create`, and prints the secret once. It never writes the secret to a tracked file. The developer stores it in the app's secret store as `BANDWISE_APP_TOKEN`. `feedback:write` is there so the recipes in section 10 can report outcomes from the first day. On an `sk_test_` staging token it is not a gated write scope, so an agent needs no approval for this step ([management-api.md](management-api.md), Catalog). Any other write scope (`runs:write`, or `feedback:write` on a live token) needs one.
4. Writes `bandwise.config.json` ([headless-and-agents.md](headless-and-agents.md), Specs as code), including `"app": "<appId>"` so later `bandwise codegen` calls record bindings without `--app`.
5. Adds `@bandwise/client` to the app's dependencies.
6. With `--set <slug>`, runs `bandwise codegen <slug> --channel staging` and writes one typed call site from the matching recipe (section 10) into a new file it names in its output. It never edits existing files.

`app.create` and `app_token.create` need the admin role, so `bandwise init` needs a token with `apps:write` and an admin ceiling. An agent with a lower ceiling gets `403 insufficient_scope` at step 2. Then a person with the admin role runs `bandwise init`, or creates the app and its token in the console and the agent runs `bandwise init --app <appId>`, which skips steps 2 and 3.

### Go live

The `sk_test_` token from `bandwise init` runs only on staging. These steps move an app to production. Each is an operation, so a person or an agent can run them headlessly.

1. **Promote.** `bandwise promote <slug>` (`channel.promote`) points production at the version staging serves. The first promote creates the production pointer at `inactive`, so production runs return `409 set_not_live` until step 5. Promote first, because codegen for a channel with no version returns `404 not_found`.
2. **Production app token.** `bandwise apps tokens create <appId> --prefix sk_live_ --channel production --scopes run,feedback:write` (`app_token.create`) creates an `sk_live_` token and prints it once. Store it as `BANDWISE_APP_TOKEN` in the production secret store. `feedback:write` on a live token is a write scope, so an agent needs an approval.
3. **Production codegen.** `bandwise codegen <slug> --channel production` (`set.codegen` with the app id from `bandwise.config.json`) writes the generated file and the lock for production and records a production binding. Without that binding, `interface.breaking` sees no production consumer until the app's first production runs. Commit and deploy.
4. **CI token.** `bandwise tokens create --name ci --scopes sets:read` (`agent_token.create`) mints the token that `bandwise check` uses in CI. Store it as `BANDWISE_TOKEN`. `sets:read` is not a write scope, so it needs no approval. It expires within 90 days, so rotate it.
5. **Roll out.** `bandwise rollout set <slug> --channel production --stage shadow --reason "..."`, then `controlled` and `full` as the gates allow ([confidence-policy.md](confidence-policy.md)). In `shadow` every `effectiveAction` is `fallback`, so the deployed app keeps its existing path while Bandwise measures. Moves into `controlled` or `full` need an approval for an agent.

## 9. Standalone export (behind ADR-009, last in Phase 4b)

Needs the ADR-009 Standalone section accepted first. It is built last in Phase 4b.

The export is `set.codegen` with `target=standalone` (`bandwise codegen <slug> --target standalone`). Because it contains the full spec, it is limited to console sessions and agent tokens, needs the editor role, and is audited even though the operation is read-only. App tokens cannot request it. Until the ADR-009 Standalone section is accepted, `target=standalone` returns `404 not_found` ([management-api.md](management-api.md), Apps and integration).

Per set it writes:

- **One constants file**, `typesafe/<slug>.questions.ts` or `.py`, with every question, instruction, criterion, threshold, weight and route, and a pinned model. This is the single reviewable constants file TypeSafe recommends. It is generated from the spec, read-only, and regenerated, never hand-edited (golden rule 10).
- **A band and route helper** with those constants inlined. It is golden-tested against `packages/core` on the router table: the router test inputs must give the same bands, effective actions and routes ([testing.md](testing.md), Codegen tests).
- **A call wrapper** over `@typesafe-ai/sdk` (TypeScript) or `typesafe-sdk` (Python, imported as `typesafe_sdk`). It reads the customer's own server-side key from `TYPESAFE_API_KEY`.
- **Provider** (ADR-011, proposed). The export may target OpenRouter instead of TypeSafe: `--provider openrouter` writes the wrapper with an explicit `baseURL: "https://openrouter.ai/api"` (`base_url` in Python), reads the customer's key from `OPENROUTER_API_KEY`, and uses the model id from the set's OpenRouter route row (for example `typesafe/jev-1.13`). Everything else is the same SDK and the same constants file. The route must be pinned, like any exported model, so until an OpenRouter route row is pinned the export refuses `--provider openrouter` (see [system-one-models.md](system-one-models.md), section 15).

Rules:

- The model must be pinned. The export refuses a moving model.
- Bandwise never exports an org's stored TypeSafe or OpenRouter key. Standalone code reads the customer's own env key.
- Optional ingest: `POST /api/v1/runs/ingest` with an `sk_` token holding `runs:write` sends `{ setRef, version, model, answers, usage, latencyMs, stateHash, state? }`, where `state` is already redacted ([api.md](api.md)). Ingested runs have `runs.source = "ingest"` and keep the ledger, review and calibration working.
- What standalone gives up: live edits, rollout enforcement and the kill switch, and review items unless ingest is on. Record the binding with target `standalone` so the set page still shows the consumer.

## 10. Integration recipes (Phase 4)

These replace the old "Quickstart docs" item. Each recipe runs server side with an `sk_` app token (Mode A in [architecture.md](architecture.md), Embed kit), sends an `Idempotency-Key`, branches on the effective action, and reports the outcome later with feedback. In every recipe, `fallback` means keep the existing path.

Environment: `BANDWISE_BASE_URL` and `BANDWISE_APP_TOKEN` (the `sk_` token, with scope `run`, plus `feedback:write` to report outcomes). Never ship the token to the browser.

### Next.js route handler

```ts
// app/api/triage/route.ts
import { createClient } from "@bandwise/client";
import { runEmailTriage, onEmailTriageAction } from "@/bandwise/generated/email-triage";

const bandwise = createClient({ baseUrl: process.env.BANDWISE_BASE_URL!, token: process.env.BANDWISE_APP_TOKEN! });

export async function POST(req: Request) {
  const { messageId, email, me } = await req.json();
  const result = await runEmailTriage(bandwise, { email, me }, {
    idempotencyKey: `triage:${messageId}`,   // a retry returns the same runId
    externalRef: messageId,                  // feedback can match the run by this later
  });
  await onEmailTriageAction(result, {
    auto: (r) => applyLabel(messageId, r.route),
    review: () => markPending(messageId),
    escalate_to_llm: () => markPending(messageId),
    fallback: () => legacyTriage(messageId, email),
  });
  return Response.json({ runId: result.runId, action: result.overallAction });
}
```

Later, when the user moves the message to another folder, report what was true:

```ts
// lib/bandwise-feedback.ts (same client setup as above)
export async function reportCategory(messageId: string, category: string) {
  await bandwise.reportFeedback([{
    externalRef: messageId,
    target: { decisionId: "category" },
    observed: category,
    source: "app",
    observedAt: new Date().toISOString(),
    idempotencyKey: `fb:${messageId}:category`,
  }]);
}
```

### Express

```ts
import express from "express";
import { createClient } from "@bandwise/client";
import { runEmailTriage } from "./bandwise/generated/email-triage";

const bandwise = createClient({ baseUrl: process.env.BANDWISE_BASE_URL!, token: process.env.BANDWISE_APP_TOKEN! });
const app = express().use(express.json());

app.post("/triage", async (req, res) => {
  const { messageId, email, me } = req.body;
  const r = await runEmailTriage(bandwise, { email, me }, { idempotencyKey: `triage:${messageId}`, externalRef: messageId });
  if (r.overallAction === "auto") await applyLabel(messageId, r.route);
  else if (r.overallAction === "fallback") await legacyTriage(messageId, email);
  else await markPending(messageId);           // review or escalate_to_llm: do not act on the answer
  res.json({ runId: r.runId, action: r.overallAction });
});
```

### Plain HTTP (curl)

```sh
curl -sS -X POST "$BANDWISE_BASE_URL/api/v1/sets/email-triage/run" \
  -H "Authorization: Bearer $BANDWISE_APP_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: triage:msg_8812" \
  -H "Bandwise-Interface: 2" \
  -d '{ "state": { "email": { "from": "ana@acme.com", "subject": "Re: contract", "body": "..." }, "me": { "name": "Nick" } },
        "options": { "externalRef": "msg_8812" } }' \
  | jq '{ runId, overallAction, route }'

curl -sS -X POST "$BANDWISE_BASE_URL/api/v1/feedback" \
  -H "Authorization: Bearer $BANDWISE_APP_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "items": [ { "externalRef": "msg_8812", "target": { "decisionId": "category" }, "observed": "newsletter",
                     "source": "app", "observedAt": "2026-09-26T10:00:00Z", "idempotencyKey": "fb:msg_8812:category" } ] }'
```

Branch on `overallAction`: act on `route` only when it is `auto`; keep the existing path on `fallback`; do not act on `review` or `escalate_to_llm`.

### Review outcomes

When `overallAction` is `review`, a person decides in the review queue. The app learns the outcome in one of two ways. It can poll `GET /api/v1/runs/{id}` (`run.get`, scope `runs:read`), which lists the run's review items with their status and resolution. Or it can read `review.resolved` from the event feed (`event.list`, scope `events:read`), which an `sk_` token sees only for its own app's runs ([events.md](events.md)). Add the scope to the app token that needs it. Org webhooks replace polling in Phase 5.

### Python httpx (until `client-py` exists)

```python
import os
import httpx

BASE = os.environ["BANDWISE_BASE_URL"]
AUTH = {"Authorization": f"Bearer {os.environ['BANDWISE_APP_TOKEN']}"}

def triage(message_id: str, state: dict) -> dict:
    r = httpx.post(
        f"{BASE}/api/v1/sets/email-triage/run",
        json={"state": state, "options": {"externalRef": message_id}},
        headers={**AUTH, "Idempotency-Key": f"triage:{message_id}", "Bandwise-Interface": "2"},
        timeout=10.0,
    )
    r.raise_for_status()                      # 409 interface_mismatch means regenerate or update the major
    result = r.json()
    action = result["overallAction"]
    if action == "auto":
        apply_label(message_id, result["route"])
    elif action == "fallback":
        legacy_triage(message_id, state)      # keep the existing path
    else:
        mark_pending(message_id)              # review or escalate_to_llm
    return result
```

Feedback from Python is the same `POST /api/v1/feedback` body as the curl example. On `429`, wait for `Retry-After` and retry with the same `Idempotency-Key`.

`examples/fastapi` arrives with `packages/client-py`, behind ADR-009. `apps/example-embed` stays the Next.js end-to-end target.

## 11. Invariants

- No `sk_` token and no TypeSafe key appears in generated browser code. Generated managed code takes the client as a parameter and holds no secrets. The CI bundle scan covers codegen output ([testing.md](testing.md), Security tests).
- Arithmetic, date logic and exact rules stay in code (`keep_in_code`, and the weakness lints in [architecture.md](architecture.md)).
- Generated files are read-only. They are regenerated, never hand-edited, and `bandwise check` fails when one was edited.
- Managed generated code holds no questions, criteria or thresholds. The spec stays the single reviewable place for them, and publishing still needs no app redeploy.
- Opportunities hold summaries and file locations, never source code.
- The server never falls back to an older version to satisfy `Bandwise-Interface`.
- Bandwise never writes into a customer repo and never exports a stored TypeSafe key.

## Coding-agent prompt skeleton (for the bandwise-integrate skill)

Adapted from the official TypeSafe skill's design order. The customer-facing `bandwise-integrate` skill (Phase 7) opens every integration with this:

```
Use the TypeSafe skill and the bandwise-integrate skill. Before writing code:
1. Read docs.typesafe.ai/llms.txt, then the SDK or HTTP API page and the primitive pages you need.
2. Behaviour: <what the app shows, selects, changes or hands off>.
3. List the judgments, one per question, and mark what stays in code (rules, calculations, lookups, execution, policy).
4. Draft instructions and criteria, with a no-match option on every Choice.
5. Ask them all over <state> in one request. Split only when one answer decides the next request.
6. Put questions and thresholds in the Bandwise spec file bandwise/sets/<slug>.json; thresholds stay TODO until tested on a labeled set.
Use only fields you have read on the API page.
```
