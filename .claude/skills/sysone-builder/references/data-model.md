# Data model, tenancy, and RLS

Tenancy exists from migration `0001`. It is never bolted on later.

## Tenancy rules

1. Every tenant table has `org_id uuid not null references organizations(id)`. Platform tables have no `org_id` and are listed under [Platform tables](#platform-tables-no-org_id). One exception: `price_books` is a hybrid table whose platform default rows have `org_id` null ([Billing and usage](#billing-and-usage)).
2. Every tenant table has an RLS policy (template below, or the hybrid policy on `price_books`) and a composite index that starts with `org_id`.
3. App code touches the database only through `withTenant(ctx, tx => repo.method(tx, ...))`. It opens a transaction, runs `select set_config('app.org_id', $1, true)` (transaction-local, safe with pooled connections), and hands back repositories that also add the org filter. Two layers: if the repo forgets, RLS catches it; if RLS is misconfigured, the repo tests catch it.
4. Raw `db` handles are never exported from `packages/db`.
5. Cross-tenant access returns **404**, never 403, so existence doesn't leak.
6. Seeds and fixtures always create at least two orgs.

### RLS policy template

```sql
alter table question_sets enable row level security;
alter table question_sets force row level security;

create policy tenant_isolation on question_sets
  using (org_id = current_setting('app.org_id', true)::uuid)
  with check (org_id = current_setting('app.org_id', true)::uuid);
```

The app connects as a role without `BYPASSRLS`. Platform admin queries run through a separate, audited path that sets `app.platform_admin = true` and a policy that allows it.

## Tables

Actor columns named `*_user_id` and `*_token_id` come in pairs. A person acting in the console fills only the user column. An agent token fills both: the token and the user it belongs to ([security.md](security.md)). A single actor column is allowed only where no token can act: `approval_requests.decided_by_user_id`, `run_feedback.confirmed_by_user_id`, `dataset_cases.label_confirmed_by`, and the platform admin columns (`entitlement_overrides.set_by`, `audit_log.impersonator_id`).

### Identity and tenancy
- `users`, `sessions`, `accounts`, `verification_tokens`: from Better Auth's Drizzle adapter (ADR-002). Add `platform_role` (`null` or `superadmin`). The organization plugin's tables map onto `organizations`, `memberships` and `invitations`, which also get a second RLS policy on `app.user_id` for pre-org lookups (ADR-002).
- `organizations`: `id, slug (unique), name, status (active|suspended|deleted), key_mode (byo|platform), default_system_one_provider (typesafe|openrouter, default typesafe), state_retention_days (default 30), answers_retention_days (default 180), dataset_retention_days (null = the state retention), pii_mode (off|redact_logs|redact_logs_and_input), settings jsonb, created_at`.
  - Retention rules and the learning retention copy are in [security.md](security.md). Only an admin can raise `dataset_retention_days`, and the change is audited.
  - `settings` keys: `agentApprovals` (`required` (default), `production_only` or `off`; [security.md](security.md)), `allowPreviewModels` (bool, default false; [system-one-models.md](system-one-models.md)), `reviewerHourlyRateUsd` (number, used for the default review cost in [savings-model.md](savings-model.md)).
- `memberships`: `org_id, user_id, role (owner|admin|editor|reviewer|viewer)`, unique `(org_id, user_id)`.
- `invitations`: `org_id, email, role, token_hash, invited_by_user_id, invited_by_token_id, expires_at, accepted_at`.
- `device_codes`: auth table for the device flow (RFC 8628). `device_code_hash, user_code, client (cli|mcp|extension), requested_scopes text[], org_id null, user_id null, status (pending|approved|denied|used), expires_at (10 minutes), created_at`. Like `sessions`, it has no tenant RLS: only the `/api/v1/auth/device/*` route handlers read it. `org_id` and `user_id` stay null until a person approves the code in a console session, which mints an agent token.

### Keys and agent tokens
- `org_system_one_keys` (ADR-011 renames it from `org_typesafe_keys` before the first migration ships): `org_id, provider (typesafe|openrouter), ciphertext, iv, auth_tag, wrapped_dek, kek_id, key_last4, fingerprint, status (active|invalid|revoked), models text[], created_by_user_id, created_by_token_id, rotated_at`. Unique `(org_id, provider)`, so an org holds at most one key per provider. `models` holds the registry ids the key can reach on that provider, refreshed on save, on rotation and nightly ([system-one-models.md](system-one-models.md)). Validation differs by provider ([security.md](security.md)).
- `agent_tokens`: `org_id, user_id, name, client (cli|mcp|extension|console), prefix ('sa_live_'), hash (sha256 + pepper), scopes text[], role_ceiling, set_ids uuid[] (null = all), daily_spend_cap_micro_usd null, expires_at (at most 90 days), revoked_at, last_used_at, created_at`. Each token belongs to one user in one org. Effective role and minting rules are in [security.md](security.md).
- `org_webhook_secrets`: `org_id, ciphertext, iv, auth_tag, wrapped_dek, kek_id, created_at, rotated_at`. Envelope-encrypted like `org_system_one_keys`. Signs org event webhooks and plugin action webhooks ([events.md](events.md)).

### Apps and integration
- `apps`: `org_id, name, description, language (ts|py|other), framework text null, repo_url text null, allowed_origins text[]`.
- `app_tokens`: `org_id, app_id, kind (secret|publishable), prefix (sk_live_|sk_test_|pk_live_), hash (sha256 + pepper), channel (production|staging, default production), scopes text[], set_ids uuid[] (null = all), rpm_limit, expires_at, revoked_at, last_used_at, created_by_user_id, created_by_token_id`. Scopes may include `runs:write` and `feedback:write`, on `sk_` tokens only. A token runs only on its bound channel.
- `app_opportunities`: `org_id, app_id, source (agent|console), location jsonb null ({ file, lines }), current_approach (regex|if_else|llm_call|manual|other), decision_summary, primitive_guess, pattern (fan_out|confidence_routing|composite_scoring|intent_routing|cascade|top_choice|keep_in_code), ten_second_fit bool, status (proposed|accepted|rejected|built), set_id null, created_by_user_id, created_by_token_id, created_at`. Holds summaries, never source code. The `Opportunity` contract is in [deploy-and-codegen.md](deploy-and-codegen.md).
- `app_set_bindings`: `org_id, app_id, set_id, channel, target (managed|managed_typed|standalone), runtime (ts|py|http), interface_major, interface_hash, generator_version null, source_ref text null (commit SHA or PR URL), created_by_user_id, created_by_token_id, created_at, removed_at`. Written by `sysone codegen`, the codegen endpoint when `appId` is passed, and the console "Use in app" action. A set's consumers (bindings plus apps with runs in the last 30 days) feed the `interface.breaking` lint ([deploy-and-codegen.md](deploy-and-codegen.md)).

### Decision domain
- `projects`: `org_id, name, slug`.
- `goals`: `org_id, project_id, title, description, quality_target jsonb (QualityTarget), business_kpi text null, owner_id, archived_at`. `QualityTarget` and its tier defaults are in [confidence-policy.md](confidence-policy.md#quality-targets).
- `question_sets`: `org_id, project_id, goal_id, slug (unique per org), name, description, protected bool, labeling jsonb (LabelingPolicy), dispatch_actions_on_staging bool (default false), value_settings jsonb ({ errorCostUsd, reviewCostUsd }), gate_margins jsonb (default { coverageDrop: 0.02, reviewLoadRise: 0.10 }), storage_mode (full|redacted|hash_only, default full), user_generated bool (default false), result_cache_ttl_seconds int null, system_one_provider (typesafe|openrouter) null, draft_version_id, archived_at, created_by_user_id, created_by_token_id`.
  - There is no rollout column. The rollout stage lives on `release_pointers`.
  - `labeling` is the labeling policy and `gate_margins` holds the regression and experiment margins ([effectiveness-loop.md](effectiveness-loop.md)). `value_settings` feeds the quality-adjusted value ([savings-model.md](savings-model.md)).
  - `storage_mode` is the per-set storage mode in [security.md](security.md#pii-and-data-handling): `full` keeps state, `redacted` keeps redacted state, `hash_only` keeps only `runs.state_hash`. `user_generated` marks sets whose input comes from untrusted users; such sets need adversarial cases for the shadow to controlled gate ([security.md](security.md#state-is-untrusted)). `result_cache_ttl_seconds` null means the result cache is off; a value turns it on, for pinned models only ([architecture.md](architecture.md#caching)).
  - `system_one_provider` null means the org's `default_system_one_provider` (ADR-011, proposed). The resolved value reaches core as `RunSettings.systemOneProvider`. Until ADR-011 is accepted, `set.update` does not expose it.
  - All of these settings and `dispatch_actions_on_staging` change through `set.update` (`name, protected, labeling, dispatchActionsOnStaging, valueSettings, gateMargins, storageMode, userGenerated, resultCacheTtlSeconds`), never through the spec. Changing `storage_mode` to a less private mode (`hash_only` to `redacted` or `full`, or `redacted` to `full`) is a PII change, so it is high risk for agents.
- `question_set_versions`: `org_id, set_id, version int (unique with set_id), status (draft|published|archived), spec jsonb, spec_hash, interface_hash, interface_major int, model, changelog, source (console|api|cli|mcp|studio|upgrade|proposal), source_ref text null (commit SHA), created_by_user_id, created_by_token_id, published_by_user_id, published_by_token_id, published_at, eval_run_id`.
  - A trigger rejects updates once `status = 'published'`. A partial unique index allows one draft per set.
  - `interface_hash` and `interface_major` come from `SetInterface` ([spec-schema.md](spec-schema.md)). `source` and `source_ref` let `sysone spec diff` say which side changed.
- `release_pointers`: `org_id, set_id, channel (production|staging), version_id, rollout_stage (inactive|shadow|controlled|full|paused), active_experiment_id null, updated_at`. Primary key `(set_id, channel)`.
  - This is the only place the rollout stage is stored. It changes only through `rollout.change` ([management-api.md](management-api.md)).
  - A channel's first publish creates its pointer at `inactive`. Who changed a pointer is on its `release_events` row.
- `release_events`: `org_id, set_id, channel, from_version_id, to_version_id, kind (publish|rollback|promote|rollout_change|auto_demote|experiment_start|experiment_promote), from_stage null, to_stage null, reason, actor_user_id, actor_token_id, approval_id, at`. Auto-demote rows have no user or token; the audit row records the system actor.
- `experiments`: `org_id, set_id, channel, champion_version_id, challenger_version_id, kind (version|model|policy), sample_pct, min_runs, min_labeled, status (running|promoted|stopped), result jsonb, decided_by_user_id, decided_by_token_id, created_at`. At most one running experiment per `(set_id, channel)`. Rules in [effectiveness-loop.md](effectiveness-loop.md).
- `proposals`: `org_id, set_id, kind (tune_thresholds|model_upgrade|question_fix|add_none_option|split_question|narrow_state|label_more|demote), evidence jsonb, patch jsonb null, draft_version_id null, eval_run_id null, metrics_delta jsonb, rationale, status (open|accepted|rejected|expired), created_by_kind (system|user|agent), created_by_user_id, created_by_token_id, created_at`. Accepting a proposal creates a draft only.

### Runs, review, evals

#### `runs` (partitioned by month)

`id (uuidv7), org_id, project_id, set_id, version_id, channel, rollout, experiment_id null, arm (champion|challenger) null, source (console|playground|api|embed|extension|mcp|eval|cli|ingest), app_id, actor_user_id, actor_token_id, key_mode, system_one_provider (typesafe|openrouter), parent_run_id uuid null, model_requested, model_resolved, typesafe_request_id, interface_major, external_ref null, state jsonb null, state_hash, stages jsonb, checks jsonb, answers jsonb, decisions jsonb, run_band, overall_action, route, warnings jsonb, input_tokens, output_tokens, system_one_cost_micro_usd null, system_one_calls, cf_input_tokens, cf_output_tokens, counterfactual_micro_usd, counterfactual_mode, comparator_model, savings_micro_usd, savings_kind, savings_suppressed null, escalation_cost_micro_usd, llm_calls_made, llm_calls_avoided, context_tokens_pruned, latency_ms, status (ok|error|rate_limited|quota_exceeded), error_code, created_at`.

- Indexes: `(org_id, set_id, created_at desc)`, `(org_id, source, created_at)`, `(org_id, external_ref)`, `(org_id, experiment_id)`.
- `rollout` is the rollout stage read from the channel pointer at run time. It is a record of what applied, not a setting.
- `answers` always holds the full `SystemOneAnswer` JSON, including probabilities. `includeProbabilities` only shapes the response. Policy replay and set health depend on this.
- `input_tokens` and `output_tokens` are System One tokens. LLM escalation spend is in `escalation_cost_micro_usd`.
- `system_one_cost_micro_usd` sums each call's provider-reported `usage.cost` when present, else its price book cost. It is null when a call has neither, which happens in BYO key mode (warning `model_unpriced`).
- `system_one_provider` comes from `RunSinkRecord.provider`. `model_resolved` stores the response `model` as sent, so OpenRouter runs hold ids such as `typesafe/jev-1.13-20260917`.
- `parent_run_id` is set on a linked run that a `set` fallback started ([spec-schema.md](spec-schema.md) section 7). The parent's decision carries the linked run's id as `fallbackRunId`.
- `stages` stores `result.stages` (each stage with its calls). `RunSinkRecord.stages` holds per-stage totals only for `usage_events`.
- Standalone exports write rows with `source = 'ingest'` through `POST /api/v1/runs/ingest` ([api.md](api.md)).

**RunResult to runs columns.** Every field of `RunResult` ([savings-model.md](savings-model.md)) maps to one column, or is derived from one. USD fields are stored as micro-USD integers.

| `RunResult` field | Column |
|---|---|
| `runId` | `id` |
| `setId` | `set_id` |
| `version` | `question_set_versions.version` through `version_id` |
| `versionId` | `version_id` |
| `interfaceMajor` | `interface_major` |
| `interfaceHash` | `question_set_versions.interface_hash` through `version_id` |
| `channel` | `channel` |
| `rollout` | `rollout` |
| `experiment.id`, `experiment.arm` | `experiment_id`, `arm` |
| `status` | `status` |
| `error.code` | `error_code` (null when `status` is `ok`; `error.message` is not stored) |
| `modelRequested`, `modelResolved` | `model_requested`, `model_resolved` |
| `typesafeRequestId` | `typesafe_request_id` |
| `stages` | `stages` (calls include `provider` and `providerCostUsd`) |
| `checks` | `checks` |
| `answers` | `answers` |
| `decisions` | `decisions` |
| `runBand` | `run_band` |
| `overallAction` | `overall_action` |
| `route` | `route` |
| `cost.systemOneInputTokens` | `input_tokens` |
| `cost.systemOneOutputTokens` | `output_tokens` |
| `cost.systemOneCostUsd` | `system_one_cost_micro_usd` |
| `cost.counterfactualInputTokens`, `cost.counterfactualOutputTokens` | `cf_input_tokens`, `cf_output_tokens` |
| `cost.counterfactualLlmCostUsd` | `counterfactual_micro_usd` |
| `cost.savingsUsd` | `savings_micro_usd` |
| `cost.savingsKind` | `savings_kind` |
| `cost.savingsSuppressed` | `savings_suppressed` |
| `cost.llmCallsAvoided` | `llm_calls_avoided` |
| `cost.contextTokensPruned` | `context_tokens_pruned` |
| `cost.escalationCostUsd` | `escalation_cost_micro_usd` |
| `cost.llmCallsMade` | `llm_calls_made` |
| `cost.comparatorModel` | `comparator_model` |
| `cost.counterfactualMode` | `counterfactual_mode` |
| `cost.estimated` | not stored (always `true`) |
| `cost.latencyMs` | `latency_ms` |
| `reviewItemIds` | `review_items.id` where `run_id` matches and `kind = 'action'` |
| `warnings` | `warnings` |

#### Truth and review
- `run_feedback`: `id, org_id, run_id, decision_id null, observed jsonb, source (app|reviewer|audit|agent), observed_at, user_id null, token_id null, review_item_id null, idempotency_key, confirmed_by_user_id null, confirmed_at null, created_at`. Unique `(org_id, idempotency_key)`, index `(org_id, run_id)`.
  - `decision_id` null means the report is about the run's route.
  - Every truth source writes here: `POST /api/v1/feedback`, audit label items and reviewer resolutions. Resolving a review item writes an `audit` row when the item carries a `sample_rate`, otherwise a `reviewer` row, or an `agent` row when an agent token resolved it.
  - `agent` rows count toward gates and health only once `confirmed_by_user_id` is set by a person.
- `review_items`: `org_id, run_id (null for Studio items), studio_example_id null, set_id, decision_id, kind (action|label), reason (action|audit|near_threshold|challenger_diff|studio), sample_rate null, band, suggested jsonb, status (open|pending_confirmation|resolved|dismissed), assignee_id, resolution jsonb, resolved_by_user_id, resolved_by_token_id, resolved_at, due_at, add_to_dataset bool`.
  - `kind = 'action'` is created exactly when a decision's `effectiveAction` is `review`. `kind = 'label'` comes from the labeling policy or the Studio. Label items never block the caller or change `effectiveAction`.
  - `pending_confirmation` means an agent token resolved the item and a person must confirm it (`ReviewStore.confirm`). It stays out of gates and health until confirmed.
  - `sample_rate` is set when the labeling policy's random audit picked the decision, including on an action item it reused. Resolving an item with a `sample_rate` writes an `audit` row, and metrics weight it by `1 / sample_rate`.

#### Datasets and evals
- `datasets`: `org_id, set_id, name`.
- `dataset_cases`: `org_id, dataset_id, run_id null, version_id null, model_resolved null, state jsonb, state_hash, answers jsonb null, expected jsonb, source (manual|review|import|studio|production), label_source (reviewer|app|studio|import|agent), label_confirmed_by null, split (drafting|calibration|test), tags text[], created_at`.
  - `split` is set at insert from a hash of `state_hash` and never changes (a trigger rejects updates to it). Imports cannot set it.
  - `source = 'production'` rows come from the learning retention copy ([security.md](security.md)): state redacted per `pii_mode`, full answers, version and resolved model.
  - Cases follow `organizations.dataset_retention_days`. Deletion requests cascade to them.
- `dataset_snapshots`: `org_id, dataset_id, case_ids uuid[], snapshot_hash, created_at`. Immutable. The regression gate scores the champion and the candidate on the same snapshot.
- `eval_runs`: `org_id, set_id, version_id, dataset_id, snapshot_id, model, repeats int null, job_id, status, metrics jsonb, cost_micro_usd, created_by_user_id, created_by_token_id, started_at, finished_at`.
- `eval_case_results`: `org_id, eval_run_id, case_id, run_id, per_question jsonb`. Test-split rows are read only to compute aggregate metrics.

#### Studio
- `studio_sessions`: `org_id, goal_id, set_id null, opportunity_id null, status, intent jsonb, definition text, fit_test jsonb, created_by_user_id, created_by_token_id, created_at`. Improve mode sessions carry the `set_id` of the published set they reopen.
- `studio_examples`: `org_id, session_id, state jsonb, label jsonb, reason, label_source (human|agent|review), split (drafting|calibration|test), burned_at null, created_at`. `burned_at` is set when a calibration case's per-case result was returned. The holdout rules are in [definition-studio.md](definition-studio.md).

#### Rollups
- `question_daily`: keyed `(org_id, day, set_id, version_id, model_resolved, question_id)`. Columns: `n, band_high, band_medium, band_low, answer_hist jsonb, mean_confidence, labeled_n, correct_n, review_created`. Irrelevant decisions are not counted. Built nightly; set health reads it ([effectiveness-loop.md](effectiveness-loop.md)).
- `usage_daily`: see [savings-model.md](savings-model.md).

### Billing and usage
- `billing_accounts`: `org_id (unique), stripe_customer_id, stripe_subscription_id, plan, status, current_period_start, current_period_end, cancel_at, grace_until`.
- `entitlement_overrides`: `org_id, key, value, reason, set_by`. Platform admin only.
- `usage_events` (outbox): `org_id, run_id, kind (system_one_input_tokens|run), model (resolved), provider (typesafe|openrouter), quantity, key_mode, reported_to_stripe_at`. Written in the same transaction as the run. The model lets platform-key billing price each model at its own rate.
- `usage_daily`: rollup, see [savings-model.md](savings-model.md).
- `price_books`: `org_id (null = platform default), model, provider (typesafe|openrouter) null, display_name, input_per_mtok_micro_usd, output_per_mtok_micro_usd, updated_by_user_id, updated_by_token_id, updated_at`. Unique `(org_id, model, provider)` with `nulls not distinct`, so each model has one platform row per provider value and at most one override per org and provider.
  - `provider` null means the price holds on every provider. A row for the run's provider wins over the null row (ADR-011). Provider-reported `usage.cost` wins over both.
  - Hybrid table, the one exception to tenancy rule 1. Read policy: `using (org_id is null or org_id = current_setting('app.org_id', true)::uuid)`. Write policy: `with check (org_id = current_setting('app.org_id', true)::uuid)`. Platform rows (`org_id` null) are written only through the audited platform admin path.
  - The `PriceBook` port runs inside `withTenant`, so it sees the platform rows and the caller's own overrides, and an org row wins over the platform row for the same model.
  - The cross-tenant suite checks that org A cannot read or write org B's override, and that both orgs read the platform rows.
  - `model` is an exact model id. For System One rows it must be a versioned id in `system_one_models`; alias rows are rejected, because they would misprice runs after the alias moves. Comparator rows use the provider's exact model id.
  - Seed rows are listed in [savings-model.md](savings-model.md#price-book).

Plans live in code (`packages/billing/src/plans.ts`, typed). The database holds only overrides.

### Admin, jobs and events
- `audit_log` (append-only; the app role has no UPDATE or DELETE grant): `id, org_id (null for platform events), actor_type (user|agent|app|system), client (console|api|cli|mcp|extension|job), actor_user_id, actor_token_id, actor_role (the effective role when the action ran), approval_id, impersonator_id, action, target_type, target_id, diff jsonb, ip, user_agent, created_at`. `action` is the operation id ([management-api.md](management-api.md)).
- `approval_requests`: `org_id, op_id, input jsonb, input_hash, if_match text null, requested_by_token_id, requested_by_user_id, reason, status (pending|approved|rejected|expired|executed), decided_by_user_id, decided_at, expires_at, result jsonb, created_at`. `if_match` is the `If-Match` value the agent sent, re-checked when the approved request runs. Rules in [management-api.md](management-api.md#approvals).
- `idempotency_keys`: `org_id, actor_key, key, op_id, request_hash, response_status, response jsonb, created_at`. Unique `(org_id, actor_key, key)`. Pruned after 24 hours.
- `jobs`: `org_id, kind, status (queued|running|succeeded|failed), input, result, error, created_by_user_id, created_by_token_id, created_at, finished_at`.
- `events`: the event feed, see [events.md](events.md). Pruned after 30 days.
- `webhook_endpoints` (Phase 5): `org_id, url, types text[], enabled, created_by_user_id, created_by_token_id, created_at` ([events.md](events.md)).
- `plugin_configs`: `org_id, plugin_id, version, enabled, config_ciphertext`.

### Platform tables (no `org_id`)

These have no tenant RLS policy. The app role can read them; only the audited platform admin path writes them. `price_books` is not listed here: it holds platform rows and org rows, with the hybrid policy under [Billing and usage](#billing-and-usage).

- `system_one_models`: one row per `ModelProfile` ([system-one-models.md](system-one-models.md)). Every write is audited.
- `system_one_model_routes`: one row per `ModelRoute` (ADR-011): `model_id, provider, provider_model_id, pinned, resolved_ids text[], limits jsonb, docs_url, last_reviewed`. Primary key `(model_id, provider)`. There are no `typesafe` rows; TypeSafe is the identity route. Every write is audited.
- `model_alias_observations`: `provider, alias, resolved_id, first_seen, last_seen` ([system-one-models.md](system-one-models.md)). Unique `(provider, alias, resolved_id)`.
- `settings`: platform key/value: the global RPM budget per model, the default comparator, alert thresholds.
- `stripe_webhook_events`: `event_id (pk), type, processed_at`.

## Roles

| Role | Can |
|---|---|
| owner | Everything, including billing, delete org, transfer ownership |
| admin | Members, keys, apps, settings, retention, PII, price book |
| editor | Goals, sets, drafts, publish (unless set is `protected`), rollback, playground, datasets. Publishing to production on `controlled` or `full` sets and rollout changes still follow the gates. |
| reviewer | Work the review queue, label dataset cases |
| viewer | Read only |

Agent tokens act with role = min(`role_ceiling`, the user's membership role) and also need the scope. High-risk operations wait for a human approval ([security.md](security.md)).

The matrix lives in `packages/core/src/authz.ts` as `can(ctx, action, resource)`. Every operation calls it through `runOperation` ([management-api.md](management-api.md)), so Server Actions and route handlers get the same check. RLS is the backstop.

## Invariants (tested)

- A published version's `spec` never changes.
- Every run belongs to exactly one version, and that version belongs to the same org.
- `usage_events` exist for every successful run.
- `usage_events` carry the resolved model.
- Every mutation produces exactly one `audit_log` row.
- Every agent mutation records `actor_token_id` and the effective role (`audit_log.actor_role`).
- An approved request executes its stored input unchanged.
- Rollout exists only on `release_pointers`.
- Test-split cases never leave the server.
- Money columns are integers in micro-USD.

## Migrations

- Generate with `drizzle-kit generate`. Review the SQL. Never edit a migration that has been applied anywhere.
- Each new tenant table's migration includes its RLS policy and `org_id` index in the same file.
- The cross-tenant test suite is generated from the repository list; adding a repo without adding it to the suite fails CI.
