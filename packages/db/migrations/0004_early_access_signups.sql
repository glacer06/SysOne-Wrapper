-- Migration 0004: early-access signups (ADR-018).
--
-- A platform table with no org_id. The app role gets no grant on it. The console's public route
-- calls bandwise_early_access_submit(), a SECURITY DEFINER function owned by bandwise_platform,
-- which applies the rate limits and an idempotent insert and returns only 'accepted' or
-- 'rate_limited'. So a leaked app connection can add signups but can never read the list, and the
-- response never says whether an email was already on it.
--
-- Limits live here, not in the caller: at most 5 new signups per IP hash and 300 in total per
-- rolling hour. Repeat submissions of a known email change nothing, so they need no limit.

CREATE TABLE "early_access_signups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"company" text,
	"role" text,
	"use_case" text,
	"source_page" text,
	"ip_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"confirmed_at" timestamp with time zone,
	"unsubscribed_at" timestamp with time zone,
	CONSTRAINT "early_access_signups_email_check" CHECK (length("early_access_signups"."email") between 3 and 254 and position('@' in "early_access_signups"."email") > 1),
	CONSTRAINT "early_access_signups_lengths_check" CHECK (coalesce(length("early_access_signups"."name"), 0) <= 100 and coalesce(length("early_access_signups"."company"), 0) <= 120 and coalesce(length("early_access_signups"."role"), 0) <= 80 and coalesce(length("early_access_signups"."use_case"), 0) <= 1000 and coalesce(length("early_access_signups"."source_page"), 0) <= 200 and length("early_access_signups"."ip_hash") = 64)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "early_access_signups_email_key" ON "early_access_signups" USING btree (lower("email"));--> statement-breakpoint
CREATE INDEX "early_access_signups_ip_hash_created_at_idx" ON "early_access_signups" USING btree ("ip_hash","created_at");--> statement-breakpoint
CREATE INDEX "early_access_signups_created_at_idx" ON "early_access_signups" USING btree ("created_at");
--> statement-breakpoint
ALTER TABLE "early_access_signups" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "early_access_signups" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY platform_rows ON "early_access_signups" TO bandwise_platform USING (true) WITH CHECK (true);
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "early_access_signups" TO bandwise_platform;
--> statement-breakpoint
CREATE FUNCTION bandwise_early_access_submit(
  p_email text,
  p_name text,
  p_company text,
  p_role text,
  p_use_case text,
  p_source_page text,
  p_ip_hash text
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  -- One signup at a time, so two concurrent requests cannot both slip under the limits.
  PERFORM pg_advisory_xact_lock(hashtext('bandwise_early_access_submit'));
  IF (SELECT count(*) FROM early_access_signups
      WHERE ip_hash = p_ip_hash AND created_at > now() - interval '1 hour') >= 5
     OR (SELECT count(*) FROM early_access_signups
      WHERE created_at > now() - interval '1 hour') >= 300 THEN
    RETURN 'rate_limited';
  END IF;
  INSERT INTO early_access_signups (email, name, company, role, use_case, source_page, ip_hash)
  VALUES (p_email, p_name, p_company, p_role, p_use_case, p_source_page, p_ip_hash)
  ON CONFLICT ((lower(email))) DO NOTHING;
  RETURN 'accepted';
END
$$;
--> statement-breakpoint
-- ALTER ... OWNER TO needs CREATE on the schema for the new owner. Grant it for this statement only.
GRANT CREATE ON SCHEMA public TO bandwise_platform;
--> statement-breakpoint
ALTER FUNCTION bandwise_early_access_submit(text, text, text, text, text, text, text) OWNER TO bandwise_platform;
--> statement-breakpoint
REVOKE CREATE ON SCHEMA public FROM bandwise_platform;
--> statement-breakpoint
REVOKE ALL ON FUNCTION bandwise_early_access_submit(text, text, text, text, text, text, text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION bandwise_early_access_submit(text, text, text, text, text, text, text) TO bandwise_app;
