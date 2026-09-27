# Phase 3: Console and management API

**Owners:** Console UI, Platform (operations and `/api/v1`), Integrations (CLI, MCP stdio), Quality / Learning (gates, auto-demote, audit sampler), Billing / Savings (reports), QA. **Needs:** Phase 2.

Every console screen in this phase calls an operation ([management-api.md](../management-api.md)). A screen is not done until its operation, route and OpenAPI path exist and the parity test passes.

## Managed questions and managed live
- [ ] Goals CRUD with a `QualityTarget` and an optional business KPI ([effectiveness-loop.md](../effectiveness-loop.md))
- [ ] Question set list, create from blank or template; seed the document evaluator and email urgency templates here ([definition-studio.md](../definition-studio.md))
- [ ] Question editor: form mode and JSON mode, live zod validation and lints, structured instructions and criteria, backtick path autocomplete from `input.schema`
- [ ] Model picker fed from the registry (`model.list`), showing each model's status, limits and weaknesses
- [ ] Options editor: choice options (up to 255, "none" suggestion), score levels (2 to 10, ordered), noul true/false criteria. The 255 options and 2 to 10 levels are API-wide rules; other limits come from the model profile.
- [ ] Policy editor with band sliders and a live preview on sample state
- [ ] Cost and review-load forecast in the policy preview (ADR-015): replay recent runs or an eval dataset under the proposed policy and return a `forecast` block with counts per effective action, review items per day, escalation spend per day and System One spend per day, next to precision and the false-auto rate ([confidence-policy.md](../confidence-policy.md)) (Billing / Savings, Console UI)
- [ ] Input schema editor, redact paths, token preflight meter; the adapter picker stays hidden until Phase 5, so sets run on raw JSON state
- [ ] Publish flow: `If-Match` on the draft ETag, lints (including the model lints and `interface.breaking`, which counts apps with runs until bindings land in Phase 4b), an eval gate that is required when the production pointer is `controlled` or `full` (the same-snapshot regression gate in [effectiveness-loop.md](../effectiveness-loop.md), section 5), changelog, channel choice, and a dry-run preview
- [ ] Version history, diffs, release events, one-click rollback and promote
- [ ] Rollout stage control per channel (`inactive`, `shadow`, `controlled`, `full`, `paused`) through `rollout.change`, with gate status and audit ([confidence-policy.md](../confidence-policy.md))

## Headless (parity)
- [ ] Every console capability registered as an operation with its `/api/v1` route per [management-api.md](../management-api.md); the parity test passes
- [ ] Jobs endpoint (`GET /api/v1/jobs/{id}`) for evals, compares, calibration and exports
- [ ] Approvals inbox and decision UI: the stored input, a diff, gate results and the dry-run preview for each request
- [ ] Agent token management UI for admins: every member's tokens, scopes, ceiling, last use, revoke
- [ ] Event feed `GET /api/v1/events` per [events.md](../events.md)
- [ ] Feedback API `POST /api/v1/feedback` ([api.md](../api.md)); the server sets each row's `source` from the caller (`app` for `sk_` tokens, `agent` for agent tokens)
- [ ] `@bandwise/cli` Phase 3 commands, including `bandwise spec pull`, `push`, `diff` and `validate` ([headless-and-agents.md](../headless-and-agents.md); Integrations)
- [ ] `packages/mcp-server` stdio transport with the Phase 3 curated tools ([headless-and-agents.md](../headless-and-agents.md); Integrations)
- [ ] OpenAPI and MSW mocks regenerated from the registry

## Test and learn
- [ ] Playground: pick two versions and one state or a dataset; structural diff and behavioral diff; flipped cases table; cost delta
- [ ] Runs explorer with filters, run detail with per-stage payload and answers
- [ ] Review queue with kind `action` and `label`, the reason each item was picked, assign, resolve, dismiss, add to dataset, SLA timers
- [ ] Audit sampler per the labeling policy in [effectiveness-loop.md](../effectiveness-loop.md) (Quality / Learning)
- [ ] Datasets with fixed splits and snapshots (`dataset_snapshots`)
- [ ] Eval runs on a dataset snapshot (`snapshotId`), with calibration charts and the model recorded on each run
- [ ] Definition Studio per [definition-studio.md](../definition-studio.md), including `studio_sessions`, the `studio.*` operations and server-enforced holdout rules

## Rollout safety (Quality / Learning)
- [ ] Gate evaluator for each move in [confidence-policy.md](../confidence-policy.md), comparing the 95 percent Wilson lower bound to the goal's `QualityTarget`
- [ ] Auto-demote job (hourly): `full` to `controlled`, `controlled` to `shadow`; never `paused`
- [ ] "No truth source" warning when a live set has neither app feedback nor audit labels

## Models
- [ ] Platform admin Models page: review unreviewed models, set status, limits, weaknesses and `retireAt` ([system-one-models.md](../system-one-models.md))
- [ ] Org model list (the registry sync, alias probe and contract watch jobs run from Phase 1)
- [ ] Model lints enforced at publish

## Administration and ROI
- [ ] Savings and usage dashboards (org, project, set)
- [ ] Standard reports from [savings-model.md](../savings-model.md) with CSV export and monthly PDF
- [ ] Model upgrades report and alerts: alias-moved and deprecation alerts here; upgrade candidates with eval deltas arrive in Phase 3b
- [ ] Escalation rate and escalation spend per day lead set health, the savings report and the org dashboard, per set and per org (ADR-015, [savings-model.md](../savings-model.md))
- [ ] Daily escalation budget setting: nullable `question_sets.escalation_budget_micro_usd_per_day`, outside the versioned spec, with an operation, audit row and console field (ADR-015)
- [ ] Escalation budget alert job: raises `alert.raised` with kind `escalation_over_budget` once per set and day when the day's escalation spend crosses the budget; it alerts only and never stops escalating (ADR-015, [events.md](../events.md))
- [ ] Audit log viewer with filters and CSV export

## Docs site
- [ ] Docs pages ([team-playbook.md](../team-playbook.md#docs-site)): Call a set from your app over HTTP (auth modes, `POST /api/v1/sets/{ref}/run`, the error envelope); Publishing, channels and rollback; Rollout gates and auto-demote; Review queue; Evals and datasets; Reports, savings and escalation spend, with the threshold forecast and the escalation budget alert; Alerts, including set silent; Events feed; the full CLI reference with every command; Agents and MCP with the stdio tools; the API reference callouts updated so Phase 3 groups read as live and later groups keep their phase

## Exit gate
- Playwright: create a set, publish, set the production rollout to `shadow`, call it through the API, publish v2, the API serves v2 within 30 seconds with no redeploy, roll back, the API serves v1.
- With production at `controlled`, medium and low band answers on gating decisions create review items of kind `action`; resolving one can add a dataset case.
- Headless gate: an agent holding only an agent token, using only the CLI or MCP, creates a set from a template, edits and validates the draft (fixing JSON lint errors), runs an eval, publishes to staging, promotes to production, sets the production rollout to shadow, resolves review items and reads the savings report. With the set marked protected, it then requests a production publish of v2, which stays pending until a human approves it in the console, and rolls back through the API.
- Replaying a publish with the same `Idempotency-Key` creates no new version.
- A viewer cannot mutate anything; an agent token without a scope gets `403 insufficient_scope` in its own org and `404` across orgs.
- Every mutation writes an audit row with actor type, client and approval id.
- An injected precision drop auto-demotes a `full` set to `controlled`.
- A set cannot be published on an unreviewed model.
