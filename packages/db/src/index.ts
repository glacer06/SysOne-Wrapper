// @sysone/db: Drizzle schema, RLS policies, migrations, withTenant(), repositories and the RunSink.
// The only importer of drizzle-orm. No raw database handle is exported: every query runs in a
// scope from SysoneDb (withTenant, withUser, withNoTenant) through the repositories.

export { createDatabase, type CreateDatabaseOptions, type SysoneDb } from "./client.js";
export type { AnyTx, NoTenantTx, TenantTx, UserTx } from "./internal/drizzle.js";
export { authRepositories, platformRepositories, repos, type Repositories } from "./repos/index.js";
export { DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT } from "./repos/base.js";
export {
  ALLOWED_POLICY_SETTINGS,
  APP_ROLE,
  PLATFORM_ROLE,
  TENANT_SETTING,
  USER_SETTING,
} from "./rls.js";
export {
  ALL_TABLES,
  APPEND_ONLY_TABLES,
  AUTH_TABLES,
  HYBRID_TABLES,
  ORG_TABLE,
  PLATFORM_TABLES,
  TENANT_TABLES,
} from "./schema/classes.js";
export type * from "./rows.js";
export { migrateDatabase, MIGRATIONS_DIR } from "./migrate.js";
export { createRunSink, type LabelSelector, type RunSinkDeps } from "./run-sink.js";
export { seedOrgs, TWO_ORG_SEED, THREE_ORG_SEED, type OrgSeed, type SeededOrg } from "./seed.js";
