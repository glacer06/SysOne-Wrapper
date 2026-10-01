// Every table in the schema, sorted into exactly one class. The RLS block in migration 0001 is
// generated from TENANT_TABLES (src/rls.ts), and the schema scan test fails when a table in the
// database is missing from this file. Adding a table means adding it here first.

/** org_id not null and the tenant_isolation policy on app.org_id. */
export const TENANT_TABLES = [
  "memberships",
  "invitations",
  "org_system_one_keys",
  "agent_tokens",
  "org_webhook_secrets",
  "apps",
  "app_tokens",
  "app_opportunities",
  "app_set_bindings",
  "projects",
  "goals",
  "question_sets",
  "question_set_versions",
  "release_pointers",
  "release_events",
  "experiments",
  "proposals",
  "runs",
  "run_feedback",
  "review_items",
  "datasets",
  "dataset_cases",
  "dataset_snapshots",
  "eval_runs",
  "eval_case_results",
  "studio_sessions",
  "studio_examples",
  "question_daily",
  "usage_daily",
  "billing_accounts",
  "entitlement_overrides",
  "usage_events",
  "approval_requests",
  "idempotency_keys",
  "jobs",
  "webhook_endpoints",
  "plugin_configs",
] as const;

/**
 * Tenant tables whose org_id may be null for platform rows. Tenant RLS never matches a null
 * org_id, so those rows are visible only to the bandwise_platform role.
 * - price_books: platform default prices, readable by every org (hybrid read policy).
 * - audit_log, events: platform events, not readable by any org.
 */
export const HYBRID_TABLES = ["price_books", "audit_log", "events"] as const;

/** The tenant itself: RLS matches its `id` against app.org_id. */
export const ORG_TABLE = "organizations" as const;

/** No org_id, no tenant RLS. The app role reads them; bandwise_platform writes them. */
export const PLATFORM_TABLES = [
  "system_one_models",
  "system_one_model_routes",
  "model_alias_observations",
  "settings",
  "stripe_webhook_events",
] as const;

/**
 * No org_id and no grant to the app role at all. bandwise_platform owns reads and writes; the app
 * role reaches them only through a narrow SECURITY DEFINER function (migration 0005). RLS is on,
 * with one policy for the platform role, so a stray grant still returns nothing.
 */
export const PRIVATE_PLATFORM_TABLES = ["early_access_signups"] as const;

/** Better Auth tables and the device flow: no tenant RLS (data-model.md, ADR-002). */
export const AUTH_TABLES = [
  "users",
  "sessions",
  "accounts",
  "verification_tokens",
  "two_factors",
  "device_codes",
  "auth_attempts",
  "console_enrollments",
] as const;

/** The auth tables migration 0001 granted. Frozen: 0001 is applied; later ones grant in their own migration. */
export const AUTH_TABLES_0001 = ["users", "sessions", "accounts", "verification_tokens", "two_factors", "device_codes"] as const;

/** Tables whose SELECT policy also admits the pre-org lookup on app.user_id (ADR-002). */
export const USER_POLICY_TABLES = ["memberships", "invitations"] as const;

/** Append-only for the app role: SELECT and INSERT, no UPDATE or DELETE. */
export const APPEND_ONLY_TABLES = ["audit_log", "dataset_snapshots"] as const;

export type TenantTableName = (typeof TENANT_TABLES)[number];
export type HybridTableName = (typeof HYBRID_TABLES)[number];
export type PlatformTableName = (typeof PLATFORM_TABLES)[number];
export type PrivatePlatformTableName = (typeof PRIVATE_PLATFORM_TABLES)[number];
export type AuthTableName = (typeof AUTH_TABLES)[number];

/** Every table that carries an org_id column and tenant RLS, including the org table itself. */
export const ALL_TENANT_SCOPED = [ORG_TABLE, ...TENANT_TABLES, ...HYBRID_TABLES] as const;

export const ALL_TABLES = [...ALL_TENANT_SCOPED, ...PLATFORM_TABLES, ...PRIVATE_PLATFORM_TABLES, ...AUTH_TABLES] as const;
