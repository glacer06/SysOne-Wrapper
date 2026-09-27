# Spec schema and run contracts

The contract detail that Phase 0 part two freezes. [architecture.md](architecture.md) has `QuestionSetSpec` and the run data flow, [confidence-policy.md](confidence-policy.md) has `ConfidencePolicy` and the effective-action table, and [savings-model.md](savings-model.md) has `RunResult`. This file holds everything those three refer to but do not define. Shapes are TypeScript-style; once they exist, the zod schemas in `packages/core/src/contracts` are the source of truth.

Shared names used below:

```ts
QuestionId  = string                      // ^[a-z][a-z0-9_]{0,63}$
DecisionId  = string                      // a question id or a composite id; one namespace with check ids
Value       = string | number | boolean | null
Band        = "high" | "medium" | "low"
StatePath   = string                      // backtick path syntax: "email.subject", "items[0].sku"
Structured  = string | JsonObject | JsonArray   // instructions and criteria, see architecture.md
```

## 1. RunRequest

What every run surface hands to `runQuestionSet` after auth and parsing.

```ts
RunRequest = {
  setRef: string,                          // slug or set id
  channel?: "production" | "staging",      // sessions and agent tokens only; app tokens use their bound channel
  version?: number | "draft",              // slug@7 or slug@draft
  state: unknown,                          // validated against input.schema
  source: RunSource,                       // set by the adapter from the auth mode, never read from the body
  options: {
    includeProbabilities?: boolean,        // shapes the response only; runs always store full answers
    dryRun?: boolean,                      // compile and preflight only: returns RunDryRunResult (below)
    externalRef?: string,                  // the app's own id, used to match feedback later
    metadata?: { tokensBefore?: number, tokensAfter?: number },   // for context_pruned savings
  },
  idempotencyKey?: string,                 // from the Idempotency-Key header
  interfaceMajor?: number,                 // from the SysOne-Interface header
}

RunSource = "console" | "playground" | "api" | "embed" | "extension" | "mcp" | "eval" | "cli"
// runs.source also has "ingest", which never goes through runQuestionSet
```

Example: the HTTP call and the request the route adapter builds from it.

```
POST /api/v1/sets/email-triage/run
Idempotency-Key: 01J9Z3...
SysOne-Interface: 2

{ "state": { "email": { "from": "ana@acme.com", "subject": "Re: contract", "body": "..." } },
  "options": { "externalRef": "msg_8812" } }
```

```json
{ "setRef": "email-triage", "channel": "production", "state": { "email": { "...": "..." } },
  "source": "api", "options": { "externalRef": "msg_8812" },
  "idempotencyKey": "01J9Z3...", "interfaceMajor": 2 }
```

### Dry run response

`options.dryRun` stops after preflight. There is no run row and no `runId`, so the response is not a `RunResult`:

```ts
RunDryRunResult = {
  dryRun: true,
  setId: string, versionId: string, version: number | "draft",
  model: string,                           // the spec's model, as requested
  profileId: string,                       // the ModelProfile preflight used; for a moving name,
                                           // the profile of its last observed versioned model
  stages: Array<{
    id: string,
    skipped: boolean,                      // its `when` was false on input and checks
    batches: Array<{ request: SystemOneRequest, estTokens: number }>,   // one per request after splitting
  }>,
  limits: { requestTokens: number, statePlusLongestQuestionTokens: number },   // from the profile
  warnings: string[],                      // preflight warnings, dry_run_answers_unknown
}

SystemOneRequest = { state: unknown, model: string, questions: Record<QuestionId, SystemOneQuestion> }
                                           // the API request body (system-one-api-contract.md)
```

- The run response is `RunResult | RunDryRunResult`, discriminated by `dryRun`. `RunResult` has no `dryRun` key, so clients test `r.dryRun === true`, and the route's zod output is a `z.union` of the two.
- `request` is the payload after redaction, exactly as it would be sent. A dry run makes no System One call, writes no run row, records no usage and takes no limiter tokens.
- A spec stage whose `when` reads answers from an earlier spec stage cannot be decided without a call. It is compiled as if its `when` held, merged `answers` are left out of its state and its estimate, and the response carries the warning `dry_run_answers_unknown`.

## 2. Condition

One safe grammar for stage `when`, `relevantWhen`, routes and checks. Conditions are data: no functions, no expressions.

