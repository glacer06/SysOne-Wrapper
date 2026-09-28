// Roles, grants and RLS, generated from the table classes in schema/classes.ts. Two generated blocks
// live here, one per migration that carries it:
//
// - securityBlock(), the security half of migration 0001: roles, grants, RLS, the generation 1
//   policies, one cross-table constraint, the immutability triggers and the runs partitions.
// - policyBlock(), migration 0004: drops every generation 1 policy and creates generation 2, the
//   current set (Supabase performance advisor, 2026-09-28).
//
// `pnpm --filter @bandwise/db rls:sql [0001|0004]` prints a block. Each is pasted verbatim into its
// migration, and schema.test.ts fails when either drifts from its file. Both migrations are applied
// in production, so a shipped generation never changes. To change a policy, add a generation and a
// block for a new migration, and point currentPolicies() at it.
//
// Setting names: tenant policies read only `app.org_id`; the pre-org policies (ADR-002) read only
// `app.user_id`. current_setting(..., true) returns '' (not null) once a transaction-local value
// has been set and rolled back on a pooled connection, so every read goes through nullif first.
// Without it, a reused connection would fail with "invalid input syntax for type uuid".

import {
  APPEND_ONLY_TABLES,
  AUTH_TABLES,
  ORG_TABLE,
  PLATFORM_TABLES,
  TENANT_TABLES,
  USER_POLICY_TABLES,
} from "./schema/classes.js";

/** The application role. NOLOGIN; deployments create a login role that is a member of it. */
export const APP_ROLE = "bandwise_app";
/** Writes platform tables and platform rows (org_id null). Never granted to the app role. */
export const PLATFORM_ROLE = "bandwise_platform";

/** The only session settings a policy may read. The schema scan test enforces this list. */
export const TENANT_SETTING = "app.org_id";
export const USER_SETTING = "app.user_id";
export const ALLOWED_POLICY_SETTINGS = [TENANT_SETTING, USER_SETTING] as const;

const q = (name: string) => `"${name}"`;

const BREAKPOINT = "\n--> statement-breakpoint\n";

/** Generation 1 (migration 0001) read the setting for every row a policy checked. */
const perRow = (setting: string) => `nullif(current_setting('${setting}', true), '')::uuid`;

/**
 * Generation 2 (migration 0004) reads the same value once per statement. A scalar subquery that
 * never references the row becomes an initplan, which Postgres runs once instead of per row
 * (Supabase advisor lint 0003, auth_rls_initplan). The inner select is the text that lint looks for,
 * `select current_setting(`; the outer one moves nullif and the uuid cast into the initplan as well.
 */
const perStatement = (setting: string) =>
  `(select nullif((select current_setting('${setting}', true)), '')::uuid)`;

type PolicyCommand = "SELECT" | "INSERT" | "UPDATE" | "DELETE";

/** One permissive policy. Postgres ORs every permissive policy that applies to a role and command. */
export interface Policy {
  table: string;
  name: string;
  /** Omitted: FOR ALL. */
  command?: PolicyCommand;
  /** Omitted: PUBLIC. */
  role?: string;
  using?: string;
  withCheck?: string;
}

function createPolicy(p: Policy): string {
  const parts = [`CREATE POLICY ${p.name} ON ${q(p.table)}`];
  if (p.command !== undefined) parts.push(`FOR ${p.command}`);
  if (p.role !== undefined) parts.push(`TO ${p.role}`);
  if (p.using !== undefined) parts.push(`USING (${p.using})`);
  if (p.withCheck !== undefined) parts.push(`WITH CHECK (${p.withCheck})`);
  return `${parts.join(" ")};`;
}

/** The tenant rule for every command: the row's org column must equal app.org_id. */
function tenantIsolation(table: string, org: string, column = "org_id", role?: string): Policy {
  const own = `${column} = ${org}`;
  return { table, name: "tenant_isolation", ...(role === undefined ? {} : { role }), using: own, withCheck: own };
}

/**
 * The tenant rule as one policy per command, plus an arm that only widens reads. Same access as an
 * ALL policy next to a SELECT policy for the extra arm, without two permissive policies on SELECT.
 */
function tenantPerCommand(table: string, org: string, readAlso: string, column = "org_id", role?: string): Policy[] {
  const own = `${column} = ${org}`;
  const to = role === undefined ? {} : { role };
  return [
    { table, name: "tenant_read", command: "SELECT", ...to, using: `(${own}) OR (${readAlso})` },
    { table, name: "tenant_insert", command: "INSERT", ...to, withCheck: own },
    { table, name: "tenant_update", command: "UPDATE", ...to, using: own, withCheck: own },
    { table, name: "tenant_delete", command: "DELETE", ...to, using: own },
  ];
}

