// The security half of migration 0001, generated from the table classes in schema/classes.ts:
// roles, grants, RLS policies, one cross-table constraint, the immutability triggers and the runs
// partitions.
//
// `pnpm --filter @bandwise/db rls:sql` prints it. The block is pasted verbatim at the end of
// migrations/0001_init.sql, and rls.test.ts fails when the two drift apart.
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
} from "./schema/classes.js";

/** The application role. NOLOGIN; deployments create a login role that is a member of it. */
export const APP_ROLE = "bandwise_app";
/** Writes platform tables and platform rows (org_id null). Never granted to the app role. */
export const PLATFORM_ROLE = "bandwise_platform";

/** The only session settings a policy may read. The schema scan test enforces this list. */
export const TENANT_SETTING = "app.org_id";
export const USER_SETTING = "app.user_id";
export const ALLOWED_POLICY_SETTINGS = [TENANT_SETTING, USER_SETTING] as const;

const ORG = `nullif(current_setting('${TENANT_SETTING}', true), '')::uuid`;
const USER = `nullif(current_setting('${USER_SETTING}', true), '')::uuid`;

const q = (name: string) => `"${name}"`;

function enableRls(table: string): string[] {
  return [
    `ALTER TABLE ${q(table)} ENABLE ROW LEVEL SECURITY;`,
    `ALTER TABLE ${q(table)} FORCE ROW LEVEL SECURITY;`,
  ];
}

function tenantPolicy(table: string, column = "org_id"): string {
  return `CREATE POLICY tenant_isolation ON ${q(table)} USING (${column} = ${ORG}) WITH CHECK (${column} = ${ORG});`;
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
    tenantPolicy(ORG_TABLE, "id"),
    // Pre-org lookup: the orgs the signed-in user belongs to (org switcher, ADR-002).
    `CREATE POLICY user_memberships ON ${q(ORG_TABLE)} FOR SELECT USING (id IN (SELECT m.org_id FROM "memberships" m WHERE m.user_id = ${USER}));`,
    `GRANT SELECT, INSERT, UPDATE ON ${q(ORG_TABLE)} TO ${APP_ROLE};`,
  ];
}

function tenantTables(): string[] {
  return TENANT_TABLES.flatMap((t) => [...enableRls(t), tenantPolicy(t), appGrant(t)]);
}

function userPolicies(): string[] {
  return [
    `CREATE POLICY user_lookup ON "memberships" FOR SELECT USING (user_id = ${USER});`,
    `CREATE POLICY user_lookup ON "invitations" FOR SELECT USING (lower(email) = (SELECT lower(u.email) FROM "users" u WHERE u.id = ${USER}));`,
  ];
}

function hybridTables(): string[] {
  return [
    // price_books: platform rows (org_id null) are readable by every org and written only by the
    // platform role. Org rows follow the tenant rule.
    ...enableRls("price_books"),
    `CREATE POLICY tenant_read ON "price_books" FOR SELECT USING (org_id IS NULL OR org_id = ${ORG});`,
    `CREATE POLICY tenant_insert ON "price_books" FOR INSERT WITH CHECK (org_id = ${ORG});`,
    `CREATE POLICY tenant_update ON "price_books" FOR UPDATE USING (org_id = ${ORG}) WITH CHECK (org_id = ${ORG});`,
    `CREATE POLICY tenant_delete ON "price_books" FOR DELETE USING (org_id = ${ORG});`,
    `CREATE POLICY platform_rows ON "price_books" TO ${PLATFORM_ROLE} USING (org_id IS NULL) WITH CHECK (org_id IS NULL);`,
    appGrant("price_books"),
    // audit_log and events: org rows follow the tenant rule; platform rows are not readable by any org.
    ...(["audit_log", "events"] as const).flatMap((t) => [
      ...enableRls(t),
      tenantPolicy(t),
      `CREATE POLICY platform_rows ON ${q(t)} TO ${PLATFORM_ROLE} USING (org_id IS NULL) WITH CHECK (org_id IS NULL);`,
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

/** Every statement of the security block, in order. */
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

/** The block as it appears in the migration, with drizzle's statement breakpoints. */
export function securityBlock(): string {
  return [SECURITY_BLOCK_START, securityStatements().join("\n--> statement-breakpoint\n"), SECURITY_BLOCK_END].join(
    "\n",
  );
}
