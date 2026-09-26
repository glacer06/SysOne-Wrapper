// Internal handles. Nothing here is exported from the package entry point: callers get a
// transaction only through withTenant, withUser or withNoTenant, and only repositories unwrap it.

import type { ExtractTablesWithRelations } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT, PgTransaction } from "drizzle-orm/pg-core";

import type { TenantContext } from "@sysone/core/contracts";

import type * as schema from "../schema/index.js";

export type Schema = typeof schema;
export type DrizzleDb = PgDatabase<PgQueryResultHKT, Schema>;
export type DrizzleTx = PgTransaction<PgQueryResultHKT, Schema, ExtractTablesWithRelations<Schema>>;

/** Private key of the drizzle transaction on a scope. Not reachable from outside the package. */
export const DRIZZLE: unique symbol = Symbol("sysone.db.drizzle");

/** A transaction with app.org_id set to `orgId`. Tenant repositories take only this. */
export interface TenantTx {
  readonly kind: "tenant";
  readonly orgId: string;
  readonly ctx: TenantContext;
  readonly [DRIZZLE]: DrizzleTx;
}

/**
 * A transaction with app.user_id set and no org: pre-org lookups of the user's own memberships
 * and invitations (ADR-002). Tenant RLS matches nothing else.
 */
export interface UserTx {
  readonly kind: "user";
  readonly userId: string;
  readonly [DRIZZLE]: DrizzleTx;
}

/**
 * A transaction with no org and no user set: auth tables and platform table reads. Every tenant
 * table returns zero rows here, because app.org_id is unset.
 */
export interface NoTenantTx {
  readonly kind: "none";
  readonly [DRIZZLE]: DrizzleTx;
}

export type AnyTx = TenantTx | UserTx | NoTenantTx;

export function drizzleOf(tx: AnyTx): DrizzleTx {
  return tx[DRIZZLE];
}