/** Platform rows (org_id null) for the platform role. */
function platformRows(table: string): Policy {
  return { table, name: "platform_rows", role: PLATFORM_ROLE, using: "org_id IS NULL", withCheck: "org_id IS NULL" };
}

/** Pre-org lookups for the signed-in user (ADR-002), by table. */
const PRE_ORG_READ = {
  /** The orgs the user belongs to (org switcher). */
  organizations: (user: string) => `id IN (SELECT m.org_id FROM "memberships" m WHERE m.user_id = ${user})`,
  memberships: (user: string) => `user_id = ${user}`,
  invitations: (user: string) => `lower(email) = (SELECT lower(u.email) FROM "users" u WHERE u.id = ${user})`,
} as const;

const PRE_ORG = new Set<string>(USER_POLICY_TABLES);

/** The policies migration 0001 created, in its order. Frozen: 0001 is applied in production. */
function generation1(): Policy[] {
  const org = perRow(TENANT_SETTING);
  const user = perRow(USER_SETTING);
  return [
    tenantIsolation(ORG_TABLE, org, "id"),
    { table: ORG_TABLE, name: "user_memberships", command: "SELECT", using: PRE_ORG_READ.organizations(user) },
    ...TENANT_TABLES.map((t) => tenantIsolation(t, org)),
    { table: "memberships", name: "user_lookup", command: "SELECT", using: PRE_ORG_READ.memberships(user) },
    { table: "invitations", name: "user_lookup", command: "SELECT", using: PRE_ORG_READ.invitations(user) },
    // price_books: platform rows (org_id null) are readable by every org and written only by the
    // platform role. Org rows follow the tenant rule.
    { table: "price_books", name: "tenant_read", command: "SELECT", using: `org_id IS NULL OR org_id = ${org}` },
    { table: "price_books", name: "tenant_insert", command: "INSERT", withCheck: `org_id = ${org}` },
    { table: "price_books", name: "tenant_update", command: "UPDATE", using: `org_id = ${org}`, withCheck: `org_id = ${org}` },
    { table: "price_books", name: "tenant_delete", command: "DELETE", using: `org_id = ${org}` },
    platformRows("price_books"),
    // audit_log and events: org rows follow the tenant rule; platform rows are not readable by any org.
    ...(["audit_log", "events"] as const).flatMap((t) => [tenantIsolation(t, org), platformRows(t)]),
  ];
}

/**
 * The policies migration 0004 created. Access is what generation 1 gave bandwise_app; the changes
 * are for the Supabase performance advisor:
 *
 * - Every setting read runs once per statement (perStatement), for lint 0003.
 * - organizations, memberships, invitations: the ALL policy and the pre-org SELECT policy become one
 *   policy per command, with the pre-org arm OR'ed into SELECT only. Lint 0006 counts two
 *   permissive policies for one role and command, and PUBLIC counts for every role.
 * - price_books, audit_log, events: the tenant policies apply to bandwise_app and platform_rows to
 *   bandwise_platform, so no role holds both. bandwise_platform now reaches only org_id null rows on
 *   these tables, which is what data-model.md always described; before, the PUBLIC tenant policy
 *   also let it reach the rows of whatever org app.org_id named.
 *
 * Every other tenant table keeps a single PUBLIC tenant_isolation policy.
 */
function generation2(): Policy[] {
  const org = perStatement(TENANT_SETTING);
  const user = perStatement(USER_SETTING);
  return [
    ...tenantPerCommand(ORG_TABLE, org, PRE_ORG_READ.organizations(user), "id"),
    ...TENANT_TABLES.flatMap((t) =>
      PRE_ORG.has(t)
        ? tenantPerCommand(t, org, PRE_ORG_READ[t as keyof typeof PRE_ORG_READ](user))
        : [tenantIsolation(t, org)],
    ),
    ...tenantPerCommand("price_books", org, "org_id IS NULL", "org_id", APP_ROLE),
    platformRows("price_books"),
    ...(["audit_log", "events"] as const).flatMap((t) => [tenantIsolation(t, org, "org_id", APP_ROLE), platformRows(t)]),
  ];
}

/** The policies a fully migrated database holds. schema.test.ts compares them with pg_policies. */
export function currentPolicies(): Policy[] {
  return generation2();
}

