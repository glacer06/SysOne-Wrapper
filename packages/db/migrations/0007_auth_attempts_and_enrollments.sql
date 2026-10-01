-- Migration 0007: console sign-in limits and admin-issued two-factor enrollment (D3, from PJ's
-- Security review of PR #21).
--
-- auth_attempts holds one fixed window per limit key (per email, per IP), so the sign-in limits hold
-- across every server instance. Keys are stored as SHA-256 hashes, never as emails or IPs.
-- console_enrollments holds one hashed, expiring enrollment code per user. console-member issues it,
-- and the two-factor setup page needs it, so a password alone cannot enroll TOTP.
-- Both are auth tables: no org_id, no tenant RLS, the same grants as the other auth tables.

CREATE TABLE "auth_attempts" (
	"key_hash" text PRIMARY KEY NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "console_enrollments" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"code_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "console_enrollments" ADD CONSTRAINT "console_enrollments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auth_attempts_window_start_idx" ON "auth_attempts" USING btree ("window_start");--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "auth_attempts", "console_enrollments" TO bandwise_app;
