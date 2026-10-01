-- Migration 0008: per-token limits for hosted runs.
--
-- run_limits holds one fixed window per limit key: a per-minute run count per token (or per user
-- for a console session) and a per-UTC-day System One spend in micro-USD per token. One row per
-- key, updated in a single locked upsert, so the limits hold across every server instance. Keys are
-- stored as SHA-256 hashes of a string that names the org and the token, key or user id, so the
-- table holds no org data in the clear. An auth-class table: no org_id, no tenant RLS, and the
-- grant is here because the 0001 security block is frozen.

CREATE TABLE "run_limits" (
	"key_hash" text PRIMARY KEY NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"used" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX "run_limits_window_start_idx" ON "run_limits" USING btree ("window_start");--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "run_limits" TO bandwise_app;
