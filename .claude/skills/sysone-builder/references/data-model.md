# Data model, tenancy, and RLS

Tenancy exists from migration `0001`. It is never bolted on later.

## Tenancy rules

1. Every tenant table has `org_id uuid not null references organizations(id)`.
2. Every tenant table has an RLS policy (template below) and a composite index that starts with `org_id`.
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

### Identity and tenancy
- `users`, `sessions`, `accounts`, `verification_tokens`: from the auth library's Drizzle adapter. Add `platform_role` (`null` or `superadmin`).
- `organizations`: `id, slug (unique), name, status (active|suspended|deleted), key_mode (byo|platform), retention_days (default 30), pii_mode (off|redact_logs|redact_logs_and_input), settings jsonb, created_at`.
- `memberships`: `org_id, user_id, role (owner|admin|editor|reviewer|viewer)`, unique `(org_id, user_id)`.
- `invitations`: `org_id, email, role, token_hash, invited_by, expires_at, accepted_at`.

### Keys
- `org_jev_keys`: `org_id, provider ('typesafe'), ciphertext, iv, auth_tag, wrapped_dek, kek_id, key_last4, fingerprint, status (active|invalid|revoked), created_by, rotated_at`.
- `apps`: `org_id, name, description, allowed_origins text[]`.
- `app_tokens`: `org_id, app_id, kind (secret|publishable), prefix (sk_live_|sk_test_|pk_live_), hash (sha256 + pepper), scopes text[], set_ids uuid[] (null = all), rpm_limit, expires_at, revoked_at, last_used_at, created_by`.

### Decision domain
- `projects`: `org_id, name, slug`.
- `goals`: `org_id, project_id, title, description, success_metric, owner_id, archived_at`.
- `question_sets`: `org_id, project_id, goal_id, slug (unique per org), name, description, protected bool, rollout (draft|shadow|controlled|full|paused), draft_version_id, archived_at, created_by`.
- `question_set_versions`: `org_id, set_id, version int (unique with set_id), status (draft|published|archived), spec jsonb, spec_hash, model, changelog, created_by, published_by, published_at, eval_run_id`. A trigger rejects updates once `status = 'published'`. A partial unique index allows one draft per set.
- `release_pointers`: `org_id, set_id, channel (production|staging), version_id, updated_by, updated_at`. Primary key `(set_id, channel)`.
- `release_events`: `org_id, set_id, channel, from_version_id, to_version_id, kind (publish|rollback|promote), actor_id, at`.

### Runs, review, evals
- `runs` (partitioned by month):
  `id (uuidv7), org_id, set_id, version_id, channel, rollout, source (console|playground|api|embed|extension|mcp|eval), app_id, actor_user_id, key_mode, model_requested, model_resolved, state jsonb null, state_hash, stages jsonb, answers jsonb, decisions jsonb, run_band, input_tokens, output_tokens, jev_cost_micro_usd, counterfactual_micro_usd, savings_micro_usd, savings_kind, llm_calls_avoided, context_tokens_pruned, latency_ms, jev_calls, status (ok|error|rate_limited|quota_exceeded), error_code, created_at`.
  Indexes: `(org_id, set_id, created_at desc)`, `(org_id, source, created_at)`.
- `review_items`: `org_id, run_id, set_id, question_id, band, suggested jsonb, status (open|resolved|dismissed), assignee_id, resolution jsonb, resolved_by, resolved_at, due_at, add_to_dataset bool`.
- `datasets`: `org_id, set_id, name`.
- `dataset_cases`: `org_id, dataset_id, state jsonb, expected jsonb, source (manual|review|import|studio), tags text[]`.
- `eval_runs`: `org_id, set_id, version_id, dataset_id, status, metrics jsonb, cost_micro_usd, created_by, started_at, finished_at`.
- `eval_case_results`: `org_id, eval_run_id, case_id, run_id, per_question jsonb`.

### Billing and usage
- `billing_accounts`: `org_id (unique), stripe_customer_id, stripe_subscription_id, plan, status, current_period_start, current_period_end, cancel_at, grace_until`.
- `entitlement_overrides`: `org_id, key, value, reason, set_by`. Platform admin only.
- `usage_events` (outbox): `org_id, run_id, kind (jev_input_tokens|run), quantity, key_mode, reported_to_stripe_at`. Written in the same transaction as the run.
- `usage_daily`: rollup, see `savings-model.md`.
- `price_books`: `org_id (null = platform default), model, input_per_mtok_micro_usd, output_per_mtok_micro_usd, updated_by, updated_at`.
- `stripe_webhook_events`: `event_id (pk), type, processed_at`.

Plans live in code (`packages/billing/src/plans.ts`, typed). The database holds only overrides.

### Admin and plugins
- `audit_log` (append-only; the app role has no UPDATE or DELETE grant): `id, org_id (null for platform events), actor_user_id, actor_token_id, impersonator_id, action, target_type, target_id, diff jsonb, ip, user_agent, created_at`.
- `plugin_configs`: `org_id, plugin_id, version, enabled, config_ciphertext`.
- `settings`: platform-level key/value (global RPM budget, default comparator, alert thresholds).

## Roles

| Role | Can |
|---|---|
| owner | Everything, including billing, delete org, transfer ownership |
| admin | Members, keys, apps, settings, retention, PII, price book |
| editor | Goals, sets, drafts, publish (unless set is `protected`), rollback, playground, datasets |
| reviewer | Work the review queue, label dataset cases |
| viewer | Read only |

The matrix lives in `packages/core/src/authz.ts` as `can(ctx, action, resource)`. Server actions and routes both call it. RLS is the backstop.

## Invariants (tested)

- A published version's `spec` never changes.
- Every run belongs to exactly one version, and that version belongs to the same org.
- `usage_events` exist for every successful run.
- Every mutation produces exactly one `audit_log` row.
- Money columns are integers in micro-USD.

## Migrations

- Generate with `drizzle-kit generate`. Review the SQL. Never edit a migration that has been applied anywhere.
- Each new tenant table's migration includes its RLS policy and `org_id` index in the same file.
- The cross-tenant test suite is generated from the repository list; adding a repo without adding it to the suite fails CI.
