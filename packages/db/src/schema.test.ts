// Schema scan against the migrated database: table classes, RLS, policies, setting names,
// org_id-leading indexes, role attributes and grants.

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { MIGRATIONS_DIR } from "./migrate.js";
import { repos } from "./repos/index.js";
import { ALLOWED_POLICY_SETTINGS, APP_ROLE, securityBlock, TENANT_SETTING } from "./rls.js";
import {
  ALL_TABLES,
  ALL_TENANT_SCOPED,
  APPEND_ONLY_TABLES,
  AUTH_TABLES,
  ORG_TABLE,
  PLATFORM_TABLES,
} from "./schema/classes.js";
import { seedOrgs, systemContext, TWO_ORG_SEED } from "./seed.js";
import { createTestDatabase, type TestDatabase } from "./testing/harness.js";

let t: TestDatabase;

beforeAll(async () => {
  t = await createTestDatabase();
});

afterAll(async () => {
  await t.close();
});

async function rows<T>(query: string, params: unknown[] = []): Promise<T[]> {
  return (await t.pglite.query<T>(query, params)).rows;
}

describe("migration 0001", () => {
  it("ends with the generated security block, unchanged", () => {
    const sql = readFileSync(join(MIGRATIONS_DIR, "0001_init.sql"), "utf8");
    expect(sql).toContain(securityBlock());
  });

  it("puts every public table in exactly one class", async () => {
    const found = await rows<{ relname: string }>(
      `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relispartition
       and c.relname <> 'bandwise_migrations' order by 1`,
    );
    expect(found.map((r) => r.relname).sort()).toEqual([...ALL_TABLES].sort());
    expect(new Set(ALL_TABLES).size).toBe(ALL_TABLES.length);
  });
});

describe("row level security", () => {
  it.each([...ALL_TENANT_SCOPED])("%s has RLS enabled and forced", async (table) => {
    const [row] = await rows<{ relrowsecurity: boolean; relforcerowsecurity: boolean }>(
      "select relrowsecurity, relforcerowsecurity from pg_class where relname = $1",
      [table],
    );
    expect(row).toEqual({ relrowsecurity: true, relforcerowsecurity: true });
  });

  it.each([...ALL_TENANT_SCOPED])("%s has a policy on app.org_id", async (table) => {
    const policies = await rows<{ qual: string | null; with_check: string | null }>(
      "select qual, with_check from pg_policies where schemaname = 'public' and tablename = $1",
      [table],
    );
    const column = table === ORG_TABLE ? "id" : "org_id";
    const onOrg = policies.some(
      (p) => (p.qual ?? "").includes(`current_setting('${TENANT_SETTING}'`) && (p.qual ?? "").includes(column),
    );
    expect(onOrg).toBe(true);
  });

  it.each([...ALL_TENANT_SCOPED])("%s has an index that starts with org_id", async (table) => {
    const column = table === ORG_TABLE ? "id" : "org_id";
    const [row] = await rows<{ n: number }>(
      `select count(*)::int as n from pg_index i
       join pg_class c on c.oid = i.indrelid
       join pg_attribute a on a.attrelid = c.oid and a.attnum = i.indkey[0]
       where c.relname = $1 and a.attname = $2`,
      [table, column],
    );
    expect(row?.n ?? 0).toBeGreaterThan(0);
  });

  it("reads only app.org_id and app.user_id in any policy", async () => {
    const policies = await rows<{ tablename: string; qual: string | null; with_check: string | null }>(
      "select tablename, qual, with_check from pg_policies where schemaname = 'public'",
    );
    const settings = new Set<string>();
    for (const p of policies) {
      for (const text of [p.qual ?? "", p.with_check ?? ""]) {
        for (const m of text.matchAll(/current_setting\('([^']+)'/g)) settings.add(m[1] ?? "");
      }
    }
    expect([...settings].sort()).toEqual([...ALLOWED_POLICY_SETTINGS].sort());
  });

  it.each([...PLATFORM_TABLES, ...AUTH_TABLES])("%s has no tenant RLS", async (table) => {
    const [row] = await rows<{ relrowsecurity: boolean }>("select relrowsecurity from pg_class where relname = $1", [
      table,
    ]);
    expect(row?.relrowsecurity).toBe(false);
  });
});

describe("app role", () => {
  it("is the current user, and has neither SUPERUSER nor BYPASSRLS", async () => {
    const [row] = await rows<{ current_user: string; rolsuper: boolean; rolbypassrls: boolean }>(
      "select current_user, r.rolsuper, r.rolbypassrls from pg_roles r where r.rolname = current_user",
    );
    expect(row).toEqual({ current_user: APP_ROLE, rolsuper: false, rolbypassrls: false });
  });

  it.each([...APPEND_ONLY_TABLES])("has no UPDATE or DELETE on %s", async (table) => {
    const [row] = await rows<{ upd: boolean; del: boolean; ins: boolean }>(
      `select has_table_privilege($1, $2, 'UPDATE') as upd, has_table_privilege($1, $2, 'DELETE') as del,
       has_table_privilege($1, $2, 'INSERT') as ins`,
      [APP_ROLE, table],
    );
    expect(row).toEqual({ upd: false, del: false, ins: true });
  });

  it("cannot write the model registry", async () => {
    const [row] = await rows<{ ins: boolean; sel: boolean }>(
      `select has_table_privilege($1, 'system_one_models', 'INSERT') as ins,
       has_table_privilege($1, 'system_one_models', 'SELECT') as sel`,
      [APP_ROLE],
    );
    expect(row).toEqual({ ins: false, sel: true });
  });

  it("cannot reach a runs partition directly, only through the parent's policy", async () => {
    const partitions = await rows<{ relname: string }>(
      "select c.relname from pg_class c where c.relispartition and c.relname like 'runs_%'",
    );
    expect(partitions.length).toBeGreaterThanOrEqual(2);
    for (const p of partitions) {
      const [row] = await rows<{ sel: boolean }>("select has_table_privilege($1, $2, 'SELECT') as sel", [
        APP_ROLE,
        p.relname,
      ]);
      expect(row?.sel).toBe(false);
    }
  });

  it("is not a member of the platform role", async () => {
    // SET ROLE is checked against the session user, which is the superuser in this harness, so the
    // membership itself is what the test checks. A production login role is a member of bandwise_app only.
    const [row] = await rows<{ member: boolean }>(
      "select pg_has_role($1, 'bandwise_platform', 'MEMBER') as member",
      [APP_ROLE],
    );
    expect(row?.member).toBe(false);
  });
});

describe("withTenant", () => {
  it("sets app.org_id for the transaction only", async () => {
    const [org] = await seedOrgs(t.db, TWO_ORG_SEED.slice(0, 1).map((s) => ({ ...s, slug: `${s.slug}-scan` })));
    if (org === undefined) throw new Error("seed failed");
    const inside = await t.db.withTenant(systemContext(org.orgId), async (tx) => {
      const current = await repos.organizations.current(tx);
      return current?.id;
    });
    expect(inside).toBe(org.orgId);
    const [after] = await rows<{ v: string | null }>(`select nullif(current_setting('${TENANT_SETTING}', true), '') as v`);
    expect(after?.v ?? null).toBeNull();
  });

  it("rejects a context that is not a TenantContext", async () => {
    await expect(
      t.db.withTenant({ orgId: "not-a-uuid" } as never, async () => 1),
    ).rejects.toThrow();
  });
});
