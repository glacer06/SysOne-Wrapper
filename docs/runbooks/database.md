# Runbook: database migrations

Production Postgres is a Supabase project (ADR-018). Bandwise uses it as plain Postgres: our Drizzle migrations, our roles (`bandwise_app`, `bandwise_platform`) and our RLS. Migrations run from one manual GitHub workflow, `.github/workflows/db-migrate.yml`. Nobody runs `pnpm db:migrate` against production from a laptop.

## One-time setup

1. In GitHub, open Settings, then Environments, and create two environments: `preview` and `production`. On `production`, add Nick (or PJ) as a required reviewer, so every production run waits for a person to approve it.
2. On each environment, add the secret `DATABASE_URL_MIGRATE`: the **direct** connection string for that database, as the migrating role (on Supabase, `postgres`). From the Supabase dashboard: Connect, then Direct connection. It looks like `postgresql://postgres:<password>@db.<project-ref>.supabase.co:5432/postgres`. Paste it into the GitHub form only. Never paste it into chat, an issue, a commit or a shell history.
3. Optional, on each environment: the secret `DATABASE_CA_CERT`, the PEM text of Supabase's server CA (Project Settings, Database, SSL configuration, download the certificate). With it set, the migrator uses TLS and checks the server certificate against that CA. Leave `sslmode` out of the URL then, because node-postgres lets URL parameters replace the CA setting. Without it, add the SSL parameters Supabase documents to the URL. If node-postgres rejects the certificate, set `DATABASE_CA_CERT`.
4. `preview` points at a Supabase branch or a separate dev project, never at production.

**IPv4.** Supabase's direct connection hostname resolves to IPv6 only, unless the project has the IPv4 add-on. GitHub-hosted runners have no IPv6, so the job fails to connect. Either turn on the IPv4 add-on (keeps the direct connection) or, with Nick's sign-off, use the Supavisor **session** pooler string (port 5432 on the pooler host), which supports everything a migration does. Never use the transaction pooler (port 6543) for migrations: the workflow refuses a URL on port 6543.

## Run a migration

1. Merge the migration to `main`. The CI gate has already run it on PGlite.
2. Actions, then Database migrate, then Run workflow. Pick `preview` first. Or: `gh workflow run db-migrate.yml -f environment=preview`.
3. The log shows one line: `applied N migration(s), seeded M platform row(s)`. It never prints the URL. On a failure it prints the Postgres error with the URL and password removed.
4. Check the preview app, then run it again with `production` and approve the run.

Re-running is safe. Applied migrations are recorded by hash in `bandwise_migrations` and skipped, and the platform seed never overwrites existing rows.

## Supabase notes

- **App traffic** from Vercel goes through the Supavisor pooler in transaction mode (port 6543) with prepared statements off. `set_config('app.org_id', ..., true)` is transaction-local, so tenant context never leaks between pooled clients.
- **Migrations** use the direct connection (see IPv4 above). They run in one transaction and need a session that lasts the whole run.
- **Data API off.** In the dashboard, turn the Data API off (or expose no schema to it). The anon and service keys are never used by any Bandwise app.
- **Migration 0002 (`0002_close_data_api_roles.sql`).** A fresh Supabase project grants `anon`, `authenticated` and `service_role` every privilege on new tables, sequences and functions in `public` through default privileges owned by `postgres` and `supabase_admin`, plus USAGE on the schema. `service_role` also has BYPASSRLS. Migration 0002, for each of those roles that exists:
  - revokes all privileges on every table, sequence and routine in `public`, and USAGE and CREATE on the schema;
  - revokes their default privileges (tables, sequences, functions; per schema and global) for the migrating role, `postgres` and `supabase_admin`, where the migrating role is a member of that owner. On Supabase `postgres` is not a member of `supabase_admin`, so those defaults stay and the migration logs a NOTICE. They only apply to objects `supabase_admin` creates, and we create none;
  - revokes USAGE on `public` from PUBLIC (every role inherits PUBLIC), after granting USAGE and CREATE to the migrating role. `bandwise_app` and `bandwise_platform` keep their explicit grants from 0001.
- **The guard.** After every run, in the same transaction, the migrator lists anything in `public` (tables, views, sequences, partitions and the schema itself) that one of the three roles can use. If the list is not empty the run fails and rolls back, naming the role and object. Fix the migration or revoke the manual grant; do not loosen the guard.
- **Migration 0004 (`0004_supabase_performance_advisor.sql`).** From the performance advisor pass of 2026-09-28. It adds an index for each of 23 foreign keys and replaces every RLS policy: settings are read once per statement, and no role has two permissive policies for the same table and command (`.claude/skills/bandwise-builder/references/data-model.md`, RLS policy template). Access for `bandwise_app` is unchanged. `bandwise_platform` loses the rows of whatever org `app.org_id` named on `price_books`, `audit_log` and `events`, which no code used. The indexes are plain `CREATE INDEX`, because a migration runs in one transaction and `CONCURRENTLY` cannot. That blocks writes to each table while its index builds, which is instant on the empty production database. A later index on a table with real traffic needs its own plan.

## After a production run: re-run the advisors

Open the Supabase dashboard, then Advisors, and check Performance and Security (or ask an agent to run the Supabase MCP `get_advisors` for the project, type `performance`, then `security`). After 0004, `unindexed_foreign_keys`, `auth_rls_initplan` and `multiple_permissive_policies` should be gone. `unused_index` grows by the 23 new indexes and stays until real traffic uses them; ignore it until then, and ignore `auth_db_connections_absolute`. Anything else new is a finding: open an issue before the next migration.

## The app login role

The app never connects as `postgres`. After the first migration, create a login role that is a member of `bandwise_app` (NOLOGIN, no BYPASSRLS). Run this as the migrating role in the Supabase SQL editor or `psql`:

```sql
CREATE ROLE bandwise_console LOGIN INHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE IN ROLE bandwise_app;
```

Then set its password with `\password bandwise_console` in `psql`, which prompts and never writes the password to a log or history. Generate the password in the team vault and keep it there. It goes from the vault into Vercel's `DATABASE_URL` for that environment, never into chat, a ticket or the repo. Through Supavisor the user name is `bandwise_console.<project-ref>`. Rotate it with `\password` and update Vercel.

## Rollback

- A failed migration step changes nothing: all pending migrations and the guard run in one transaction. The platform seed runs after it in its own transaction, so a seed failure leaves the migrations applied; fix the cause and run the workflow again.
- Migrations are forward only. To undo an applied one, write a new migration that reverses it. Never edit an applied migration file: its hash changes and the migrator would try to apply it again.
- Do not add a migration that grants `anon`, `authenticated` or `service_role` anything. If a Supabase feature ever needs it, that is an ADR first.
- Data loss or a bad data change: restore from Supabase backups (point-in-time recovery where the plan has it) into a new project, check it, then repoint `DATABASE_URL` and `DATABASE_URL_MIGRATE`.
