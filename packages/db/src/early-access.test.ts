// Early-access signups (ADR-018, migration 0005). The app role adds signups only through
// bandwise_early_access_submit(): it cannot read the list, a known email is a silent no-op, and
// the limits live in the function, not in the caller.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { platformRepositories, type EarlyAccessSubmission } from "./repos/index.js";
import { APP_ROLE, PLATFORM_ROLE } from "./rls.js";
import { createTestDatabase, type TestDatabase } from "./testing/harness.js";

let t: TestDatabase;
const signups = platformRepositories.earlyAccessSignups;

const IP_A = "a".repeat(64);
const IP_B = "b".repeat(64);

function signup(email: string, ipHash = IP_A, extra: Partial<EarlyAccessSubmission> = {}): EarlyAccessSubmission {
  return { email, ipHash, ...extra };
}

async function asRole<T>(role: string, fn: () => Promise<T>): Promise<T> {
  await t.pglite.exec(`RESET ROLE; SET ROLE ${role}`);
  try {
    return await fn();
  } finally {
    await t.pglite.exec(`RESET ROLE; SET ROLE ${APP_ROLE}`);
  }
}

async function allRows() {
  return asRole(PLATFORM_ROLE, async () => (await t.pglite.query<{ email: string }>("select email from early_access_signups order by email")).rows);
}

/** Inserts rows directly as the platform role, bypassing the function's limits. */
async function seedRows(count: number, ipHash: string, age: string) {
  await asRole(PLATFORM_ROLE, () =>
    t.pglite.query(
      `insert into early_access_signups (email, ip_hash, created_at)
       select 'seed' || i || '@example.com', $1, now() - $2::interval from generate_series(1, $3::int) as i`,
      [ipHash, age, count],
    ),
  );
}

beforeAll(async () => {
  t = await createTestDatabase();
});

afterAll(async () => {
  await t.close();
});

beforeEach(async () => {
  await asRole(PLATFORM_ROLE, () => t.pglite.exec("delete from early_access_signups"));
});

describe("submit as the app role", () => {
  it("adds a signup with its optional fields", async () => {
    const outcome = await t.db.withNoTenant((tx) =>
      signups.submit(tx, signup("sam@example.com", IP_A, { name: "Sam", company: "Acme", role: "CTO", useCase: "Triage", sourcePage: "/" })),
    );
    expect(outcome).toBe("accepted");
    const [row] = await asRole(PLATFORM_ROLE, async () => (await t.pglite.query<Record<string, unknown>>("select * from early_access_signups")).rows);
    expect(row).toMatchObject({ email: "sam@example.com", name: "Sam", company: "Acme", role: "CTO", use_case: "Triage", source_page: "/", ip_hash: IP_A });
  });

  it("treats a known email, in any case, as accepted and changes nothing", async () => {
    await t.db.withNoTenant((tx) => signups.submit(tx, signup("sam@example.com", IP_A, { name: "Sam" })));
    const again = await t.db.withNoTenant((tx) => signups.submit(tx, signup("SAM@Example.com", IP_B, { name: "Other" })));
    expect(again).toBe("accepted");
    expect(await allRows()).toEqual([{ email: "sam@example.com" }]);
  });

  it("rejects a malformed email or an oversized field at the table", async () => {
    await expect(t.db.withNoTenant((tx) => signups.submit(tx, signup("not-an-email")))).rejects.toThrow();
    await expect(t.db.withNoTenant((tx) => signups.submit(tx, signup("x@example.com", IP_A, { name: "n".repeat(101) })))).rejects.toThrow();
    await expect(t.db.withNoTenant((tx) => signups.submit(tx, signup("x@example.com", "short")))).rejects.toThrow();
    expect(await allRows()).toEqual([]);
  });

  it("allows 5 new signups per IP hash per hour, then rate limits that IP only", async () => {
    for (let i = 1; i <= 5; i++) {
      expect(await t.db.withNoTenant((tx) => signups.submit(tx, signup(`p${i}@example.com`)))).toBe("accepted");
    }
    expect(await t.db.withNoTenant((tx) => signups.submit(tx, signup("p6@example.com")))).toBe("rate_limited");
    expect(await t.db.withNoTenant((tx) => signups.submit(tx, signup("q1@example.com", IP_B)))).toBe("accepted");
    expect(await allRows()).toHaveLength(6);
  });

  it("does not count signups older than an hour", async () => {
    await seedRows(5, IP_A, "2 hours");
    expect(await t.db.withNoTenant((tx) => signups.submit(tx, signup("fresh@example.com")))).toBe("accepted");
  });

  it("stops everyone after 300 new signups in an hour", async () => {
    await seedRows(300, IP_B, "10 minutes");
    expect(await t.db.withNoTenant((tx) => signups.submit(tx, signup("late@example.com")))).toBe("rate_limited");
  });

  it("cannot read, change or delete the list", async () => {
    await t.db.withNoTenant((tx) => signups.submit(tx, signup("sam@example.com")));
    for (const statement of [
      "select * from early_access_signups",
      "update early_access_signups set name = 'x'",
      "delete from early_access_signups",
      "insert into early_access_signups (email, ip_hash) values ('direct@example.com', repeat('c', 64))",
    ]) {
      await expect(t.pglite.query(statement)).rejects.toThrow(/permission denied/);
    }
    await expect(t.db.withNoTenant((tx) => signups.list(tx, { cursor: null, limit: 10 }))).rejects.toThrow();
  });
});

