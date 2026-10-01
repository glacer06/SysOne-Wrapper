// A generic store over the auth tables only (ADR-002). The console's auth library adapter calls
// it, so this package stays the only importer of drizzle-orm and never hands out a raw handle.
//
// Models are the drizzle table keys below, fields are their camelCase column keys. An unknown
// model or field throws, so the store can never reach a tenant table or a column we did not name.
// Every call runs in its own withNoTenant transaction: tenant tables return nothing there anyway.

import { and, asc, count as countRows, desc, eq, gt, gte, inArray, lt, lte, ne, notInArray, or, sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn, PgTable } from "drizzle-orm/pg-core";

import type { BandwiseDb } from "./client.js";
import { drizzleOf } from "./internal/drizzle.js";
import { accounts, sessions, twoFactors, users, verificationTokens } from "./schema/identity.js";

const MODELS = { users, sessions, accounts, verificationTokens, twoFactors } as const;

export type AuthModel = keyof typeof MODELS;
export const AUTH_MODELS = Object.keys(MODELS) as AuthModel[];

export type AuthWhereOperator =
  | "eq"
  | "ne"
  | "lt"
  | "lte"
  | "gt"
  | "gte"
  | "in"
  | "not_in"
  | "contains"
  | "starts_with"
  | "ends_with";

export type AuthValue = string | number | boolean | Date | null | string[] | number[];

export interface AuthWhere {
  field: string;
  value: AuthValue;
  operator?: AuthWhereOperator;
  /** How this clause joins the ones before it. Default AND. */
  connector?: "AND" | "OR";
  /** Case-insensitive string comparison. Default sensitive. */
  mode?: "sensitive" | "insensitive";
}

export type AuthRow = Record<string, unknown>;

export interface AuthStore {
  create(model: AuthModel, data: AuthRow): Promise<AuthRow>;
  findOne(model: AuthModel, where: AuthWhere[]): Promise<AuthRow | null>;
  findMany(
    model: AuthModel,
    opts: { where?: AuthWhere[]; limit?: number; offset?: number; sortBy?: { field: string; direction: "asc" | "desc" } },
  ): Promise<AuthRow[]>;
  count(model: AuthModel, where?: AuthWhere[]): Promise<number>;
  /** Updates the first matching row and returns it, or null. */
  update(model: AuthModel, where: AuthWhere[], data: AuthRow): Promise<AuthRow | null>;
  updateMany(model: AuthModel, where: AuthWhere[], data: AuthRow): Promise<number>;
  delete(model: AuthModel, where: AuthWhere[]): Promise<void>;
  deleteMany(model: AuthModel, where: AuthWhere[]): Promise<number>;
  /** Deletes at most one matching row and returns it, in one statement (single-use tokens). */
  consumeOne(model: AuthModel, where: AuthWhere[]): Promise<AuthRow | null>;
  /** `field = field + delta` for each entry, plus plain `set`, on the first matching row. */
  incrementOne(model: AuthModel, where: AuthWhere[], increment: Record<string, number>, set?: AuthRow): Promise<AuthRow | null>;
}

type Table = PgTable & { id: AnyPgColumn };

function tableOf(model: string): Table {
  if (!Object.hasOwn(MODELS, model)) throw new Error(`auth store: unknown model ${model}`);
  return MODELS[model as AuthModel] as unknown as Table;
}

function columnOf(table: Table, model: string, field: string): AnyPgColumn {
  const column = (table as unknown as Record<string, unknown>)[field];
  if (typeof field !== "string" || field.startsWith("_") || column === null || typeof column !== "object" || !("columnType" in column)) {
    throw new Error(`auth store: unknown field ${model}.${field}`);
  }
  return column as AnyPgColumn;
}

/** Only known columns, and never one the caller may not set. */
function values(table: Table, model: string, data: AuthRow): AuthRow {
  const out: AuthRow = {};
  for (const [k, v] of Object.entries(data)) {
    if (v === undefined) continue;
    columnOf(table, model, k);
    out[k] = v;
  }
  return out;
}

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

function clause(table: Table, model: string, w: AuthWhere): SQL {
  const col = columnOf(table, model, w.field);
  const insensitive = w.mode === "insensitive" && typeof w.value === "string";
  const lhs = insensitive ? sql`lower(${col})` : sql`${col}`;
  const str = (v: AuthValue) => (insensitive ? String(v).toLowerCase() : String(v));
  const like = (pattern: string) => (insensitive ? sql`lower(${col}) like ${pattern}` : sql`${col} like ${pattern}`);
  switch (w.operator ?? "eq") {
    case "eq":
      if (w.value === null) return sql`${col} is null`;
      return insensitive ? sql`${lhs} = ${str(w.value)}` : eq(col, w.value);
    case "ne":
      if (w.value === null) return sql`${col} is not null`;
      return insensitive ? sql`${lhs} <> ${str(w.value)}` : ne(col, w.value);
    case "lt":
      return lt(col, w.value);
    case "lte":
      return lte(col, w.value);
    case "gt":
      return gt(col, w.value);
    case "gte":
      return gte(col, w.value);
    case "in":
      if (!Array.isArray(w.value)) throw new Error("auth store: in needs an array");
      return w.value.length === 0 ? sql`false` : inArray(col, w.value);
    case "not_in":
      if (!Array.isArray(w.value)) throw new Error("auth store: not_in needs an array");
      return w.value.length === 0 ? sql`true` : notInArray(col, w.value);
    case "contains":
      return like(`%${escapeLike(str(w.value))}%`);
    case "starts_with":
      return like(`${escapeLike(str(w.value))}%`);
    case "ends_with":
      return like(`%${escapeLike(str(w.value))}`);
    default:
      throw new Error("auth store: unknown operator");
  }
}

