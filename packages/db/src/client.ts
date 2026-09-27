// The database handle. It never hands out a raw drizzle instance: every query runs inside
// withTenant (org scope), withUser (pre-org lookups) or withNoTenant (auth and platform tables).

import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";

import { TenantContext, UserId } from "@bandwise/core/contracts";

import { DRIZZLE, type DrizzleDb, type NoTenantTx, type TenantTx, type UserTx } from "./internal/drizzle.js";
import { TENANT_SETTING, USER_SETTING } from "./rls.js";
import * as schema from "./schema/index.js";

export type { NoTenantTx, TenantTx, UserTx, AnyTx } from "./internal/drizzle.js";

export interface BandwiseDb {
  /**
   * Opens a transaction, runs `select set_config('app.org_id', orgId, true)` (transaction-local,
   * so a pooled connection never keeps it), and hands `fn` a scope that tenant repositories accept.
   * Repositories add their own org filter on top, and RLS catches anything they miss.
   */
  withTenant<T>(ctx: TenantContext, fn: (tx: TenantTx) => Promise<T>): Promise<T>;
  /** Pre-org lookups for one signed-in user (ADR-002): sets app.user_id, never app.org_id. */
  withUser<T>(userId: string, fn: (tx: UserTx) => Promise<T>): Promise<T>;
  /** Auth tables and platform reads. Tenant tables return zero rows in this scope. */
  withNoTenant<T>(fn: (tx: NoTenantTx) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

/** Wraps a drizzle database. Internal: callers use createDatabase or the test harness. */
export function wrapDrizzle(db: DrizzleDb, close: () => Promise<void>): BandwiseDb {
  return {
    async withTenant(ctx, fn) {
      const parsed = TenantContext.parse(ctx);
      return db.transaction(async (d) => {
        await d.execute(sql`select set_config(${TENANT_SETTING}, ${parsed.orgId}, true)`);
        return fn({ kind: "tenant", orgId: parsed.orgId, ctx: parsed, [DRIZZLE]: d });
      });
    },
    async withUser(userId, fn) {
      const id = UserId.parse(userId);
      return db.transaction(async (d) => {
        await d.execute(sql`select set_config(${USER_SETTING}, ${id}, true)`);
        return fn({ kind: "user", userId: id, [DRIZZLE]: d });
      });
    },
    withNoTenant(fn) {
      return db.transaction(async (d) => fn({ kind: "none", [DRIZZLE]: d }));
    },
    close,
  };
}

export interface CreateDatabaseOptions {
  /** DATABASE_URL. The login role must be a member of bandwise_app and must not have BYPASSRLS. */
  connectionString: string;
  /** Pool size. Defaults to 10. */
  max?: number;
}

/** A pooled node-postgres database. */
export function createDatabase(opts: CreateDatabaseOptions): BandwiseDb {
  const pool = new pg.Pool({ connectionString: opts.connectionString, max: opts.max ?? 10 });
  const db: DrizzleDb = drizzle(pool, { schema, casing: "snake_case" });
  return wrapDrizzle(db, () => pool.end());
}
