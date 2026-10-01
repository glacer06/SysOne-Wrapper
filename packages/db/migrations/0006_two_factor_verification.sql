-- Migration 0006: the Better Auth 1.7 two-factor fields (ADR-002, D3).
--
-- verified is false while a TOTP secret waits for its first code, so a half-finished setup never
-- counts as two-factor. failed_verification_count and locked_until lock an account for a while
-- after repeated failed codes. two_factors is an auth table: no tenant RLS, grants unchanged.

ALTER TABLE "two_factors" ADD COLUMN "verified" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "two_factors" ADD COLUMN "failed_verification_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "two_factors" ADD COLUMN "locked_until" timestamp with time zone;
