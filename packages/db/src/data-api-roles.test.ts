// Migration 0002 against stand-ins for Supabase's Data API roles (ADR-018).
//
// Each suite boots its own PGlite, creates anon, authenticated, service_role and supabase_admin, and
// grants them what a fresh Supabase project grants in schema public: USAGE on the schema and default
// privileges (ALL on tables, sequences and functions) for the roles that create objects. Then it runs
// every migration and checks that none of the three roles can reach anything in public.
//
// The first suite migrates as a superuser, like the other PGlite suites. The second migrates as a
// plain role that owns schema public but is not a member of supabase_admin, which is how the
// postgres role looks on Supabase, so the NOTICE path for supabase_admin's defaults runs.

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DATA_API_ROLES, findDataApiExposure } from "./data-api-roles.js";
import type { DrizzleDb } from "./internal/drizzle.js";
import { migrateDrizzle, MIGRATIONS_DIR } from "./migrate.js";
import { APP_ROLE, PLATFORM_ROLE } from "./rls.js";
import * as schema from "./schema/index.js";
import { pgErrorOf } from "./testing/errors.js";

/** Every migration in the journal, so adding one does not break these counts. */
const MIGRATION_COUNT = (
  JSON.parse(readFileSync(join(MIGRATIONS_DIR, "meta", "_journal.json"), "utf8")) as { entries: unknown[] }
).entries.length;

const ROLES = DATA_API_ROLES.join(", ");

/** What a Supabase project has in public before our first migration, for `owners`. */
function supabaseDefaults(owners: string[]): string {
  return [
    "CREATE ROLE anon NOLOGIN NOINHERIT",
    "CREATE ROLE authenticated NOLOGIN NOINHERIT",
    "CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS",
    "CREATE ROLE supabase_admin NOLOGIN",
    `GRANT USAGE ON SCHEMA public TO ${ROLES}`,
    ...owners.flatMap((o) => [
      `ALTER DEFAULT PRIVILEGES FOR ROLE ${o} IN SCHEMA public GRANT ALL ON TABLES TO ${ROLES}`,
      `ALTER DEFAULT PRIVILEGES FOR ROLE ${o} IN SCHEMA public GRANT ALL ON SEQUENCES TO ${ROLES}`,
      `ALTER DEFAULT PRIVILEGES FOR ROLE ${o} IN SCHEMA public GRANT ALL ON FUNCTIONS TO ${ROLES}`,
    ]),
  ]
    .map((s) => `${s};`)
    .join("\n");
}

async function rows<T>(pglite: PGlite, query: string, params: unknown[] = []): Promise<T[]> {
  return (await pglite.query<T>(query, params)).rows;
}

/** Default-privilege entries (owner, object type, grantee) that give a Data API role anything. */
async function defaultGrants(pglite: PGlite): Promise<{ owner: string; objtype: string; grantee: string }[]> {
  return rows(
    pglite,
    `select distinct o.rolname as owner, d.defaclobjtype::text as objtype, g.rolname as grantee
     from pg_default_acl d
     join pg_roles o on o.oid = d.defaclrole
     cross join lateral aclexplode(d.defaclacl) a
     join pg_roles g on g.oid = a.grantee
     where g.rolname = any($1) order by 1, 2, 3`,
    [[...DATA_API_ROLES]],
  );
}

/** Every relation in public, partitions and the journal table included. */
async function relations(pglite: PGlite): Promise<{ oid: number; relname: string; relkind: string }[]> {
  return rows(
    pglite,
    `select c.oid::int as oid, c.relname, c.relkind from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm', 'f', 'S') order by 2`,
  );
}

