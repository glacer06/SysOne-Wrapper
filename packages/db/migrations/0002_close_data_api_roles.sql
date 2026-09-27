-- Migration 0002: close schema public to the Supabase Data API roles (ADR-018).
--
-- Supabase grants anon, authenticated and service_role every privilege on new tables, sequences and
-- functions in public through default privileges owned by postgres and supabase_admin, plus USAGE on
-- the schema. service_role also has BYPASSRLS. Bandwise never uses those roles or the Data API, so
-- this migration removes every grant they hold in public and the defaults that would grant more.
--
-- Portable: on PGlite and plain Postgres the roles do not exist and the role blocks do nothing.
-- migrate.ts re-checks the catalog after every run (findDataApiExposure) and fails the run when any
-- of these roles can reach a table, sequence or the schema again.

-- 1. Explicit grants and default privileges, per role that exists.
DO $$
DECLARE
  target text;
  owner_role text;
BEGIN
  FOREACH target IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = target) THEN
      CONTINUE;
    END IF;
    EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM %I', target);
    EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM %I', target);
    EXECUTE format('REVOKE ALL ON ALL ROUTINES IN SCHEMA public FROM %I', target);
    EXECUTE format('REVOKE ALL ON SCHEMA public FROM %I', target);

    -- Default privileges belong to the role that creates the objects. The migrating role creates
    -- ours; postgres and supabase_admin carry the Supabase defaults. ALTER DEFAULT PRIVILEGES FOR
    -- ROLE needs membership in that role, which a Supabase postgres role lacks for supabase_admin.
    FOREACH owner_role IN ARRAY ARRAY[current_user::text, 'postgres', 'supabase_admin'] LOOP
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = owner_role) THEN
        CONTINUE;
      END IF;
      IF NOT pg_has_role(current_user, owner_role, 'MEMBER') THEN
        RAISE NOTICE 'bandwise 0002: % is not a member of %, default privileges for % left as they are',
          current_user, owner_role, owner_role;
        CONTINUE;
      END IF;
      BEGIN
        EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE ALL ON TABLES FROM %I', owner_role, target);
        EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE ALL ON SEQUENCES FROM %I', owner_role, target);
        EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM %I', owner_role, target);
        EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I REVOKE ALL ON TABLES FROM %I', owner_role, target);
        EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I REVOKE ALL ON SEQUENCES FROM %I', owner_role, target);
        EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I REVOKE ALL ON FUNCTIONS FROM %I', owner_role, target);
      EXCEPTION WHEN insufficient_privilege THEN
        RAISE NOTICE 'bandwise 0002: not allowed to change default privileges for %, left as they are', owner_role;
      END;
    END LOOP;
  END LOOP;
END
$$;
--> statement-breakpoint
-- 2. Schema public: USAGE only by explicit grant. Postgres grants USAGE on public to PUBLIC, which
-- every role inherits, anon included. bandwise_app and bandwise_platform hold explicit grants from
-- 0001. The migrating role keeps USAGE and CREATE so later migrations still run.
DO $$
BEGIN
  EXECUTE format('GRANT USAGE, CREATE ON SCHEMA public TO %I', current_user);
  REVOKE ALL ON SCHEMA public FROM PUBLIC;
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'bandwise 0002: not allowed to revoke USAGE on schema public from PUBLIC';
END
$$;