```ts
Condition =
  | { all: Condition[] }
  | { any: Condition[] }
  | { not: Condition }
  | { q: QuestionId, eq: Value } | { q: QuestionId, neq: Value } | { q: QuestionId, in: Value[] }
  | { q: QuestionId, band: Band }
  | { q: QuestionId, gte?: number, lte?: number }          // at least one of the two
  | { composite: string, gte?: number, lte?: number }
  | { check: string }
  | { input: StatePath, eq: Value } | { input: StatePath, neq: Value } | { input: StatePath, in: Value[] }
  | { input: StatePath, exists: boolean }
  | { input: StatePath, matches: string }                  // JS regex syntax with the u flag, max 256 chars, see below
  | { input: StatePath, gte?: number, lte?: number }
```

- `q` with `eq`, `neq` or `in` reads the decision value: the option key for a choice, and `true`, `false` or `null` for a noul. For a score it compares `round_half_up(score)` (`Math.floor(score + 0.5)`), the nearest 0-based level index, so `{ "q": "urgency", "eq": 2 }` matches a score of 1.6 but not 1.4. Truth matching and `FeedbackReport.observed` use the same level index ([effectiveness-loop.md](effectiveness-loop.md)). `band` reads the decision's band.
- `q` with `gte` or `lte` reads the numeric answer: `noul` for a noul, the raw `score` for a score. It is invalid on a choice.
- `composite` reads the composite's 0 to 1 value. `check` is true when that check held.
- `input` reads the validated input before redaction. The input form is how Studio code checks are expressed.
- `matches` takes JavaScript regular expression syntax, compiled with the `u` flag, at most 256 characters. Backreferences (`\1`, `\k<name>`) and lookaround (`(?=`, `(?!`, `(?<=`, `(?<!`) are rejected when the spec is parsed (`matchesPatternProblem` in `packages/core/src/contracts/policy.ts`). With those gone, every pattern fits a linear-time automaton. Core evaluates `matches` with its own pure automaton over this subset, never with the backtracking `RegExp`.
- Conditions read the model's answer before rollout or fallback change anything, so the same state routes the same way in every rollout stage.
- A leaf that points at a question that was not asked (its spec stage was skipped) or at a path that does not resolve is false. `exists: false` is the one leaf that is true in that case.

| Used in | May read |
|---|---|
| `checks[].when` | `input` only |
| `stages[].when` | `input`, checks, answers from earlier spec stages |
| `policies[q].relevantWhen` | `input`, checks, answers of other questions in the run |
| `routes[].when` | everything, including composites |

```json
{ "all": [ { "q": "category", "eq": "work_request" }, { "q": "category", "band": "high" },
           { "not": { "input": "email.from", "matches": "@noreply\\." } } ] }
```

## 3. Check

```ts
Check = { id: string, when: Condition }    // when reads input only
```

