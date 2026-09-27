// Generic repositories. A tenant repository adds `org_id = tx.orgId` to every read and write and
// forces org_id on insert, so two layers guard each query: this filter and RLS.
//
// `orgFilter: false` exists only for the cross-tenant suite, which proves RLS alone returns zero
// rows. The package entry point exports repositories built with the filter on; the factory is not
// exported.

import { and, asc, eq, getTableName, gt, type SQL } from "drizzle-orm";
import type { AnyPgColumn, PgTable } from "drizzle-orm/pg-core";

import type { Page, PageReq } from "@bandwise/core/contracts";

import { type AnyTx, drizzleOf, type TenantTx } from "../internal/drizzle.js";

export interface RepoOptions {
  /** Add the org_id filter. Always true outside the cross-tenant suite. */
  orgFilter: boolean;
}

export type OrgTable = PgTable & { orgId: AnyPgColumn; id: AnyPgColumn };
export type IdTable = PgTable & { id: AnyPgColumn };

export const DEFAULT_PAGE_LIMIT = 50;
export const MAX_PAGE_LIMIT = 200;

export function clampLimit(limit: number | undefined): number {
  if (limit === undefined) return DEFAULT_PAGE_LIMIT;
  return Math.max(1, Math.min(MAX_PAGE_LIMIT, Math.trunc(limit)));
}

/** Drop keys a caller may never set: the org is always the transaction's. */
function withoutOrg<T extends object>(values: T): Omit<T, "orgId"> {
  const { orgId: _drop, ...rest } = values as T & { orgId?: unknown };
  return rest;
}

/** Keyset pagination on `id`. Every table this is used on has an `id` column. */
export async function pageBy<Row>(
  run: (where: SQL | undefined, limit: number) => Promise<Row[]>,
  idColumn: AnyPgColumn,
  page: PageReq,
): Promise<Page<Row>> {
  const limit = clampLimit(page.limit);
  const rows = await run(page.cursor === null ? undefined : gt(idColumn, page.cursor), limit + 1);
  const data = rows.slice(0, limit);
  const last = data.at(-1) as { id?: unknown } | undefined;
  return { data, nextCursor: rows.length > limit && last !== undefined ? String(last.id) : null };
}

export type TenantInsert<T extends OrgTable> = Omit<T["$inferInsert"], "orgId">;
export type TenantPatch<T extends OrgTable> = Partial<Omit<T["$inferInsert"], "orgId" | "id">>;

/** Read and append for a tenant table. */
export function appendOnlyRepo<T extends OrgTable>(table: T, opts: RepoOptions) {
  type Row = T["$inferSelect"];
  const scope = (tx: TenantTx, extra?: SQL): SQL | undefined =>
    opts.orgFilter ? and(eq(table.orgId, tx.orgId), extra) : extra;

  const repo = {
    table: getTableName(table),
    async insert(tx: TenantTx, values: TenantInsert<T>): Promise<Row> {
      const row = { ...withoutOrg(values), orgId: tx.orgId } as T["$inferInsert"];
      const [out] = (await drizzleOf(tx).insert(table).values(row).returning()) as Row[];
      if (out === undefined) throw new Error(`insert into ${repo.table} returned no row`);
      return out;
    },
    async insertMany(tx: TenantTx, values: TenantInsert<T>[]): Promise<Row[]> {
      if (values.length === 0) return [];
      const rows = values.map((v) => ({ ...withoutOrg(v), orgId: tx.orgId }) as T["$inferInsert"]);
      return (await drizzleOf(tx).insert(table).values(rows).returning()) as Row[];
    },
    async get(tx: TenantTx, id: string): Promise<Row | null> {
      const rows = (await drizzleOf(tx)
        .select()
        .from(table as PgTable)
        .where(scope(tx, eq(table.id, id)))
        .limit(1)) as Row[];
      return rows[0] ?? null;
    },
    async list(tx: TenantTx, page: PageReq): Promise<Page<Row>> {
      return pageBy(
        async (where, limit) =>
          (await drizzleOf(tx)
            .select()
            .from(table as PgTable)
            .where(scope(tx, where))
            .orderBy(asc(table.id))
            .limit(limit)) as Row[],
        table.id,
        page,
      );
    },
    /** Internal: rows matching `where`, org-scoped. */
    async findMany(tx: TenantTx, where: SQL | undefined, limit = MAX_PAGE_LIMIT): Promise<Row[]> {
      return (await drizzleOf(tx)
        .select()
        .from(table as PgTable)
        .where(scope(tx, where))
        .orderBy(asc(table.id))
        .limit(limit)) as Row[];
    },
    scope,
  };
  return repo;
}

/** Full CRUD for a tenant table. Update and delete are org-scoped and return null or false on a miss. */
export function tenantRepo<T extends OrgTable>(table: T, opts: RepoOptions) {
  type Row = T["$inferSelect"];
  const base = appendOnlyRepo(table, opts);
  return {
    ...base,
    async update(tx: TenantTx, id: string, patch: TenantPatch<T>): Promise<Row | null> {
      const set = withoutOrg(patch) as Partial<T["$inferInsert"]> & { id?: unknown };
      delete set.id;
      if (Object.keys(set).length === 0) return base.get(tx, id);
      const rows = (await drizzleOf(tx)
        .update(table)
        .set(set as never)
        .where(base.scope(tx, eq(table.id, id)))
        .returning()) as Row[];
      return rows[0] ?? null;
    },
    async delete(tx: TenantTx, id: string): Promise<boolean> {
      const rows = (await drizzleOf(tx)
        .delete(table)
        .where(base.scope(tx, eq(table.id, id)))
        .returning()) as Row[];
      return rows.length > 0;
    },
  };
}

/** Auth and platform tables: no org, no tenant RLS. Reads work in any scope. */
export function globalRepo<T extends IdTable>(table: T) {
  type Row = T["$inferSelect"];
  return {
    table: getTableName(table),
    async insert(tx: AnyTx, values: T["$inferInsert"]): Promise<Row> {
      const [out] = (await drizzleOf(tx).insert(table).values(values).returning()) as Row[];
      if (out === undefined) throw new Error(`insert into ${getTableName(table)} returned no row`);
      return out;
    },
    async get(tx: AnyTx, id: string): Promise<Row | null> {
      const rows = (await drizzleOf(tx)
        .select()
        .from(table as PgTable)
        .where(eq(table.id, id))
        .limit(1)) as Row[];
      return rows[0] ?? null;
    },
    async list(tx: AnyTx, page: PageReq): Promise<Page<Row>> {
      return pageBy(
        async (where, limit) =>
          (await drizzleOf(tx)
            .select()
            .from(table as PgTable)
            .where(where)
            .orderBy(asc(table.id))
            .limit(limit)) as Row[],
        table.id,
        page,
      );
    },
    async update(tx: AnyTx, id: string, patch: Partial<T["$inferInsert"]>): Promise<Row | null> {
      const set = { ...patch } as Partial<T["$inferInsert"]> & { id?: unknown };
      delete set.id;
      const rows = (await drizzleOf(tx)
        .update(table)
        .set(set as never)
        .where(eq(table.id, id))
        .returning()) as Row[];
      return rows[0] ?? null;
    },
    async delete(tx: AnyTx, id: string): Promise<boolean> {
      const rows = (await drizzleOf(tx).delete(table).where(eq(table.id, id)).returning()) as Row[];
      return rows.length > 0;
    },
  };
}