/** Renders the generation 1 policies on a table, optionally only the named ones, in their order. */
function generation1On(table: string, ...names: string[]): string[] {
  return generation1()
    .filter((p) => p.table === table && (names.length === 0 || names.includes(p.name)))
    .map(createPolicy);
}

function enableRls(table: string): string[] {
  return [
    `ALTER TABLE ${q(table)} ENABLE ROW LEVEL SECURITY;`,
    `ALTER TABLE ${q(table)} FORCE ROW LEVEL SECURITY;`,
  ];
}

const APPEND_ONLY = new Set<string>(APPEND_ONLY_TABLES);

function appGrant(table: string): string {
  const privileges = APPEND_ONLY.has(table) ? "SELECT, INSERT" : "SELECT, INSERT, UPDATE, DELETE";
  return `GRANT ${privileges} ON ${q(table)} TO ${APP_ROLE};`;
}

function roles(): string[] {
  return [
    [
      "DO $$",
      "BEGIN",
      `  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${APP_ROLE}') THEN`,
      `    CREATE ROLE ${APP_ROLE} NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;`,
      "  END IF;",
      `  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${PLATFORM_ROLE}') THEN`,
      `    CREATE ROLE ${PLATFORM_ROLE} NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;`,
      "  END IF;",
      "END",
      "$$;",
    ].join("\n"),
    // The migrating role may SET ROLE bandwise_platform to write platform seed rows under RLS.
    `GRANT ${PLATFORM_ROLE} TO CURRENT_USER;`,
    `GRANT USAGE ON SCHEMA public TO ${APP_ROLE}, ${PLATFORM_ROLE};`,
  ];
}

function orgTable(): string[] {
  return [
    ...enableRls(ORG_TABLE),
    ...generation1On(ORG_TABLE),
    `GRANT SELECT, INSERT, UPDATE ON ${q(ORG_TABLE)} TO ${APP_ROLE};`,
  ];
}

function tenantTables(): string[] {
  return TENANT_TABLES.flatMap((t) => [...enableRls(t), ...generation1On(t, "tenant_isolation"), appGrant(t)]);
}

function userPolicies(): string[] {
  return USER_POLICY_TABLES.flatMap((t) => generation1On(t, "user_lookup"));
}

function hybridTables(): string[] {
  return [
    ...enableRls("price_books"),
    ...generation1On("price_books"),
    appGrant("price_books"),
    ...(["audit_log", "events"] as const).flatMap((t) => [
      ...enableRls(t),
      ...generation1On(t),
      `GRANT SELECT, INSERT ON ${q(t)} TO ${APP_ROLE};`,
    ]),
    `GRANT SELECT, INSERT, UPDATE, DELETE ON "price_books", "audit_log", "events" TO ${PLATFORM_ROLE};`,
  ];
}

function platformTables(): string[] {
  return [
    `GRANT SELECT ON ${PLATFORM_TABLES.map(q).join(", ")} TO ${APP_ROLE};`,
    // RunSink records alias observations in the run's transaction; Stripe webhooks dedupe by event id.
    `GRANT INSERT, UPDATE ON "model_alias_observations" TO ${APP_ROLE};`,
    `GRANT INSERT ON "stripe_webhook_events" TO ${APP_ROLE};`,
    `GRANT SELECT, INSERT, UPDATE, DELETE ON ${PLATFORM_TABLES.map(q).join(", ")} TO ${PLATFORM_ROLE};`,
  ];
}

function authTables(): string[] {
  return [`GRANT SELECT, INSERT, UPDATE, DELETE ON ${AUTH_TABLES.map(q).join(", ")} TO ${APP_ROLE};`];
}

function constraints(): string[] {
  return [
    // question_sets and question_set_versions point at each other, which drizzle cannot type.
    `ALTER TABLE "question_sets" ADD CONSTRAINT "question_sets_draft_version_fk" FOREIGN KEY ("org_id", "draft_version_id") REFERENCES "question_set_versions" ("org_id", "id");`,
  ];
}