Checks run in `core` before any System One call. They hold the judgments that need no model (the Studio's "plain code conditions"). A spec stage whose `when` fails is skipped, so a failed check can avoid the call entirely. A check can also be a 0 or 1 composite term.

```json
"checks": [ { "id": "has_body", "when": { "input": "email.body", "exists": true } },
            { "id": "is_reply", "when": { "input": "email.subject", "matches": "^(Re|RE):" } } ],
"stages": [ { "id": "triage", "when": { "check": "has_body" }, "questions": { "...": {} } } ]
```

## 4. Spec stages and merged state

```ts
stateFrom?: "input" | { merge: { input: true, answers: QuestionId[], probabilities?: boolean } }
```

A merge puts earlier answers under `answers.<qid>` as `{ value, band }`. With `probabilities: true` it also adds `probabilities` (choice and score) or `noul` (noul). `answers` is a reserved top-level state key, so `input.schema` cannot declare it.

```json
{ "email": { "from": "...", "subject": "...", "body": "..." },
  "answers": { "category": { "value": "work_request", "band": "high" } } }
```

A later question reads it with a backtick path such as `` `answers.category.value` ``.

**When to add a second spec stage.** The official typesafe skill: "A second request is warranted when an earlier answer is needed to fetch evidence, construct new state, or determine the next options." In SysOne that means a later question needs new state built from an earlier answer (a `stateFrom` merge) or options that depend on an earlier answer. Otherwise ask every question, including speculative ones, in one spec stage and use `relevantWhen`; ignore uncertainty on unused branches. TypeSafe measured batching as 12.2x cheaper and 10.0x faster with no change in answers (`docs.typesafe.ai/patterns/fan-out.md`, `/cookbooks/parallel_questions.md`). When an app must fetch evidence based on an answer, split the work into two sets and call them in sequence. The lint `stage.needless_second_call` catches the common mistake.

## 5. relevantWhen

`relevantWhen?: Condition` sits on a question's policy. When it is false:

- the decision has `relevant: false` and `effectiveAction: fallback`,
- it creates no review item and runs no action,
- it does not lower `runBand` or `overallAction`,
- it is excluded from calibration metrics and from the savings count `n`.

State the premise in the instructions ("If this email is a work request, ..."), or the lint `relevance.premise_missing` warns.

```json
"policies": { "work_type": { "type": "choice", "gating": true,
  "relevantWhen": { "q": "category", "eq": "work_request" },
  "thresholds": { "high": 0.75, "medium": 0.45 },
  "actions": { "high": { "kind": "auto" }, "medium": { "kind": "review" }, "low": { "kind": "review" } } } }
```

## 6. Routes

```ts
routes?: Array<{ when: Condition, output: string }>
defaultRoute?: string
```

Routes are checked in order and the first match wins. With no match, the route is `defaultRoute`, or `null` when there is none. `RunResult.route` is a single value. Routes are computed in every rollout stage; callers combine the route with `effectiveAction` (for example, act on the route only when `overallAction` is `auto`).

```json
"routes": [ { "when": { "composite": "urgency", "gte": 0.7 }, "output": "urgent" },
            { "when": { "q": "category", "eq": "newsletter" }, "output": "read_later" } ],
"defaultRoute": "normal"
```

## 7. FallbackConfig and EscalationConfig

`ActionRef.config` ([confidence-policy.md](confidence-policy.md)) is a `FallbackConfig` when `kind` is `fallback` and an `EscalationConfig` when `kind` is `escalate_to_llm`.

```ts
FallbackConfig = { kind: "value", value: Value } | { kind: "set", setRef: string } | { kind: "noop" }
```

- `value`: the decision's `value` becomes the configured value. `answers` keeps the raw answer.
- `set`: run another set on the same input as a linked run (below). A fallback set cannot itself use a set fallback (lint `fallback.set_invalid`).
- `noop`: nothing runs; the caller keeps its existing path. This is the default when `config` is omitted.

The configured fallback runs only when the policy action is `fallback` and the rollout stage lets policy actions through ([confidence-policy.md](confidence-policy.md)).

```json
"low": { "kind": "fallback", "config": { "kind": "value", "value": "none_of_these" } }
```

**Set fallbacks.** A set fallback runs inside `runQuestionSet`, before the parent run is persisted, through a port:

```ts
LinkedRunPort = (setRef: string, state: unknown,
                 opts: { channel: "production" | "staging", parentRunId: string, signal: AbortSignal })
              => Promise<RunResult>
// RunPorts.linkedRun?: LinkedRunPort (architecture.md)
```

- It gets the caller's original state, which the linked set validates and redacts under its own spec, and the caller's channel, so the linked set's own pointer and rollout stage on that channel apply. `signal` carries the parent's remaining latency budget.
- The parent waits for it: the linked run finishes before the parent's `RunResult` returns.
- The linked run is persisted as its own run with its own cost and usage, and `runs.parent_run_id` points to the parent run ([data-model.md](data-model.md)). The parent's decision gets `fallbackRunId` ([savings-model.md](savings-model.md)). The decision's `value` does not change; the caller reads the linked result with `GET /api/v1/runs/{fallbackRunId}`.
- If the linked run fails (an error status, `409 set_not_live`, or the budget runs out), or `ports.linkedRun` is missing, the decision keeps its value, `fallbackRunId` points to the failed run when one was written, and the parent run gets the warning `fallback_set_failed`.

```ts
EscalationConfig = {
  model?: string,              // exact comparator model id with a price_books row; default
                               // spec.savings.comparatorModel, else the org's default comparator
  instructions?: Structured,   // added after the question's own instructions
  maxOutputTokens?: number,    // default 256
}
```

- The model must resolve to an exact id with a `price_books` row. The lint `escalation.model_unpriced` is an error ([architecture.md](architecture.md)).
- The LLM gets the question's instructions and criteria, its options or levels, the same redacted state the System One call got, and `instructions`. It must return one value of the question's type: an option key for a choice, `true` or `false` for a noul, or a 0-based level index for a score. `llm-client` validates the reply against that type.
- Core calls `ports.llm` in run step 10, inside the latency budget. When it runs and what a failed call does are in [confidence-policy.md](confidence-policy.md#escalation): a failure sets `effectiveAction` to `review` with the warning `escalation_failed`.
- The result lands on `Decision.escalation` ([savings-model.md](savings-model.md)): `{ model, value, costUsd, status: "ok" | "failed", error?: string }`. `Decision.value` keeps the System One answer and `answers` keeps the raw answer, so precision and agreement keep measuring the System One model. Callers act on `decisions[id].escalation.value` when `effectiveAction` is `escalate_to_llm`.
- Escalation is for question decisions only. The spec schema rejects `escalate_to_llm` in a composite policy, because a composite has no answer type for the LLM to return.

```json
"low": { "kind": "escalate_to_llm", "config": { "model": "claude-haiku-4-5", "maxOutputTokens": 64 } }
```

### Outage rule (ADR-012)

```ts
onUnavailable?: "fallback" | "review" | "escalate_to_llm"   // default "review" (ADR-012 Amendment 1); never "auto"
```

What every gating decision's `effectiveAction` is when System One is unavailable after retries (`system_one_unavailable` or `system_one_overloaded`). The run still returns a `RunResult` with `status: "error"`, the error code, the warning `system_one_outage` and one decision per question and composite, so a caller never gets an empty decision set. `auto` fails the strict schema with the rule id `outage.auto_not_allowed`. The rows by rollout stage are in [confidence-policy.md](confidence-policy.md#outage-behaviour-adr-012-accepted). Pick the path that is safe for the decision: `review` for a payment gate, `fallback` for tagging, `escalate_to_llm` when an LLM answer is acceptable while System One is down. Leaving the field out means `review`, so an outage becomes work for a person, never a decision dropped where nobody looks (ADR-012 Amendment 1). An explicit `fallback` raises the warning `outage.fallback_silent` when a gating decision has no `value` or `set` fallback.

```json
"onUnavailable": "review"
```

## 8. Handler refs

`ActionRef.handler` names a handler id that is globally unique: `<namespace>.<name>`, such as `builtin.slack.notify` or `example.post-webhook`. The namespace is the plugin publisher (`builtin` for built-ins). The plugin registry rejects a duplicate id when it loads plugins, and the lint `action.handler_unknown` blocks publishing a spec whose handler is not installed and enabled for the org. Handlers run after commit, only when `effectiveAction` is `auto`, and are idempotent by `runId:decisionId`.

## 9. QuestionTypeModule and SystemOneAnswer

The v1 question-type union `noul | choice | score` is closed by design. All per-type logic lives in one module per type in `packages/core/src/question-types`. The router, compiler, composites, manifest, editor and Studio iterate this map instead of switching on the type string. A new type is an ADR, one module and one React renderer.

```ts
interface QuestionTypeModule {
  id: QuestionTypeId;                                   // "noul" | "choice" | "score"
  questionSchema: ZodType;                              // this type's QuestionDef variant
  answerSchema: ZodType;                                // this type's SystemOneAnswer variant (passthrough)
  compile(q: QuestionDef): SystemOneQuestion;           // the API question body
  band(answer, policy): { value: Value, band: Band };   // rules in confidence-policy.md
  compositeValue?(answer, term): number;                // 0..1 term value
  lints: Lint[];                                        // type-specific rules
  manifestHint(q: QuestionDef): ManifestQuestion;       // label, options or levels for the embed and codegen
  uiKind: "boolean" | "options" | "scale";              // which React renderer draws it
}

questionTypes: Record<QuestionTypeId, QuestionTypeModule>   // packages/core/src/question-types/index.ts
```

| Module | Decision value | `compositeValue` | `uiKind` |
|---|---|---|---|
| `noul` | `true`, `false` or `null` (low band) | `noul` | `boolean` |
| `choice` | option key | `probabilities[term.option]` | `options` |
| `score` | raw `score`, for example 1.05 | `score / (levels - 1)` | `scale` |

`SystemOneAnswer` is built from [system-one-api-contract.md](system-one-api-contract.md). Every variant uses `passthrough`, so new fields survive, and runs store the raw answer JSON.

```ts
NoulAnswer    = { type: "noul", noul: number }
ChoiceAnswer  = { type: "choice", choice: string, probabilities: Record<string, number>, confidence: number }
ScoreAnswer   = { type: "score", score: number, legend: Record<string, Structured>,
                  probabilities: Record<string, number>, confidence: number }
UnknownAnswer = { type: string }        // a type no module knows; every other field is kept as sent

SystemOneAnswer = NoulAnswer | ChoiceAnswer | ScoreAnswer | UnknownAnswer

SystemOneResponse = { model: string, answers: Record<QuestionId, SystemOneAnswer>,
                      usage: { input_tokens: number, output_tokens: number } }
```

A plain discriminated union would reject a new `type`, so the schema is a union with a fallthrough branch:

```ts
const unknownAnswer = z.object({ type: z.string().refine((t) => !Object.hasOwn(questionTypes, t)) }).passthrough();
const systemOneAnswer = z.union([z.discriminatedUnion("type", [noul, choice, score]), unknownAnswer]);
```

The `refine` matters: without it, a known type that fails its own variant would pass as unknown. With it, that answer is still a parse error, and only a new type falls through.

**Unknown answer type.** The API answers in the type that was asked, so this should never happen. If an answer arrives with a type no module knows, it is stored raw, gets band `low`, `effectiveAction: fallback` and warning `unknown_answer_type`, and nothing throws.

## 10. Composite terms, level and band

```ts
CompositeTerm = { q: QuestionId, weight: number, option?: string }   // option required for a choice
              | { check: string, weight: number }                    // 0 or 1
```

- Term values come from `compositeValue` (0 to 1). A check term is 1 when the check held, else 0.
- The composite value is `sum(weight x termValue) / sum(weight)`. Weights are positive.
- A term whose question is irrelevant or was not asked is left out and the remaining weights are renormalized. If no term is left, the composite is irrelevant too.
- **Level** (magnitude): `levelThresholds` on the value. It picks the action.
- **Band** (certainty): the minimum band of its question terms; check terms count as `high`. Only band feeds `runBand`.
- **Under the rollout table.** In the normative table in [confidence-policy.md](confidence-policy.md), a composite's Band column is its certainty band, and its level picks the policy action. So in `controlled`, a gating composite with a high level and a medium band goes to `review`.
- **No policy.** `policy` is optional. A composite with no policy produces a decision with no `level`, `action: auto`, `effectiveAction: auto` (`fallback` in `shadow`, `paused` and `slug@draft` runs) and `executed: false`, and it counts as not gating. It never feeds `runBand` or `overallAction`, even in a run with no gating decision. Only routes use it.

```json
{ "id": "follow_up", "kind": "weighted",
  "terms": [ { "q": "someone_waiting", "weight": 0.5 },
             { "q": "category", "option": "work_request", "weight": 0.3 },
             { "check": "is_reply", "weight": 0.2 } ],
  "policy": { "type": "composite", "gating": true, "levelThresholds": { "high": 0.7, "medium": 0.4 },
    "actions": { "high": { "kind": "auto", "handler": "builtin.slack.notify" },
                 "medium": { "kind": "review" }, "low": { "kind": "auto" } } } }
```

## 11. SetInterface

What app code depends on. See [deploy-and-codegen.md](deploy-and-codegen.md) for bindings, codegen and the `SysOne-Interface` header.

```ts
SetInterface = {
  inputSchema: JSONSchema7,
  questions: Array<{ id: QuestionId, type: QuestionTypeId, options?: string[], levels?: number }>,
  composites: string[],                  // composite ids
  routeOutputs: string[],                // every route output, plus defaultRoute
}

interfaceOf(spec: QuestionSetSpec): SetInterface                      // pure
diffInterface(a: SetInterface, b: SetInterface): { breaking: string[], additive: string[] }
```

- **Breaking:** removing or renaming a question or option, changing a type or a level count, removing a route output, narrowing the input schema.
- **Additive:** a new question, option, composite or route output, or a wider input schema.
- Versions store `interface_hash` (hash of the canonical `SetInterface` JSON) and `interface_major`. The lint `interface.breaking` is an error when the set has consumers and the major is unchanged. The editor clears it by bumping the major with a written reason, which is audited.

```json
{ "breaking": ["choice option removed: category.newsletter"],
  "additive": ["question added: work_type"] }
```

## 12. schemaVersion and migrateSpec

- Additive fields and new question types do not bump `schemaVersion`.
- A breaking change bumps it and ships a pure `migrateSpec(spec)` from version n to n+1 in `core`. Migration produces a new draft; it never touches a published version.
- Published versions are never rewritten. They keep running under the schema they were published with, so `core` keeps reading every `schemaVersion` it has ever frozen.

## 13. Strict spec schema

The spec zod schema is strict: unknown keys fail validation. Free-form values stay open: `instructions`, `criteria`, `meta`, `input.schema`, adapter `config`, and the handler `config` on an `auto` action. That `auto` config is the only free-form action `config`. The `config` on a `fallback` or `escalate_to_llm` action is typed (section 7), and a `review` action takes no `config` at all, so one fails as an unknown key. Errors use the error envelope's `details` shape ([api.md](api.md)). A `rollout` key names the operation to use instead:

```json
{ "path": "/rollout", "rule": "spec.unknown_key", "severity": "error",
  "message": "rollout is set per channel; use rollout.change" }
```

The rollout stage, the labeling policy and `dispatchActionsOnStaging` are settings of the set and its channel pointers, changed through operations ([management-api.md](management-api.md)), never through the spec.
