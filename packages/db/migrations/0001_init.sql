-- Migration 0001: every table in data-model.md, then the security block from src/rls.ts.
-- The table DDL is drizzle-kit output. runs was edited by hand to PARTITION BY RANGE (created_at).
CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "device_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"device_code_hash" text NOT NULL,
	"user_code" text NOT NULL,
	"client" text NOT NULL,
	"requested_scopes" text[] DEFAULT '{}' NOT NULL,
	"org_id" uuid,
	"user_id" uuid,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "device_codes_device_code_hash_key" UNIQUE("device_code_hash"),
	CONSTRAINT "device_codes_user_code_key" UNIQUE("user_code")
);
--> statement-breakpoint
CREATE TABLE "invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"email" text NOT NULL,
	"role" text NOT NULL,
	"token_hash" text NOT NULL,
	"invited_by_user_id" uuid,
	"invited_by_token_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invitations_token_hash_key" UNIQUE("token_hash"),
	CONSTRAINT "invitations_org_id_id_key" UNIQUE("org_id","id")
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "memberships_org_id_id_key" UNIQUE("org_id","id"),
	CONSTRAINT "memberships_org_id_user_id_key" UNIQUE("org_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"key_mode" text DEFAULT 'byo' NOT NULL,
	"default_system_one_provider" text DEFAULT 'typesafe' NOT NULL,
	"state_retention_days" integer DEFAULT 30 NOT NULL,
	"answers_retention_days" integer DEFAULT 180 NOT NULL,
	"dataset_retention_days" integer,
	"pii_mode" text DEFAULT 'off' NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organizations_slug_key" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token" text NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"impersonated_by" uuid,
	"active_organization_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_key" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "two_factors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"secret" text NOT NULL,
	"backup_codes" text NOT NULL,
	"user_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"platform_role" text,
	"role" text,
	"banned" boolean DEFAULT false NOT NULL,
	"ban_reason" text,
	"ban_expires" timestamp with time zone,
	"two_factor_enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_key" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"client" text NOT NULL,
	"prefix" text DEFAULT 'sa_live_' NOT NULL,
	"hash" text NOT NULL,
	"scopes" text[] DEFAULT '{}' NOT NULL,
	"role_ceiling" text NOT NULL,
	"set_ids" uuid[],
	"daily_spend_cap_micro_usd" bigint,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_tokens_hash_key" UNIQUE("hash"),
	CONSTRAINT "agent_tokens_org_id_id_key" UNIQUE("org_id","id")
);
--> statement-breakpoint
CREATE TABLE "app_opportunities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"app_id" uuid NOT NULL,
	"source" text NOT NULL,
	"location" jsonb,
	"current_approach" text NOT NULL,
	"decision_summary" text NOT NULL,
	"primitive_guess" text,
	"pattern" text NOT NULL,
	"ten_second_fit" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'proposed' NOT NULL,
	"set_id" uuid,
	"created_by_user_id" uuid,
	"created_by_token_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "app_opportunities_org_id_id_key" UNIQUE("org_id","id")
);
--> statement-breakpoint
CREATE TABLE "app_set_bindings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"app_id" uuid NOT NULL,
	"set_id" uuid NOT NULL,
	"channel" text NOT NULL,
	"target" text NOT NULL,
	"runtime" text NOT NULL,
	"interface_major" integer NOT NULL,
	"interface_hash" text NOT NULL,
	"generator_version" text,
	"source_ref" text,
	"created_by_user_id" uuid,
	"created_by_token_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"removed_at" timestamp with time zone,
	CONSTRAINT "app_set_bindings_org_id_id_key" UNIQUE("org_id","id")
);
--> statement-breakpoint
CREATE TABLE "app_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"app_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"prefix" text NOT NULL,
	"hash" text NOT NULL,
	"channel" text DEFAULT 'production' NOT NULL,
	"scopes" text[] DEFAULT '{}' NOT NULL,
	"set_ids" uuid[],
	"rpm_limit" integer,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"last_used_at" timestamp with time zone,
	"created_by_user_id" uuid,
	"created_by_token_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "app_tokens_hash_key" UNIQUE("hash"),
	CONSTRAINT "app_tokens_org_id_id_key" UNIQUE("org_id","id")
);
--> statement-breakpoint
CREATE TABLE "apps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"language" text NOT NULL,
	"framework" text,
	"repo_url" text,
	"allowed_origins" text[] DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "apps_org_id_id_key" UNIQUE("org_id","id")
);
--> statement-breakpoint
CREATE TABLE "org_system_one_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"ciphertext" text NOT NULL,
	"iv" text NOT NULL,
	"auth_tag" text NOT NULL,
	"wrapped_dek" text NOT NULL,
	"kek_id" text NOT NULL,
	"key_last4" text NOT NULL,
	"fingerprint" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"models" text[] DEFAULT '{}' NOT NULL,
	"created_by_user_id" uuid,
	"created_by_token_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"rotated_at" timestamp with time zone,
	CONSTRAINT "org_system_one_keys_org_id_id_key" UNIQUE("org_id","id"),
	CONSTRAINT "org_system_one_keys_org_id_provider_key" UNIQUE("org_id","provider")
);
--> statement-breakpoint
CREATE TABLE "org_webhook_secrets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"ciphertext" text NOT NULL,
	"iv" text NOT NULL,
	"auth_tag" text NOT NULL,
	"wrapped_dek" text NOT NULL,
	"kek_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"rotated_at" timestamp with time zone,
	CONSTRAINT "org_webhook_secrets_org_id_id_key" UNIQUE("org_id","id")
);
--> statement-breakpoint
CREATE TABLE "experiments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"set_id" uuid NOT NULL,
	"channel" text NOT NULL,
	"champion_version_id" uuid NOT NULL,
	"challenger_version_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"sample_pct" real NOT NULL,
	"min_runs" integer NOT NULL,
	"min_labeled" integer NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"result" jsonb,
	"decided_by_user_id" uuid,
	"decided_by_token_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "experiments_org_id_id_key" UNIQUE("org_id","id")
);
--> statement-breakpoint
CREATE TABLE "goals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"quality_target" jsonb NOT NULL,
	"business_kpi" text,
	"owner_id" uuid,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "goals_org_id_id_key" UNIQUE("org_id","id")
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "projects_org_id_id_key" UNIQUE("org_id","id"),
	CONSTRAINT "projects_org_id_slug_key" UNIQUE("org_id","slug")
);
--> statement-breakpoint
CREATE TABLE "proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"set_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"evidence" jsonb NOT NULL,
	"patch" jsonb,
	"draft_version_id" uuid,
	"eval_run_id" uuid,
	"metrics_delta" jsonb,
	"rationale" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"created_by_kind" text NOT NULL,
	"created_by_user_id" uuid,
	"created_by_token_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "proposals_org_id_id_key" UNIQUE("org_id","id")
);
--> statement-breakpoint
CREATE TABLE "question_set_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"set_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"spec" jsonb NOT NULL,
	"spec_hash" text NOT NULL,
	"interface_hash" text NOT NULL,
	"interface_major" integer NOT NULL,
	"model" text NOT NULL,
	"changelog" text,
	"source" text NOT NULL,
	"source_ref" text,
	"created_by_user_id" uuid,
	"created_by_token_id" uuid,
	"published_by_user_id" uuid,
	"published_by_token_id" uuid,
	"published_at" timestamp with time zone,
	"eval_run_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "question_set_versions_org_id_id_key" UNIQUE("org_id","id"),
	CONSTRAINT "question_set_versions_set_id_version_key" UNIQUE("set_id","version")
);
--> statement-breakpoint
CREATE TABLE "question_sets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"goal_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"protected" boolean DEFAULT false NOT NULL,
	"labeling" jsonb NOT NULL,
	"dispatch_actions_on_staging" boolean DEFAULT false NOT NULL,
	"value_settings" jsonb,
	"gate_margins" jsonb DEFAULT '{"coverageDrop":0.02,"reviewLoadRise":0.1}'::jsonb NOT NULL,
	"storage_mode" text DEFAULT 'full' NOT NULL,
	"user_generated" boolean DEFAULT false NOT NULL,
	"result_cache_ttl_seconds" integer,
	"system_one_provider" text,
	"draft_version_id" uuid,
	"archived_at" timestamp with time zone,
	"created_by_user_id" uuid,
	"created_by_token_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "question_sets_org_id_id_key" UNIQUE("org_id","id"),
	CONSTRAINT "question_sets_org_id_slug_key" UNIQUE("org_id","slug"),
	CONSTRAINT "question_sets_result_cache_ttl_check" CHECK ("question_sets"."result_cache_ttl_seconds" is null or ("question_sets"."result_cache_ttl_seconds" > 0 and "question_sets"."result_cache_ttl_seconds" <= 86400))
);
--> statement-breakpoint
CREATE TABLE "release_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"set_id" uuid NOT NULL,
	"channel" text NOT NULL,
	"from_version_id" uuid,
	"to_version_id" uuid,
	"kind" text NOT NULL,
	"from_stage" text,
	"to_stage" text,
	"reason" text,
	"actor_user_id" uuid,
	"actor_token_id" uuid,
	"approval_id" uuid,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "release_events_org_id_id_key" UNIQUE("org_id","id")
);
--> statement-breakpoint
CREATE TABLE "release_pointers" (
	"org_id" uuid NOT NULL,
	"set_id" uuid NOT NULL,
	"channel" text NOT NULL,
	"version_id" uuid NOT NULL,
	"rollout_stage" text DEFAULT 'inactive' NOT NULL,
	"active_experiment_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "release_pointers_pkey" PRIMARY KEY("set_id","channel"),
	CONSTRAINT "release_pointers_org_id_set_id_channel_key" UNIQUE("org_id","set_id","channel")
);
--> statement-breakpoint
CREATE TABLE "dataset_cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"dataset_id" uuid NOT NULL,
	"run_id" uuid,
	"version_id" uuid,
	"model_resolved" text,
	"state" jsonb NOT NULL,
	"state_hash" text NOT NULL,
	"answers" jsonb,
	"expected" jsonb NOT NULL,
	"source" text NOT NULL,
	"label_source" text NOT NULL,
	"label_confirmed_by" uuid,
	"split" text NOT NULL,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dataset_cases_org_id_id_key" UNIQUE("org_id","id")
);
--> statement-breakpoint
CREATE TABLE "dataset_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"dataset_id" uuid NOT NULL,
	"case_ids" uuid[] NOT NULL,
	"snapshot_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dataset_snapshots_org_id_id_key" UNIQUE("org_id","id")
);
--> statement-breakpoint
CREATE TABLE "datasets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"set_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "datasets_org_id_id_key" UNIQUE("org_id","id"),
	CONSTRAINT "datasets_org_id_set_id_name_key" UNIQUE("org_id","set_id","name")
);
--> statement-breakpoint
CREATE TABLE "eval_case_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"eval_run_id" uuid NOT NULL,
	"case_id" uuid NOT NULL,
	"run_id" uuid,
	"per_question" jsonb NOT NULL,
	CONSTRAINT "eval_case_results_org_id_id_key" UNIQUE("org_id","id")
);
--> statement-breakpoint
CREATE TABLE "eval_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"set_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"dataset_id" uuid NOT NULL,
	"snapshot_id" uuid,
	"model" text NOT NULL,
	"repeats" integer,
	"job_id" uuid,
	"status" text DEFAULT 'queued' NOT NULL,
	"metrics" jsonb,
	"cost_micro_usd" bigint DEFAULT 0 NOT NULL,
	"created_by_user_id" uuid,
	"created_by_token_id" uuid,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	CONSTRAINT "eval_runs_org_id_id_key" UNIQUE("org_id","id")
);
--> statement-breakpoint
CREATE TABLE "question_daily" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"day" date NOT NULL,
	"set_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"model_resolved" text NOT NULL,
	"question_id" text NOT NULL,
	"n" integer DEFAULT 0 NOT NULL,
	"band_high" integer DEFAULT 0 NOT NULL,
	"band_medium" integer DEFAULT 0 NOT NULL,
	"band_low" integer DEFAULT 0 NOT NULL,
	"answer_hist" jsonb,
	"mean_confidence" double precision,
	"labeled_n" integer DEFAULT 0 NOT NULL,
	"correct_n" integer DEFAULT 0 NOT NULL,
	"review_created" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "question_daily_org_id_id_key" UNIQUE("org_id","id"),
	CONSTRAINT "question_daily_key" UNIQUE("org_id","day","set_id","version_id","model_resolved","question_id")
);
--> statement-breakpoint
CREATE TABLE "review_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"run_id" uuid,
	"studio_example_id" uuid,
	"set_id" uuid NOT NULL,
	"decision_id" text NOT NULL,
	"kind" text NOT NULL,
	"reason" text NOT NULL,
	"sample_rate" double precision,
	"band" text NOT NULL,
	"suggested" jsonb,
	"status" text DEFAULT 'open' NOT NULL,
	"assignee_id" uuid,
	"resolution" jsonb,
	"resolved_by_user_id" uuid,
	"resolved_by_token_id" uuid,
	"resolved_at" timestamp with time zone,
	"due_at" timestamp with time zone,
	"add_to_dataset" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "review_items_org_id_id_key" UNIQUE("org_id","id")
);
--> statement-breakpoint
CREATE TABLE "run_feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"decision_id" text,
	"observed" jsonb NOT NULL,
	"source" text NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"user_id" uuid,
	"token_id" uuid,
	"review_item_id" uuid,
	"idempotency_key" text NOT NULL,
	"confirmed_by_user_id" uuid,
	"confirmed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "run_feedback_org_id_id_key" UNIQUE("org_id","id"),
	CONSTRAINT "run_feedback_org_id_idempotency_key_key" UNIQUE("org_id","idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "runs" (
	"id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"set_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"channel" text NOT NULL,
	"rollout" text NOT NULL,
	"experiment_id" uuid,
	"arm" text,
	"source" text NOT NULL,
	"app_id" uuid,
	"actor_user_id" uuid,
	"actor_token_id" uuid,
	"key_mode" text NOT NULL,
	"system_one_provider" text DEFAULT 'typesafe' NOT NULL,
	"parent_run_id" uuid,
	"model_requested" text NOT NULL,
	"model_resolved" text,
	"typesafe_request_id" text,
	"interface_major" integer NOT NULL,
	"external_ref" text,
	"state" jsonb,
	"state_hash" text NOT NULL,
	"stages" jsonb NOT NULL,
	"checks" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"answers" jsonb,
	"decisions" jsonb,
	"run_band" text NOT NULL,
	"overall_action" text NOT NULL,
	"route" text,
	"warnings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"input_tokens" integer NOT NULL,
	"output_tokens" integer NOT NULL,
	"system_one_cost_micro_usd" bigint,
	"system_one_calls" integer NOT NULL,
	"cf_input_tokens" integer NOT NULL,
	"cf_output_tokens" integer NOT NULL,
	"counterfactual_micro_usd" bigint NOT NULL,
	"counterfactual_mode" text NOT NULL,
	"comparator_model" text NOT NULL,
	"savings_micro_usd" bigint NOT NULL,
	"savings_kind" text NOT NULL,
	"savings_suppressed" text,
	"escalation_cost_micro_usd" bigint NOT NULL,
	"llm_calls_made" integer NOT NULL,
	"llm_calls_avoided" integer NOT NULL,
	"context_tokens_pruned" integer,
	"latency_ms" integer NOT NULL,
	"status" text NOT NULL,
	"error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "runs_pkey" PRIMARY KEY("id","created_at")
) PARTITION BY RANGE ("created_at");
--> statement-breakpoint
CREATE TABLE "studio_examples" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"state" jsonb NOT NULL,
	"label" jsonb,
	"reason" text,
	"label_source" text NOT NULL,
	"split" text NOT NULL,
	"burned_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "studio_examples_org_id_id_key" UNIQUE("org_id","id")
);
--> statement-breakpoint
CREATE TABLE "studio_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"goal_id" uuid NOT NULL,
	"set_id" uuid,
	"opportunity_id" uuid,
	"status" text NOT NULL,
	"intent" jsonb,
	"definition" text,
	"fit_test" jsonb,
	"created_by_user_id" uuid,
	"created_by_token_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "studio_sessions_org_id_id_key" UNIQUE("org_id","id")
);
--> statement-breakpoint
CREATE TABLE "usage_daily" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"day" date NOT NULL,
	"project_id" uuid NOT NULL,
	"set_id" uuid NOT NULL,
	"app_id" uuid,
	"version_id" uuid NOT NULL,
	"model_resolved" text NOT NULL,
	"system_one_provider" text NOT NULL,
	"key_mode" text NOT NULL,
	"source" text NOT NULL,
	"savings_kind" text NOT NULL,
	"runs" integer DEFAULT 0 NOT NULL,
	"auto_decisions" integer DEFAULT 0 NOT NULL,
	"band_high" integer DEFAULT 0 NOT NULL,
	"band_medium" integer DEFAULT 0 NOT NULL,
	"band_low" integer DEFAULT 0 NOT NULL,
	"system_one_input_tokens" bigint DEFAULT 0 NOT NULL,
	"system_one_output_tokens" bigint DEFAULT 0 NOT NULL,
	"system_one_cost_micro_usd" bigint DEFAULT 0 NOT NULL,
	"cf_input_tokens" bigint DEFAULT 0 NOT NULL,
	"cf_output_tokens" bigint DEFAULT 0 NOT NULL,
	"counterfactual_micro_usd" bigint DEFAULT 0 NOT NULL,
	"savings_micro_usd" bigint DEFAULT 0 NOT NULL,
	"suppressed_savings_micro_usd" bigint DEFAULT 0 NOT NULL,
	"llm_calls_avoided" integer DEFAULT 0 NOT NULL,
	"context_tokens_pruned" bigint DEFAULT 0 NOT NULL,
	"escalation_cost_micro_usd" bigint DEFAULT 0 NOT NULL,
	"llm_calls_made" integer DEFAULT 0 NOT NULL,
	"experiment_cost_micro_usd" bigint DEFAULT 0 NOT NULL,
	"review_created" integer DEFAULT 0 NOT NULL,
	"label_created" integer DEFAULT 0 NOT NULL,
	"review_resolved" integer DEFAULT 0 NOT NULL,
	"review_cost_micro_usd" bigint DEFAULT 0 NOT NULL,
	"error_cost_est_micro_usd" bigint DEFAULT 0 NOT NULL,
	"p50_latency_ms" real,
	"p95_latency_ms" real,
	CONSTRAINT "usage_daily_org_id_id_key" UNIQUE("org_id","id"),
	CONSTRAINT "usage_daily_key" UNIQUE NULLS NOT DISTINCT("org_id","day","project_id","set_id","app_id","version_id","model_resolved","system_one_provider","key_mode","source","savings_kind")
);
--> statement-breakpoint
CREATE TABLE "approval_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"op_id" text NOT NULL,
	"input" jsonb NOT NULL,
	"input_hash" text NOT NULL,
	"if_match" text,
	"requested_by_token_id" uuid NOT NULL,
	"requested_by_user_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"decided_by_user_id" uuid,
	"decided_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"result" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "approval_requests_org_id_id_key" UNIQUE("org_id","id")
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid,
	"actor_type" text NOT NULL,
	"client" text NOT NULL,
	"actor_user_id" uuid,
	"actor_token_id" uuid,
	"actor_role" text,
	"approval_id" uuid,
	"impersonator_id" uuid,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"diff" jsonb,
	"ip" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audit_log_org_id_id_key" UNIQUE("org_id","id")
);
--> statement-breakpoint
CREATE TABLE "billing_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"plan" text NOT NULL,
	"status" text NOT NULL,
	"current_period_start" timestamp with time zone,
	"current_period_end" timestamp with time zone,
	"cancel_at" timestamp with time zone,
	"grace_until" timestamp with time zone,
	CONSTRAINT "billing_accounts_org_id_key" UNIQUE("org_id"),
	CONSTRAINT "billing_accounts_org_id_id_key" UNIQUE("org_id","id")
);
--> statement-breakpoint
CREATE TABLE "entitlement_overrides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"key" text NOT NULL,
	"value" jsonb NOT NULL,
	"reason" text NOT NULL,
	"set_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "entitlement_overrides_org_id_id_key" UNIQUE("org_id","id"),
	CONSTRAINT "entitlement_overrides_org_id_key_key" UNIQUE("org_id","key")
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid,
	"type" text NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor" jsonb NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" text NOT NULL,
	"data" jsonb,
	CONSTRAINT "events_org_id_id_key" UNIQUE("org_id","id")
);
--> statement-breakpoint
CREATE TABLE "idempotency_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"actor_key" text NOT NULL,
	"key" text NOT NULL,
	"op_id" text NOT NULL,
	"request_hash" text NOT NULL,
	"response_status" integer NOT NULL,
	"response" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "idempotency_keys_org_id_id_key" UNIQUE("org_id","id"),
	CONSTRAINT "idempotency_keys_org_id_actor_key_key_key" UNIQUE("org_id","actor_key","key")
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"input" jsonb,
	"result" jsonb,
	"error" jsonb,
	"created_by_user_id" uuid,
	"created_by_token_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "jobs_org_id_id_key" UNIQUE("org_id","id")
);
--> statement-breakpoint
CREATE TABLE "plugin_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"plugin_id" text NOT NULL,
	"version" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"config_ciphertext" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plugin_configs_org_id_id_key" UNIQUE("org_id","id"),
	CONSTRAINT "plugin_configs_org_id_plugin_id_key" UNIQUE("org_id","plugin_id")
);
--> statement-breakpoint
CREATE TABLE "price_books" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid,
	"model" text NOT NULL,
	"provider" text,
	"display_name" text,
	"input_per_mtok_micro_usd" bigint NOT NULL,
	"output_per_mtok_micro_usd" bigint NOT NULL,
	"updated_by_user_id" uuid,
	"updated_by_token_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "price_books_org_id_id_key" UNIQUE("org_id","id"),
	CONSTRAINT "price_books_org_id_model_provider_key" UNIQUE NULLS NOT DISTINCT("org_id","model","provider")
);
--> statement-breakpoint
CREATE TABLE "usage_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"run_id" uuid,
	"job_id" uuid,
	"kind" text NOT NULL,
	"model" text NOT NULL,
	"provider" text NOT NULL,
	"quantity" bigint NOT NULL,
	"key_mode" text NOT NULL,
	"push_status" text DEFAULT 'pending' NOT NULL,
	"reported_to_stripe_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "usage_events_org_id_id_key" UNIQUE("org_id","id"),
	CONSTRAINT "usage_events_one_source_check" CHECK (("usage_events"."run_id" is null) <> ("usage_events"."job_id" is null))
);
--> statement-breakpoint
CREATE TABLE "webhook_endpoints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"url" text NOT NULL,
	"types" text[] DEFAULT '{}' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_by_user_id" uuid,
	"created_by_token_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "webhook_endpoints_org_id_id_key" UNIQUE("org_id","id")
);
--> statement-breakpoint
CREATE TABLE "model_alias_observations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"alias" text NOT NULL,
	"resolved_id" text NOT NULL,
	"first_seen" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "model_alias_observations_key" UNIQUE("provider","alias","resolved_id")
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stripe_webhook_events" (
	"event_id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "system_one_model_routes" (
	"model_id" text NOT NULL,
	"provider" text NOT NULL,
	"provider_model_id" text NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"resolved_ids" text[] DEFAULT '{}' NOT NULL,
	"limits" jsonb NOT NULL,
	"docs_url" text NOT NULL,
	"last_reviewed" date NOT NULL,
	CONSTRAINT "system_one_model_routes_pkey" PRIMARY KEY("model_id","provider")
);
--> statement-breakpoint
CREATE TABLE "system_one_models" (
	"id" text PRIMARY KEY NOT NULL,
	"family" text NOT NULL,
	"kind" text NOT NULL,
	"alias_target" text,
	"status" text NOT NULL,
	"release_date" date,
	"retire_at" date,
	"question_types" text[] DEFAULT '{}' NOT NULL,
	"limits" jsonb,
	"input_modalities" text[] DEFAULT '{}' NOT NULL,
	"weaknesses" text[] DEFAULT '{}' NOT NULL,
	"supersedes" text[] DEFAULT '{}' NOT NULL,
	"docs_url" text NOT NULL,
	"jaggedness_url" text,
	"last_reviewed" date NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "two_factors" ADD CONSTRAINT "two_factors_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_tokens" ADD CONSTRAINT "agent_tokens_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_tokens" ADD CONSTRAINT "agent_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_opportunities" ADD CONSTRAINT "app_opportunities_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_opportunities" ADD CONSTRAINT "app_opportunities_app_fk" FOREIGN KEY ("org_id","app_id") REFERENCES "public"."apps"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_opportunities" ADD CONSTRAINT "app_opportunities_set_fk" FOREIGN KEY ("org_id","set_id") REFERENCES "public"."question_sets"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_set_bindings" ADD CONSTRAINT "app_set_bindings_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_set_bindings" ADD CONSTRAINT "app_set_bindings_app_fk" FOREIGN KEY ("org_id","app_id") REFERENCES "public"."apps"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_set_bindings" ADD CONSTRAINT "app_set_bindings_set_fk" FOREIGN KEY ("org_id","set_id") REFERENCES "public"."question_sets"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_tokens" ADD CONSTRAINT "app_tokens_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_tokens" ADD CONSTRAINT "app_tokens_app_fk" FOREIGN KEY ("org_id","app_id") REFERENCES "public"."apps"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "apps" ADD CONSTRAINT "apps_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_system_one_keys" ADD CONSTRAINT "org_system_one_keys_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_webhook_secrets" ADD CONSTRAINT "org_webhook_secrets_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experiments" ADD CONSTRAINT "experiments_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experiments" ADD CONSTRAINT "experiments_set_fk" FOREIGN KEY ("org_id","set_id") REFERENCES "public"."question_sets"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experiments" ADD CONSTRAINT "experiments_champion_fk" FOREIGN KEY ("org_id","champion_version_id") REFERENCES "public"."question_set_versions"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experiments" ADD CONSTRAINT "experiments_challenger_fk" FOREIGN KEY ("org_id","challenger_version_id") REFERENCES "public"."question_set_versions"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_project_fk" FOREIGN KEY ("org_id","project_id") REFERENCES "public"."projects"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_set_fk" FOREIGN KEY ("org_id","set_id") REFERENCES "public"."question_sets"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_set_versions" ADD CONSTRAINT "question_set_versions_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_set_versions" ADD CONSTRAINT "question_set_versions_set_fk" FOREIGN KEY ("org_id","set_id") REFERENCES "public"."question_sets"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_sets" ADD CONSTRAINT "question_sets_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_sets" ADD CONSTRAINT "question_sets_project_fk" FOREIGN KEY ("org_id","project_id") REFERENCES "public"."projects"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_sets" ADD CONSTRAINT "question_sets_goal_fk" FOREIGN KEY ("org_id","goal_id") REFERENCES "public"."goals"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "release_events" ADD CONSTRAINT "release_events_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "release_events" ADD CONSTRAINT "release_events_set_fk" FOREIGN KEY ("org_id","set_id") REFERENCES "public"."question_sets"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "release_pointers" ADD CONSTRAINT "release_pointers_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "release_pointers" ADD CONSTRAINT "release_pointers_set_fk" FOREIGN KEY ("org_id","set_id") REFERENCES "public"."question_sets"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "release_pointers" ADD CONSTRAINT "release_pointers_version_fk" FOREIGN KEY ("org_id","version_id") REFERENCES "public"."question_set_versions"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dataset_cases" ADD CONSTRAINT "dataset_cases_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dataset_cases" ADD CONSTRAINT "dataset_cases_dataset_fk" FOREIGN KEY ("org_id","dataset_id") REFERENCES "public"."datasets"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dataset_snapshots" ADD CONSTRAINT "dataset_snapshots_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dataset_snapshots" ADD CONSTRAINT "dataset_snapshots_dataset_fk" FOREIGN KEY ("org_id","dataset_id") REFERENCES "public"."datasets"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "datasets" ADD CONSTRAINT "datasets_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "datasets" ADD CONSTRAINT "datasets_set_fk" FOREIGN KEY ("org_id","set_id") REFERENCES "public"."question_sets"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eval_case_results" ADD CONSTRAINT "eval_case_results_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eval_case_results" ADD CONSTRAINT "eval_case_results_eval_run_fk" FOREIGN KEY ("org_id","eval_run_id") REFERENCES "public"."eval_runs"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD CONSTRAINT "eval_runs_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD CONSTRAINT "eval_runs_version_fk" FOREIGN KEY ("org_id","version_id") REFERENCES "public"."question_set_versions"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD CONSTRAINT "eval_runs_dataset_fk" FOREIGN KEY ("org_id","dataset_id") REFERENCES "public"."datasets"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_daily" ADD CONSTRAINT "question_daily_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_items" ADD CONSTRAINT "review_items_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_items" ADD CONSTRAINT "review_items_set_fk" FOREIGN KEY ("org_id","set_id") REFERENCES "public"."question_sets"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_feedback" ADD CONSTRAINT "run_feedback_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_set_fk" FOREIGN KEY ("org_id","set_id") REFERENCES "public"."question_sets"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_version_fk" FOREIGN KEY ("org_id","version_id") REFERENCES "public"."question_set_versions"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_examples" ADD CONSTRAINT "studio_examples_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_examples" ADD CONSTRAINT "studio_examples_session_fk" FOREIGN KEY ("org_id","session_id") REFERENCES "public"."studio_sessions"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_sessions" ADD CONSTRAINT "studio_sessions_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_sessions" ADD CONSTRAINT "studio_sessions_goal_fk" FOREIGN KEY ("org_id","goal_id") REFERENCES "public"."goals"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_daily" ADD CONSTRAINT "usage_daily_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_daily" ADD CONSTRAINT "usage_daily_project_fk" FOREIGN KEY ("org_id","project_id") REFERENCES "public"."projects"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_accounts" ADD CONSTRAINT "billing_accounts_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entitlement_overrides" ADD CONSTRAINT "entitlement_overrides_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plugin_configs" ADD CONSTRAINT "plugin_configs_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_books" ADD CONSTRAINT "price_books_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_endpoints" ADD CONSTRAINT "webhook_endpoints_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "system_one_model_routes" ADD CONSTRAINT "system_one_model_routes_model_id_system_one_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."system_one_models"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "accounts_user_id_idx" ON "accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "memberships_user_id_idx" ON "memberships" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "agent_tokens_org_id_user_id_idx" ON "agent_tokens" USING btree ("org_id","user_id");--> statement-breakpoint
CREATE INDEX "app_set_bindings_org_id_set_id_idx" ON "app_set_bindings" USING btree ("org_id","set_id");--> statement-breakpoint
CREATE UNIQUE INDEX "experiments_one_running_idx" ON "experiments" USING btree ("set_id","channel") WHERE status = 'running';--> statement-breakpoint
CREATE UNIQUE INDEX "question_set_versions_one_draft_idx" ON "question_set_versions" USING btree ("set_id") WHERE status = 'draft';--> statement-breakpoint
CREATE INDEX "release_events_org_id_set_id_at_idx" ON "release_events" USING btree ("org_id","set_id","at");--> statement-breakpoint
CREATE INDEX "dataset_cases_org_id_dataset_id_idx" ON "dataset_cases" USING btree ("org_id","dataset_id");--> statement-breakpoint
CREATE INDEX "eval_case_results_org_id_eval_run_id_idx" ON "eval_case_results" USING btree ("org_id","eval_run_id");--> statement-breakpoint
CREATE INDEX "review_items_org_id_run_id_idx" ON "review_items" USING btree ("org_id","run_id");--> statement-breakpoint
CREATE INDEX "review_items_org_id_set_id_status_idx" ON "review_items" USING btree ("org_id","set_id","status","created_at");--> statement-breakpoint
CREATE INDEX "run_feedback_org_id_run_id_idx" ON "run_feedback" USING btree ("org_id","run_id");--> statement-breakpoint
CREATE INDEX "runs_org_id_id_idx" ON "runs" USING btree ("org_id","id");--> statement-breakpoint
CREATE INDEX "runs_org_id_set_id_created_at_idx" ON "runs" USING btree ("org_id","set_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "runs_org_id_source_created_at_idx" ON "runs" USING btree ("org_id","source","created_at");--> statement-breakpoint
CREATE INDEX "runs_org_id_external_ref_idx" ON "runs" USING btree ("org_id","external_ref");--> statement-breakpoint
CREATE INDEX "runs_org_id_experiment_id_idx" ON "runs" USING btree ("org_id","experiment_id");--> statement-breakpoint
CREATE INDEX "approval_requests_org_id_status_idx" ON "approval_requests" USING btree ("org_id","status","created_at");--> statement-breakpoint
CREATE INDEX "audit_log_org_id_created_at_idx" ON "audit_log" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE INDEX "jobs_org_id_status_idx" ON "jobs" USING btree ("org_id","status","created_at");--> statement-breakpoint
CREATE INDEX "usage_events_org_id_run_id_idx" ON "usage_events" USING btree ("org_id","run_id");--> statement-breakpoint
CREATE INDEX "usage_events_org_id_push_status_idx" ON "usage_events" USING btree ("org_id","push_status","created_at");
--> statement-breakpoint
-- bandwise:security-block:start (generated by src/rls.ts; do not edit by hand)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bandwise_app') THEN
    CREATE ROLE bandwise_app NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bandwise_platform') THEN
    CREATE ROLE bandwise_platform NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
END
$$;
--> statement-breakpoint
GRANT bandwise_platform TO CURRENT_USER;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO bandwise_app, bandwise_platform;
--> statement-breakpoint
ALTER TABLE "organizations" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "organizations" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "organizations" USING (id = nullif(current_setting('app.org_id', true), '')::uuid) WITH CHECK (id = nullif(current_setting('app.org_id', true), '')::uuid);
--> statement-breakpoint
CREATE POLICY user_memberships ON "organizations" FOR SELECT USING (id IN (SELECT m.org_id FROM "memberships" m WHERE m.user_id = nullif(current_setting('app.user_id', true), '')::uuid));
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "organizations" TO bandwise_app;
--> statement-breakpoint
ALTER TABLE "memberships" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "memberships" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "memberships" USING (org_id = nullif(current_setting('app.org_id', true), '')::uuid) WITH CHECK (org_id = nullif(current_setting('app.org_id', true), '')::uuid);
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "memberships" TO bandwise_app;
--> statement-breakpoint
ALTER TABLE "invitations" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "invitations" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "invitations" USING (org_id = nullif(current_setting('app.org_id', true), '')::uuid) WITH CHECK (org_id = nullif(current_setting('app.org_id', true), '')::uuid);
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "invitations" TO bandwise_app;
--> statement-breakpoint
ALTER TABLE "org_system_one_keys" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "org_system_one_keys" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "org_system_one_keys" USING (org_id = nullif(current_setting('app.org_id', true), '')::uuid) WITH CHECK (org_id = nullif(current_setting('app.org_id', true), '')::uuid);
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "org_system_one_keys" TO bandwise_app;
--> statement-breakpoint
ALTER TABLE "agent_tokens" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "agent_tokens" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "agent_tokens" USING (org_id = nullif(current_setting('app.org_id', true), '')::uuid) WITH CHECK (org_id = nullif(current_setting('app.org_id', true), '')::uuid);
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "agent_tokens" TO bandwise_app;
--> statement-breakpoint
ALTER TABLE "org_webhook_secrets" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "org_webhook_secrets" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "org_webhook_secrets" USING (org_id = nullif(current_setting('app.org_id', true), '')::uuid) WITH CHECK (org_id = nullif(current_setting('app.org_id', true), '')::uuid);
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "org_webhook_secrets" TO bandwise_app;
--> statement-breakpoint
ALTER TABLE "apps" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "apps" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "apps" USING (org_id = nullif(current_setting('app.org_id', true), '')::uuid) WITH CHECK (org_id = nullif(current_setting('app.org_id', true), '')::uuid);
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "apps" TO bandwise_app;
--> statement-breakpoint
ALTER TABLE "app_tokens" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "app_tokens" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "app_tokens" USING (org_id = nullif(current_setting('app.org_id', true), '')::uuid) WITH CHECK (org_id = nullif(current_setting('app.org_id', true), '')::uuid);
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "app_tokens" TO bandwise_app;
--> statement-breakpoint
ALTER TABLE "app_opportunities" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "app_opportunities" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "app_opportunities" USING (org_id = nullif(current_setting('app.org_id', true), '')::uuid) WITH CHECK (org_id = nullif(current_setting('app.org_id', true), '')::uuid);
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "app_opportunities" TO bandwise_app;
--> statement-breakpoint
ALTER TABLE "app_set_bindings" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "app_set_bindings" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "app_set_bindings" USING (org_id = nullif(current_setting('app.org_id', true), '')::uuid) WITH CHECK (org_id = nullif(current_setting('app.org_id', true), '')::uuid);
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "app_set_bindings" TO bandwise_app;
--> statement-breakpoint
ALTER TABLE "projects" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "projects" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "projects" USING (org_id = nullif(current_setting('app.org_id', true), '')::uuid) WITH CHECK (org_id = nullif(current_setting('app.org_id', true), '')::uuid);
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "projects" TO bandwise_app;
--> statement-breakpoint
ALTER TABLE "goals" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "goals" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "goals" USING (org_id = nullif(current_setting('app.org_id', true), '')::uuid) WITH CHECK (org_id = nullif(current_setting('app.org_id', true), '')::uuid);
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "goals" TO bandwise_app;
--> statement-breakpoint
ALTER TABLE "question_sets" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "question_sets" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "question_sets" USING (org_id = nullif(current_setting('app.org_id', true), '')::uuid) WITH CHECK (org_id = nullif(current_setting('app.org_id', true), '')::uuid);
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "question_sets" TO bandwise_app;
--> statement-breakpoint
ALTER TABLE "question_set_versions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "question_set_versions" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "question_set_versions" USING (org_id = nullif(current_setting('app.org_id', true), '')::uuid) WITH CHECK (org_id = nullif(current_setting('app.org_id', true), '')::uuid);
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "question_set_versions" TO bandwise_app;
--> statement-breakpoint
ALTER TABLE "release_pointers" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "release_pointers" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "release_pointers" USING (org_id = nullif(current_setting('app.org_id', true), '')::uuid) WITH CHECK (org_id = nullif(current_setting('app.org_id', true), '')::uuid);
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "release_pointers" TO bandwise_app;
--> statement-breakpoint
ALTER TABLE "release_events" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "release_events" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "release_events" USING (org_id = nullif(current_setting('app.org_id', true), '')::uuid) WITH CHECK (org_id = nullif(current_setting('app.org_id', true), '')::uuid);
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "release_events" TO bandwise_app;
--> statement-breakpoint
ALTER TABLE "experiments" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "experiments" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "experiments" USING (org_id = nullif(current_setting('app.org_id', true), '')::uuid) WITH CHECK (org_id = nullif(current_setting('app.org_id', true), '')::uuid);
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "experiments" TO bandwise_app;
--> statement-breakpoint
ALTER TABLE "proposals" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "proposals" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "proposals" USING (org_id = nullif(current_setting('app.org_id', true), '')::uuid) WITH CHECK (org_id = nullif(current_setting('app.org_id', true), '')::uuid);
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "proposals" TO bandwise_app;
--> statement-breakpoint
ALTER TABLE "runs" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "runs" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "runs" USING (org_id = nullif(current_setting('app.org_id', true), '')::uuid) WITH CHECK (org_id = nullif(current_setting('app.org_id', true), '')::uuid);
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "runs" TO bandwise_app;
--> statement-breakpoint
ALTER TABLE "run_feedback" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "run_feedback" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "run_feedback" USING (org_id = nullif(current_setting('app.org_id', true), '')::uuid) WITH CHECK (org_id = nullif(current_setting('app.org_id', true), '')::uuid);
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "run_feedback" TO bandwise_app;
--> statement-breakpoint
ALTER TABLE "review_items" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "review_items" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "review_items" USING (org_id = nullif(current_setting('app.org_id', true), '')::uuid) WITH CHECK (org_id = nullif(current_setting('app.org_id', true), '')::uuid);
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "review_items" TO bandwise_app;
--> statement-breakpoint
ALTER TABLE "datasets" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "datasets" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "datasets" USING (org_id = nullif(current_setting('app.org_id', true), '')::uuid) WITH CHECK (org_id = nullif(current_setting('app.org_id', true), '')::uuid);
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "datasets" TO bandwise_app;
--> statement-breakpoint
ALTER TABLE "dataset_cases" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "dataset_cases" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "dataset_cases" USING (org_id = nullif(current_setting('app.org_id', true), '')::uuid) WITH CHECK (org_id = nullif(current_setting('app.org_id', true), '')::uuid);
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "dataset_cases" TO bandwise_app;
--> statement-breakpoint
ALTER TABLE "dataset_snapshots" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "dataset_snapshots" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "dataset_snapshots" USING (org_id = nullif(current_setting('app.org_id', true), '')::uuid) WITH CHECK (org_id = nullif(current_setting('app.org_id', true), '')::uuid);
--> statement-breakpoint
GRANT SELECT, INSERT ON "dataset_snapshots" TO bandwise_app;
--> statement-breakpoint
ALTER TABLE "eval_runs" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "eval_runs" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "eval_runs" USING (org_id = nullif(current_setting('app.org_id', true), '')::uuid) WITH CHECK (org_id = nullif(current_setting('app.org_id', true), '')::uuid);
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "eval_runs" TO bandwise_app;
--> statement-breakpoint
ALTER TABLE "eval_case_results" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "eval_case_results" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "eval_case_results" USING (org_id = nullif(current_setting('app.org_id', true), '')::uuid) WITH CHECK (org_id = nullif(current_setting('app.org_id', true), '')::uuid);
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "eval_case_results" TO bandwise_app;
--> statement-breakpoint
ALTER TABLE "studio_sessions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "studio_sessions" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "studio_sessions" USING (org_id = nullif(current_setting('app.org_id', true), '')::uuid) WITH CHECK (org_id = nullif(current_setting('app.org_id', true), '')::uuid);
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "studio_sessions" TO bandwise_app;
--> statement-breakpoint
ALTER TABLE "studio_examples" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "studio_examples" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "studio_examples" USING (org_id = nullif(current_setting('app.org_id', true), '')::uuid) WITH CHECK (org_id = nullif(current_setting('app.org_id', true), '')::uuid);
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "studio_examples" TO bandwise_app;
--> statement-breakpoint
ALTER TABLE "question_daily" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "question_daily" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "question_daily" USING (org_id = nullif(current_setting('app.org_id', true), '')::uuid) WITH CHECK (org_id = nullif(current_setting('app.org_id', true), '')::uuid);
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "question_daily" TO bandwise_app;
--> statement-breakpoint
ALTER TABLE "usage_daily" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "usage_daily" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "usage_daily" USING (org_id = nullif(current_setting('app.org_id', true), '')::uuid) WITH CHECK (org_id = nullif(current_setting('app.org_id', true), '')::uuid);
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "usage_daily" TO bandwise_app;
--> statement-breakpoint
ALTER TABLE "billing_accounts" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "billing_accounts" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "billing_accounts" USING (org_id = nullif(current_setting('app.org_id', true), '')::uuid) WITH CHECK (org_id = nullif(current_setting('app.org_id', true), '')::uuid);
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "billing_accounts" TO bandwise_app;
--> statement-breakpoint
ALTER TABLE "entitlement_overrides" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "entitlement_overrides" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "entitlement_overrides" USING (org_id = nullif(current_setting('app.org_id', true), '')::uuid) WITH CHECK (org_id = nullif(current_setting('app.org_id', true), '')::uuid);
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "entitlement_overrides" TO bandwise_app;
--> statement-breakpoint
ALTER TABLE "usage_events" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "usage_events" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "usage_events" USING (org_id = nullif(current_setting('app.org_id', true), '')::uuid) WITH CHECK (org_id = nullif(current_setting('app.org_id', true), '')::uuid);
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "usage_events" TO bandwise_app;
--> statement-breakpoint
ALTER TABLE "approval_requests" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "approval_requests" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "approval_requests" USING (org_id = nullif(current_setting('app.org_id', true), '')::uuid) WITH CHECK (org_id = nullif(current_setting('app.org_id', true), '')::uuid);
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "approval_requests" TO bandwise_app;
--> statement-breakpoint
ALTER TABLE "idempotency_keys" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "idempotency_keys" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "idempotency_keys" USING (org_id = nullif(current_setting('app.org_id', true), '')::uuid) WITH CHECK (org_id = nullif(current_setting('app.org_id', true), '')::uuid);
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "idempotency_keys" TO bandwise_app;
--> statement-breakpoint
ALTER TABLE "jobs" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "jobs" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "jobs" USING (org_id = nullif(current_setting('app.org_id', true), '')::uuid) WITH CHECK (org_id = nullif(current_setting('app.org_id', true), '')::uuid);
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "jobs" TO bandwise_app;
--> statement-breakpoint
ALTER TABLE "webhook_endpoints" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "webhook_endpoints" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "webhook_endpoints" USING (org_id = nullif(current_setting('app.org_id', true), '')::uuid) WITH CHECK (org_id = nullif(current_setting('app.org_id', true), '')::uuid);
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "webhook_endpoints" TO bandwise_app;
--> statement-breakpoint
ALTER TABLE "plugin_configs" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "plugin_configs" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "plugin_configs" USING (org_id = nullif(current_setting('app.org_id', true), '')::uuid) WITH CHECK (org_id = nullif(current_setting('app.org_id', true), '')::uuid);
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "plugin_configs" TO bandwise_app;
--> statement-breakpoint
CREATE POLICY user_lookup ON "memberships" FOR SELECT USING (user_id = nullif(current_setting('app.user_id', true), '')::uuid);
--> statement-breakpoint
CREATE POLICY user_lookup ON "invitations" FOR SELECT USING (lower(email) = (SELECT lower(u.email) FROM "users" u WHERE u.id = nullif(current_setting('app.user_id', true), '')::uuid));
--> statement-breakpoint
ALTER TABLE "price_books" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "price_books" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_read ON "price_books" FOR SELECT USING (org_id IS NULL OR org_id = nullif(current_setting('app.org_id', true), '')::uuid);
--> statement-breakpoint
CREATE POLICY tenant_insert ON "price_books" FOR INSERT WITH CHECK (org_id = nullif(current_setting('app.org_id', true), '')::uuid);
--> statement-breakpoint
CREATE POLICY tenant_update ON "price_books" FOR UPDATE USING (org_id = nullif(current_setting('app.org_id', true), '')::uuid) WITH CHECK (org_id = nullif(current_setting('app.org_id', true), '')::uuid);
--> statement-breakpoint
CREATE POLICY tenant_delete ON "price_books" FOR DELETE USING (org_id = nullif(current_setting('app.org_id', true), '')::uuid);
--> statement-breakpoint
CREATE POLICY platform_rows ON "price_books" TO bandwise_platform USING (org_id IS NULL) WITH CHECK (org_id IS NULL);
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "price_books" TO bandwise_app;
--> statement-breakpoint
ALTER TABLE "audit_log" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "audit_log" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "audit_log" USING (org_id = nullif(current_setting('app.org_id', true), '')::uuid) WITH CHECK (org_id = nullif(current_setting('app.org_id', true), '')::uuid);
--> statement-breakpoint
CREATE POLICY platform_rows ON "audit_log" TO bandwise_platform USING (org_id IS NULL) WITH CHECK (org_id IS NULL);
--> statement-breakpoint
GRANT SELECT, INSERT ON "audit_log" TO bandwise_app;
--> statement-breakpoint
ALTER TABLE "events" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "events" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "events" USING (org_id = nullif(current_setting('app.org_id', true), '')::uuid) WITH CHECK (org_id = nullif(current_setting('app.org_id', true), '')::uuid);
--> statement-breakpoint
CREATE POLICY platform_rows ON "events" TO bandwise_platform USING (org_id IS NULL) WITH CHECK (org_id IS NULL);
--> statement-breakpoint
GRANT SELECT, INSERT ON "events" TO bandwise_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "price_books", "audit_log", "events" TO bandwise_platform;
--> statement-breakpoint
GRANT SELECT ON "system_one_models", "system_one_model_routes", "model_alias_observations", "settings", "stripe_webhook_events" TO bandwise_app;
--> statement-breakpoint
GRANT INSERT, UPDATE ON "model_alias_observations" TO bandwise_app;
--> statement-breakpoint
GRANT INSERT ON "stripe_webhook_events" TO bandwise_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "system_one_models", "system_one_model_routes", "model_alias_observations", "settings", "stripe_webhook_events" TO bandwise_platform;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "users", "sessions", "accounts", "verification_tokens", "two_factors", "device_codes" TO bandwise_app;
--> statement-breakpoint
ALTER TABLE "question_sets" ADD CONSTRAINT "question_sets_draft_version_fk" FOREIGN KEY ("org_id", "draft_version_id") REFERENCES "question_set_versions" ("org_id", "id");
--> statement-breakpoint
CREATE OR REPLACE FUNCTION bandwise_question_set_versions_immutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'draft' THEN
      RAISE EXCEPTION 'immutable_version: version % is %, it cannot be deleted', OLD.id, OLD.status
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.status = 'published' THEN
    -- The one allowed change: published to archived, every other column unchanged.
    IF NEW.status = 'archived' AND (to_jsonb(NEW) - 'status') = (to_jsonb(OLD) - 'status') THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'immutable_version: version % is published', OLD.id
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF OLD.status = 'archived' THEN
    RAISE EXCEPTION 'immutable_version: version % is archived', OLD.id
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER question_set_versions_immutable BEFORE UPDATE OR DELETE ON "question_set_versions" FOR EACH ROW EXECUTE FUNCTION bandwise_question_set_versions_immutable();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION bandwise_dataset_cases_split_immutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.split IS DISTINCT FROM OLD.split THEN
    RAISE EXCEPTION 'immutable_split: dataset case % keeps split %', OLD.id, OLD.split
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER dataset_cases_split_immutable BEFORE UPDATE ON "dataset_cases" FOR EACH ROW EXECUTE FUNCTION bandwise_dataset_cases_split_immutable();
--> statement-breakpoint
CREATE TABLE "runs_default" PARTITION OF "runs" DEFAULT;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION bandwise_ensure_runs_partition(month date) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE
  start_at date := date_trunc('month', month)::date;
  name text := 'runs_' || to_char(start_at, 'YYYY_MM');
BEGIN
  IF to_regclass(name) IS NULL THEN
    EXECUTE format('CREATE TABLE %I PARTITION OF runs FOR VALUES FROM (%L) TO (%L)',
      name, start_at, (start_at + interval '1 month')::date);
  END IF;
  RETURN name;
END
$$;
--> statement-breakpoint
SELECT bandwise_ensure_runs_partition((date_trunc('month', now()) + make_interval(months => i))::date) FROM generate_series(0, 2) AS i;
-- bandwise:security-block:end