function triggers(): string[] {
  return [
    [
      "CREATE OR REPLACE FUNCTION bandwise_question_set_versions_immutable() RETURNS trigger",
      "LANGUAGE plpgsql AS $$",
      "BEGIN",
      "  IF TG_OP = 'DELETE' THEN",
      "    IF OLD.status <> 'draft' THEN",
      "      RAISE EXCEPTION 'immutable_version: version % is %, it cannot be deleted', OLD.id, OLD.status",
      "        USING ERRCODE = 'integrity_constraint_violation';",
      "    END IF;",
      "    RETURN OLD;",
      "  END IF;",
      "  IF OLD.status = 'published' THEN",
      "    -- The one allowed change: published to archived, every other column unchanged.",
      "    IF NEW.status = 'archived' AND (to_jsonb(NEW) - 'status') = (to_jsonb(OLD) - 'status') THEN",
      "      RETURN NEW;",
      "    END IF;",
      "    RAISE EXCEPTION 'immutable_version: version % is published', OLD.id",
      "      USING ERRCODE = 'integrity_constraint_violation';",
      "  END IF;",
      "  IF OLD.status = 'archived' THEN",
      "    RAISE EXCEPTION 'immutable_version: version % is archived', OLD.id",
      "      USING ERRCODE = 'integrity_constraint_violation';",
      "  END IF;",
      "  RETURN NEW;",
      "END",
      "$$;",
    ].join("\n"),
    `CREATE TRIGGER question_set_versions_immutable BEFORE UPDATE OR DELETE ON "question_set_versions" FOR EACH ROW EXECUTE FUNCTION bandwise_question_set_versions_immutable();`,
    [
      "CREATE OR REPLACE FUNCTION bandwise_dataset_cases_split_immutable() RETURNS trigger",
      "LANGUAGE plpgsql AS $$",
      "BEGIN",
      "  IF NEW.split IS DISTINCT FROM OLD.split THEN",
      "    RAISE EXCEPTION 'immutable_split: dataset case % keeps split %', OLD.id, OLD.split",
      "      USING ERRCODE = 'integrity_constraint_violation';",
      "  END IF;",
      "  RETURN NEW;",
      "END",
      "$$;",
    ].join("\n"),
    `CREATE TRIGGER dataset_cases_split_immutable BEFORE UPDATE ON "dataset_cases" FOR EACH ROW EXECUTE FUNCTION bandwise_dataset_cases_split_immutable();`,
  ];
}

function runPartitions(): string[] {
  return [
    // The default partition catches rows outside the monthly partitions. The app role has no
    // grant on any partition, so it can reach runs only through the parent and its policy.
    `CREATE TABLE "runs_default" PARTITION OF "runs" DEFAULT;`,
    [
      "CREATE OR REPLACE FUNCTION bandwise_ensure_runs_partition(month date) RETURNS text",
      "LANGUAGE plpgsql AS $$",
      "DECLARE",
      "  start_at date := date_trunc('month', month)::date;",
      "  name text := 'runs_' || to_char(start_at, 'YYYY_MM');",
      "BEGIN",
      "  IF to_regclass(name) IS NULL THEN",
      "    EXECUTE format('CREATE TABLE %I PARTITION OF runs FOR VALUES FROM (%L) TO (%L)',",
      "      name, start_at, (start_at + interval '1 month')::date);",
      "  END IF;",
      "  RETURN name;",
      "END",
      "$$;",
    ].join("\n"),
    "SELECT bandwise_ensure_runs_partition((date_trunc('month', now()) + make_interval(months => i))::date) FROM generate_series(0, 2) AS i;",
  ];
}

/** Every statement of the migration 0001 security block, in order. */
export function securityStatements(): string[] {
  return [
    ...roles(),
    ...orgTable(),
    ...tenantTables(),
    ...userPolicies(),
    ...hybridTables(),
    ...platformTables(),
    ...authTables(),
    ...constraints(),
    ...triggers(),
    ...runPartitions(),
  ];
}

export const SECURITY_BLOCK_START = "-- bandwise:security-block:start (generated by src/rls.ts; do not edit by hand)";
export const SECURITY_BLOCK_END = "-- bandwise:security-block:end";

/** The block as it appears in migration 0001, with drizzle's statement breakpoints. */
export function securityBlock(): string {
  return [SECURITY_BLOCK_START, securityStatements().join(BREAKPOINT), SECURITY_BLOCK_END].join("\n");
}

export const POLICY_BLOCK_START = "-- bandwise:policy-block:start (generated by src/rls.ts; do not edit by hand)";
export const POLICY_BLOCK_END = "-- bandwise:policy-block:end";

/**
 * Migration 0004: drops every generation 1 policy, then creates generation 2. The migration runs in
 * one transaction, and with RLS forced a table with no policy returns no rows, so there is no moment
 * when a table is open.
 */
export function policyBlock(): string {
  const statements = [
    ...generation1().map((p) => `DROP POLICY ${p.name} ON ${q(p.table)};`),
    ...generation2().map(createPolicy),
  ];
  return [POLICY_BLOCK_START, statements.join(BREAKPOINT), POLICY_BLOCK_END].join("\n");
}