function checkNoAccess(get: () => PGlite) {
  it.each([...DATA_API_ROLES])("%s has no privilege on any table or sequence in public", async (role) => {
    const pglite = get();
    const all = await relations(pglite);
    expect(all.length).toBeGreaterThan(40);
    const reachable: string[] = [];
    for (const r of all) {
      const [row] = await rows<{ ok: boolean }>(
        pglite,
        r.relkind === "S"
          ? "select has_sequence_privilege($1, $2::oid, 'USAGE,SELECT,UPDATE') as ok"
          : "select has_table_privilege($1, $2::oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') as ok",
        [role, r.oid],
      );
      if (row?.ok === true) reachable.push(r.relname);
    }
    expect(reachable).toEqual([]);
  });

  it.each([...DATA_API_ROLES])("%s has no USAGE or CREATE on schema public", async (role) => {
    const [row] = await rows<{ usage: boolean; create: boolean }>(
      get(),
      "select has_schema_privilege($1, 'public', 'USAGE') as usage, has_schema_privilege($1, 'public', 'CREATE') as create",
      [role],
    );
    expect(row).toEqual({ usage: false, create: false });
  });

  it.each([...DATA_API_ROLES])("%s holds no explicit grant on a function in public", async (role) => {
    const found = await rows<{ proname: string }>(
      get(),
      `select p.proname from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
       cross join lateral aclexplode(p.proacl) a
       join pg_roles g on g.oid = a.grantee
       where n.nspname = 'public' and g.rolname = $1`,
      [role],
    );
    expect(found).toEqual([]);
  });

  it.each([...DATA_API_ROLES])("%s cannot SELECT from organizations or runs", async (role) => {
    const pglite = get();
    await pglite.exec(`SET ROLE ${role}`);
    try {
      for (const table of ["organizations", "runs", "org_system_one_keys", "audit_log"]) {
        const error = await pgErrorOf(pglite.query(`select count(*) from public.${table}`));
        expect(error).toMatch(/permission denied/);
      }
    } finally {
      await pglite.exec("RESET ROLE");
    }
  });

  it("keeps schema USAGE for the Bandwise roles", async () => {
    const found = await rows<{ rolname: string; usage: boolean }>(
      get(),
      "select rolname, has_schema_privilege(rolname, 'public', 'USAGE') as usage from pg_roles where rolname = any($1) order by 1",
      [[APP_ROLE, PLATFORM_ROLE]],
    );
    expect(found).toEqual([
      { rolname: APP_ROLE, usage: true },
      { rolname: PLATFORM_ROLE, usage: true },
    ]);
  });

  it("the guard finds nothing", async () => {
    const db: DrizzleDb = drizzle(get(), { schema, casing: "snake_case" });
    expect(await findDataApiExposure(db)).toEqual([]);
  });
}

describe("migration 0002, migrating as a superuser", () => {
  let pglite: PGlite;
  let db: DrizzleDb;

  beforeAll(async () => {
    pglite = new PGlite();
    await pglite.exec(supabaseDefaults(["postgres", "supabase_admin"]));
    expect((await defaultGrants(pglite)).length).toBe(18);
    db = drizzle(pglite, { schema, casing: "snake_case" });
    expect(await migrateDrizzle(db)).toBe(MIGRATION_COUNT);
  });

  afterAll(async () => {
    await pglite.close();
  });

  checkNoAccess(() => pglite);

  it("removes the default privileges of postgres and supabase_admin", async () => {
    expect(await defaultGrants(pglite)).toEqual([]);
  });

  it("a table created after migration grants nothing to the Data API roles", async () => {
    await pglite.exec("CREATE TABLE probe_after_0002 (id int)");
    await pglite.exec("CREATE SEQUENCE probe_after_0002_seq");
    try {
      expect(await findDataApiExposure(db)).toEqual([]);
    } finally {
      await pglite.exec("DROP TABLE probe_after_0002; DROP SEQUENCE probe_after_0002_seq");
    }
  });

  it("the migrator refuses to finish when a grant comes back, and rolls back", async () => {
    await pglite.exec("GRANT SELECT ON organizations TO anon; GRANT USAGE ON SCHEMA public TO service_role");
    try {
      const error = await pgErrorOf(migrateDrizzle(db));
      expect(error).toContain("Supabase Data API role in 2 place(s)");
      expect(error).toContain("anon on organizations (SELECT)");
      expect(error).toContain("service_role on schema public (USAGE)");
    } finally {
      await pglite.exec("REVOKE SELECT ON organizations FROM anon; REVOKE USAGE ON SCHEMA public FROM service_role");
    }
    expect(await migrateDrizzle(db)).toBe(0);
  });
});

describe("migration 0002, migrating as a schema owner outside supabase_admin", () => {
  let pglite: PGlite;

  beforeAll(async () => {
    pglite = new PGlite();
    // The stand-in for Supabase's postgres role: owns schema public, can create roles, is not a
    // superuser and is not a member of supabase_admin.
    await pglite.exec("CREATE ROLE migrator NOLOGIN NOSUPERUSER CREATEROLE; ALTER SCHEMA public OWNER TO migrator;");
    await pglite.exec(supabaseDefaults(["migrator", "supabase_admin"]));
    await pglite.exec("SET ROLE migrator");
    const db: DrizzleDb = drizzle(pglite, { schema, casing: "snake_case" });
    expect(await migrateDrizzle(db)).toBe(MIGRATION_COUNT);
    await pglite.exec("RESET ROLE");
  });

  afterAll(async () => {
    await pglite.close();
  });

  checkNoAccess(() => pglite);

  it("removes the migrating role's defaults and leaves supabase_admin's, which it may not change", async () => {
    const left = await defaultGrants(pglite);
    expect(left.every((g) => g.owner === "supabase_admin")).toBe(true);
    expect(left.map((g) => g.grantee).sort()).toEqual(
      [...DATA_API_ROLES, ...DATA_API_ROLES, ...DATA_API_ROLES].sort(),
    );
  });
});
