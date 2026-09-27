# Events

Owner: Platform / Tenancy. The pull feed ships in Phase 3; org webhooks ship in Phase 5.

Events are the part of SysOne's activity that an agent or an integration is expected to react to: a set was published, a rollout was auto-demoted, a new System One model is available, an approval was decided. The audit log (`GET /api/v1/audit`) records every mutation. Events are the smaller, typed stream on top of it.

## EventEnvelope

```ts
EventEnvelope = {
  id: string,                  // uuidv7; also the feed cursor
  type: EventType,             // from the catalog below
  orgId: string,
  occurredAt: string,          // ISO 8601, UTC
  actor: {
    type: "user" | "agent" | "app" | "system",
    userId?: string,
    tokenId?: string,
    client?: "console" | "api" | "cli" | "mcp" | "extension" | "job",
  },
  subject: { type: string, id: string },   // for example { type: "set", id: "..." }
  data: unknown,               // per type, below; zod-validated
}
```

- Events are written to the `events` table (`id, org_id, type, occurred_at, actor jsonb, subject_type, subject_id, data jsonb`) in the same transaction as the audit row, by `runOperation` ([management-api.md](management-api.md)). Jobs write events with the `system` actor.
- Tenant rules apply: RLS on `org_id` and an index on `(org_id, id)`. Platform-only events have `org_id` null, like platform rows in `audit_log`, so tenant RLS never matches them. They are read only through the platform admin path.
- Events are kept 30 days.
- `data` never carries run state, keys or tokens. It carries ids, versions, stages and metric summaries.

## Catalog

| Type | Emitted by | Subject | Data |
|---|---|---|---|
| `set.published` | `set.publish` | set | `{ channel, version, versionId, fromVersionId, interfaceMajor, interfaceHash, changelog, source }` |
| `release.rolled_back` | `channel.rollback` | set | `{ channel, fromVersionId, toVersionId, toVersion }` |
| `release.promoted` | `channel.promote`, `experiment.promote` | set | `{ channel, fromVersionId, toVersionId, toVersion, experimentId? }` |
| `rollout.changed` | `rollout.change`, including auto-demote | set | `{ channel, from, to, reason }` |
| `rollout.auto_demoted` | gate evaluator and auto-demote job | set | `{ channel, from, to, rule, metrics }` where `rule` is `precision_below_target`, `band_drift` or `model_changed` |
| `rollout.gate_met` | gate evaluator job | set | `{ channel, stage, nextStage, gates }` |
| `eval.completed` | eval job | eval_run | `{ setId, version, datasetId, snapshotId, model, status, metrics }` |
| `job.completed` | any job | job | `{ kind, status, error? }` |
| `review.created` | run pipeline, audit sampler, `studio.request_labels` | review_item | `{ setId, runId, decisionId, kind, reason, band, dueAt }` |
| `review.sla_breached` | review SLA job | review_item | `{ setId, dueAt, assigneeId }` |
| `review.resolved` | `review.resolve`, `review.dismiss`, `review.confirm` | review_item | `{ setId, runId, externalRef, decisionId, kind, status, resolution: { value, execute, failureClass? }, resolvedByUserId?, resolvedByTokenId? }` where `status` is `resolved` or `dismissed`, and `resolution` is null when dismissed |
| `alert.raised` | gate evaluator (`precision_below_target`, `band_drift`, `no_truth_source`), limiter (`rate_headroom`), quota (`quota`), liveness (`set_silent`, ADR-012) and escalation budget (`escalation_over_budget`, ADR-015) jobs | set or org | `{ kind, severity, message, metrics }` where `kind` is `band_drift`, `precision_below_target`, `no_truth_source`, `rate_headroom`, `quota`, `set_silent` or `escalation_over_budget`. `set_silent` fires when a set that normally produces decisions on a channel produced none, or only errors, for its window (default 15 minutes). `escalation_over_budget` fires when a set's escalation spend for the day crosses its daily escalation budget (ADR-015); it alerts only and never stops escalating |
| `model.available` | model registry sync | model | `{ modelId, family, status, releaseDate, candidateSetIds, crossFamilySetIds }` when a model reaches `preview` or `stable`. `candidateSetIds` are the org's live sets pinned to an older model in the same family, or to a model or family in the new model's `supersedes`, whose question types the new model covers. `crossFamilySetIds` is the subset found only through `supersedes`, and it must be a subset of `candidateSetIds` |
| `model.alias_moved` | `RunSink` observation or alias probe | model | `{ provider?, alias, fromResolvedId, toResolvedId, affectedSetIds }`. `provider` is `typesafe` or `openrouter` (ADR-011); absent means `typesafe`. On OpenRouter the ids are OpenRouter ids such as `typesafe/jev-1.13-20260917` |
| `model.deprecated` | model registry | model | `{ modelId, status, retireAt, pinnedSetIds }` |
| `proposal.created` | proposal producers | proposal | `{ setId, kind, metricsDelta }` |
| `experiment.started` | `experiment.start`, or a publish to a live set | experiment | `{ setId, channel, kind, championVersionId, challengerVersionId, samplePct }` |
| `experiment.decided` | `experiment.promote`, `experiment.stop`, experiment scorer job | experiment | `{ setId, outcome, result }` where `outcome` is `promoted` or `stopped` |
| `approval.requested` | approval gate in `runOperation` | approval | `{ opId, requestedByUserId, requestedByTokenId, reason, url, expiresAt }` |
| `approval.decided` | console decision, expiry job | approval | `{ opId, status, decidedByUserId? }` where `status` is `approved`, `rejected` or `expired` |
| `key.invalid` | `system-one-client` on a 401, nightly key check | key | `{ keyLast4, reason }` |
| `interface.breaking_published` | `set.publish` with a major bump on a set with consumers | set | `{ channel, version, fromMajor, toMajor, reason, bindingIds }` |
| `binding.created` | `binding.create`, `set.codegen` with `appId` | binding | `{ appId, setId, channel, target, interfaceMajor }` |