describe("platform role", () => {
  it("lists every signup and deletes one by email, any case", async () => {
    await t.db.withNoTenant((tx) => signups.submit(tx, signup("sam@example.com")));
    await t.db.withNoTenant((tx) => signups.submit(tx, signup("alex@example.com")));
    await asRole(PLATFORM_ROLE, async () => {
      const page = await t.db.withNoTenant((tx) => signups.list(tx, { cursor: null, limit: 10 }));
      expect(page.data.map((r) => r.email).sort()).toEqual(["alex@example.com", "sam@example.com"]);
      expect(await t.db.withNoTenant((tx) => signups.removeByEmail(tx, "SAM@example.com"))).toBe(true);
      expect(await t.db.withNoTenant((tx) => signups.removeByEmail(tx, "sam@example.com"))).toBe(false);
    });
    expect(await allRows()).toEqual([{ email: "alex@example.com" }]);
  });
});

describe("migration 0005 objects", () => {
  it("forces RLS on the table, with one policy for the platform role", async () => {
    const [table] = (
      await t.pglite.query<{ relrowsecurity: boolean; relforcerowsecurity: boolean }>(
        "select relrowsecurity, relforcerowsecurity from pg_class where relname = 'early_access_signups'",
      )
    ).rows;
    expect(table).toEqual({ relrowsecurity: true, relforcerowsecurity: true });
    const policies = (
      await t.pglite.query<{ policyname: string; roles: string[] | string }>(
        "select policyname, roles from pg_policies where tablename = 'early_access_signups'",
      )
    ).rows;
    expect(policies.map((p) => p.policyname)).toEqual(["platform_rows"]);
    expect(String(policies[0]?.roles)).toContain(PLATFORM_ROLE);
  });

  it("gives the app role no table privilege", async () => {
    const [row] = (
      await t.pglite.query<{ any: boolean }>(
        `select has_table_privilege($1, 'early_access_signups', 'SELECT')
             or has_table_privilege($1, 'early_access_signups', 'INSERT')
             or has_table_privilege($1, 'early_access_signups', 'UPDATE')
             or has_table_privilege($1, 'early_access_signups', 'DELETE') as any`,
        [APP_ROLE],
      )
    ).rows;
    expect(row?.any).toBe(false);
  });

  it("runs the submit function as bandwise_platform, callable by the app role and not by PUBLIC", async () => {
    const [fn] = (
      await t.pglite.query<{ owner: string; prosecdef: boolean; acl: string }>(
        `select pg_get_userbyid(p.proowner) as owner, p.prosecdef, coalesce(p.proacl::text, '') as acl
         from pg_proc p where p.proname = 'bandwise_early_access_submit'`,
      )
    ).rows;
    expect(fn?.owner).toBe(PLATFORM_ROLE);
    expect(fn?.prosecdef).toBe(true);
    expect(fn?.acl).toContain(`${APP_ROLE}=X/`);
    // An entry that starts with "=" is the PUBLIC grant.
    expect(fn?.acl).not.toMatch(/[{,]=X/);
  });

  it("leaves bandwise_platform without CREATE on schema public", async () => {
    const [row] = (
      await t.pglite.query<{ create: boolean }>("select has_schema_privilege($1, 'public', 'CREATE') as create", [PLATFORM_ROLE])
    ).rows;
    expect(row?.create).toBe(false);
  });
});
