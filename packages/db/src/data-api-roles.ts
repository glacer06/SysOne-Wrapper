// The Supabase Data API roles (ADR-018). Bandwise never uses them, and migration 0002 removes every
// grant they hold in schema public. findDataApiExposure is the guard that keeps it that way: the
// migrator runs it after every migration run and fails the run when it returns anything, so a later
// migration cannot grant these roles access without someone noticing.
//
// On PGlite and plain Postgres the roles do not exist and the query returns no rows.

import { sql } from "drizzle-orm";

import type { DrizzleDb } from "./internal/drizzle.js";

/** Roles Supabase creates for PostgREST. service_role has BYPASSRLS. */
export const DATA_API_ROLES = ["anon", "authenticated", "service_role"] as const;

export interface DataApiExposure {
  role: string;
  /** `schema public`, or the table, view or sequence name. */
  object: string;
  /** The privileges the role holds on it, directly, through PUBLIC or through a role it belongs to. */
  privileges: string;
}

const TABLE_PRIVILEGES = ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER"];
const SEQUENCE_PRIVILEGES = ["USAGE", "SELECT", "UPDATE"];

const roleList = DATA_API_ROLES.map((r) => `'${r}'`).join(", ");

function held(check: string, privileges: string[]): string {
  const parts = privileges.map((p) => `CASE WHEN ${check.replace("$P", p)} THEN '${p}' END`);
  return `concat_ws(',', ${parts.join(", ")})`;
}

/**
 * Every table, view, materialized view, foreign table and sequence in public, plus the schema
 * itself, that one of DATA_API_ROLES can use. Partitions are included.
 */
export const DATA_API_EXPOSURE_QUERY = `
with roles as (select rolname from pg_roles where rolname in (${roleList})),
relations as (
  select c.oid, c.relname, c.relkind from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm', 'f', 'S')
),
found as (
  select r.rolname as role, 'schema public' as object,
    ${held("has_schema_privilege(r.rolname, 'public', '$P')", ["USAGE", "CREATE"])} as privileges
  from roles r
  union all
  select r.rolname, x.relname,
    ${held("has_table_privilege(r.rolname, x.oid, '$P')", TABLE_PRIVILEGES)}
  from roles r cross join relations x where x.relkind <> 'S'
  union all
  select r.rolname, x.relname,
    ${held("has_sequence_privilege(r.rolname, x.oid, '$P')", SEQUENCE_PRIVILEGES)}
  from roles r cross join relations x where x.relkind = 'S'
)
select role, object, privileges from found where privileges <> '' order by role, object`;

/** Runs the exposure query on a drizzle handle or transaction. */
export async function findDataApiExposure(db: Pick<DrizzleDb, "execute">): Promise<DataApiExposure[]> {
  const result = (await db.execute(sql.raw(DATA_API_EXPOSURE_QUERY))) as { rows: DataApiExposure[] };
  return result.rows;
}

/** The error the migrator throws. Names objects and roles only, never a connection detail. */
export function dataApiExposureError(found: DataApiExposure[]): Error {
  const sample = found
    .slice(0, 10)
    .map((f) => `${f.role} on ${f.object} (${f.privileges})`)
    .join("; ");
  return new Error(
    `schema public is reachable by a Supabase Data API role in ${found.length} place(s): ${sample}. ` +
      "Migration 0002 revokes these grants; a later migration or a manual grant has added them back.",
  );
}