`review.resolved` is emitted once, when an item reaches a final status. An agent token's resolution of an action item waits in `pending_confirmation`, so the event fires only when a person confirms it with `review.confirm` ([management-api.md](management-api.md)). `externalRef` is the run's `options.externalRef`, or null, so a host app can match the result to its own record. `resolution.failureClass` is the reviewer's failure class when one was set (ADR-012). `resolution.execute` is true when the server dispatched the decision's policy handler (idempotent by `runId:decisionId`). When it is false, the host app acts on `resolution.value` itself.

Model events are written once into each org that can use the model (its key's `models` list, or the platform key in platform mode). `alert.raised` is also shown in the console and sent by email ([savings-model.md](savings-model.md)).

Platform-only (platform admin, never tenants):

| Type | Emitted by | Subject | Data |
|---|---|---|---|
| `contract.changed` | contract watch job | contract | `{ source, changes }` where `source` is `openapi`, `llms_txt` or `models_md` |
| `model.unreviewed` | model registry sync | model | `{ modelId, seenVia }` where `seenVia` is `list` or `observation` |

See [system-one-models.md](system-one-models.md) for the registry sync and contract watch jobs.

## Pull feed (Phase 3)

```
GET /api/v1/events?after=<cursor>&types=set.published,rollout.auto_demoted&limit=100
```

- Scope `events:read`. Operation `event.list`.
- `after` is the id of the last event the caller has seen. Events come back ordered by id, oldest first. `limit` defaults to 100 (max 500).
- Response: `{ events: EventEnvelope[], cursor, gap }`. `cursor` is the id of the last returned event, or the input cursor when there is nothing new. `gap` is true when the cursor is older than the 30-day window, so some events are gone; read the audit log to fill it.
- The feed returns only events older than 5 seconds. Event rows are written at the end of short transactions, so a transaction that commits late cannot slip behind a cursor that has already passed its id.
- A token with a set allowlist sees only events about those sets, plus approval events for its own requests.
- An `sk_` app token may hold `events:read`. It then sees only `review.created`, `review.sla_breached` and `review.resolved` for runs made with that app's tokens. This is how a host app learns how a review ended before org webhooks ship. It can also poll `GET /api/v1/runs/{id}` with `runs:read` ([deploy-and-codegen.md](deploy-and-codegen.md)).
- `sysone events tail` and the MCP tool `list_events` use this feed, because CLI and MCP agents have no public URL to receive webhooks ([headless-and-agents.md](headless-and-agents.md)).

## Org webhooks (Phase 5)

- Table `webhook_endpoints (org_id, url, types text[], enabled, created_by, created_at)`, managed by admins with `admin:write`.
- Each delivery is signed with HMAC-SHA256 using the org's secret in `org_webhook_secrets` (encrypted like TypeSafe keys; [security.md](security.md)). Headers: `SysOne-Event-Id`, `SysOne-Event-Type` and `SysOne-Signature: t=<unix seconds>,v1=<hex HMAC of "<t>.<raw body>">`. Receivers reject timestamps more than 5 minutes old.
- The body is the `EventEnvelope`.
- Retries use backoff through the existing webhook retry job. Delivery is at least once, so consumers dedupe by event id.
- Plugin action webhooks sign with the same secret.

## Rule for new operations

Every operation that changes state lists the events it emits in `OperationDef.emits`. An empty list is allowed only when no agent needs to react to the change (the audit log still records it). Adding an event type means adding a row to the catalog above with its subject and `data` shape.
