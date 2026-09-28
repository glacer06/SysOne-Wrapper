-- Migration 0003: pin search_path on Bandwise functions.
--
-- The Supabase security advisor flags functions whose search_path follows the caller
-- (lint 0011, function_search_path_mutable). None of these run as SECURITY DEFINER, so the risk is
-- low, but a pinned path means an object created later in another schema can never shadow a name
-- these functions call. pg_catalog comes first so built-ins always win.

ALTER FUNCTION bandwise_question_set_versions_immutable() SET search_path = pg_catalog, public;
--> statement-breakpoint
ALTER FUNCTION bandwise_dataset_cases_split_immutable() SET search_path = pg_catalog, public;
--> statement-breakpoint
ALTER FUNCTION bandwise_ensure_runs_partition(date) SET search_path = pg_catalog, public;