/** AND clauses group together; an OR clause starts a new group, as Better Auth's adapters do. */
function whereOf(table: Table, model: string, where: AuthWhere[] | undefined): SQL | undefined {
  if (where === undefined || where.length === 0) return undefined;
  const ands = where.filter((w) => (w.connector ?? "AND") === "AND").map((w) => clause(table, model, w));
  const ors = where.filter((w) => w.connector === "OR").map((w) => clause(table, model, w));
  const all = ands.length > 0 ? and(...ands) : undefined;
  if (ors.length === 0) return all;
  const any = or(...ors);
  return all === undefined ? any : and(all, any);
}

/** One matching id, locked, so update and consume touch at most one row. */
function firstId(table: Table, cond: SQL | undefined): SQL {
  return sql`(select ${table.id} from ${table} where ${cond ?? sql`true`} limit 1 for update)`;
}

export function authStore(db: BandwiseDb): AuthStore {
  const run = <T>(fn: (d: ReturnType<typeof drizzleOf>) => Promise<T>) => db.withNoTenant((tx) => fn(drizzleOf(tx)));
  return {
    async create(model, data) {
      const t = tableOf(model);
      const [row] = (await run((d) => d.insert(t).values(values(t, model, data)).returning())) as AuthRow[];
      if (row === undefined) throw new Error(`auth store: insert into ${model} returned no row`);
      return row;
    },
    async findOne(model, where) {
      const t = tableOf(model);
      const rows = (await run((d) => d.select().from(t).where(whereOf(t, model, where)).limit(1))) as AuthRow[];
      return rows[0] ?? null;
    },
    async findMany(model, opts) {
      const t = tableOf(model);
      const order = opts.sortBy === undefined ? asc(t.id) : (opts.sortBy.direction === "desc" ? desc : asc)(columnOf(t, model, opts.sortBy.field));
      const limit = Math.max(1, Math.min(1000, Math.trunc(opts.limit ?? 100)));
      const offset = Math.max(0, Math.trunc(opts.offset ?? 0));
      return (await run((d) => d.select().from(t).where(whereOf(t, model, opts.where)).orderBy(order).limit(limit).offset(offset))) as AuthRow[];
    },
    async count(model, where) {
      const t = tableOf(model);
      const [row] = await run((d) => d.select({ n: countRows() }).from(t).where(whereOf(t, model, where)));
      return Number(row?.n ?? 0);
    },
    async update(model, where, data) {
      const t = tableOf(model);
      const set = values(t, model, data);
      const rows = (await run((d) =>
        d.update(t).set(set).where(sql`${t.id} = ${firstId(t, whereOf(t, model, where))}`).returning(),
      )) as AuthRow[];
      return rows[0] ?? null;
    },
    async updateMany(model, where, data) {
      const t = tableOf(model);
      const set = values(t, model, data);
      const rows = await run((d) => d.update(t).set(set).where(whereOf(t, model, where)).returning({ id: t.id }));
      return rows.length;
    },
    async delete(model, where) {
      const t = tableOf(model);
      await run((d) => d.delete(t).where(whereOf(t, model, where)));
    },
    async deleteMany(model, where) {
      const t = tableOf(model);
      const rows = await run((d) => d.delete(t).where(whereOf(t, model, where)).returning({ id: t.id }));
      return rows.length;
    },
    async consumeOne(model, where) {
      const t = tableOf(model);
      const rows = (await run((d) =>
        d.delete(t).where(sql`${t.id} = ${firstId(t, whereOf(t, model, where))}`).returning(),
      )) as AuthRow[];
      return rows[0] ?? null;
    },
    async incrementOne(model, where, increment, set = {}) {
      const t = tableOf(model);
      const patch: Record<string, unknown> = values(t, model, set);
      for (const [field, delta] of Object.entries(increment)) {
        if (!Number.isFinite(delta)) throw new Error("auth store: increment must be a number");
        const col = columnOf(t, model, field);
        patch[field] = sql`${col} + ${delta}`;
      }
      const rows = (await run((d) =>
        d.update(t).set(patch).where(sql`${t.id} = ${firstId(t, whereOf(t, model, where))}`).returning(),
      )) as AuthRow[];
      return rows[0] ?? null;
    },
  };
}
