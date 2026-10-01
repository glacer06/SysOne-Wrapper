// The auth library's database adapter (ADR-002), over @bandwise/db's auth store. The store reaches
// only the five auth tables, so the library can never read or write a tenant table.
//
// Session tokens are stored hashed. The library makes a raw token, writes the session through
// create, and sets the cookie from what create returns. So create stores the hash and returns the
// raw token, and every where clause on sessions.token is hashed before it reaches the store. A read
// of the sessions table therefore holds nothing that works as a cookie. Rows found by a token come
// back with the raw token the caller already had; rows found any other way (by user id) carry only
// the stored hash, which matches nothing when passed back in. The console calls no library route
// that lists sessions and then deletes them one token at a time: sign-out and the two-factor steps
// delete by the token in hand, and a password reset revokes by user id.
//
// No rows from before hashing need moving: the console had not been deployed when this shipped, so
// no sessions table anywhere holds a raw token. A raw token left in some local database simply
// stops matching, which signs that browser out.

import { createAdapterFactory } from "better-auth/adapters";

import { type AuthModel, type AuthRow, type AuthStore, type AuthValue, type AuthWhere, AUTH_MODELS } from "@bandwise/db";

interface LibraryWhere {
  field: string;
  value: AuthValue;
  operator: string;
  connector: "AND" | "OR";
  mode?: "sensitive" | "insensitive";
}

function model(name: string): AuthModel {
  if (!(AUTH_MODELS as string[]).includes(name)) throw new Error(`auth adapter: unknown model ${name}`);
  return name as AuthModel;
}

export interface AuthAdapterOptions {
  /** Hashes a session token for storage and lookup (tenancy's createSessionTokenHasher). */
  hashSessionToken: (token: string) => string;
}

const SESSIONS: AuthModel = "sessions";
const TOKEN = "token";

/** The library's where clauses for one call, with session tokens hashed, plus hash to raw for the reply. */
interface Translated {
  where: AuthWhere[];
  raw: Map<string, string>;
}

function translate(m: AuthModel, clauses: readonly LibraryWhere[] | undefined, hash: (token: string) => string): Translated {
  const raw = new Map<string, string>();
  const hashOne = (v: unknown): string => {
    if (typeof v !== "string") throw new Error("auth adapter: a session token must be a string");
    const h = hash(v);
    raw.set(h, v);
    return h;
  };
  const where = (clauses ?? []).map((w): AuthWhere => {
    let value = w.value;
    if (m === SESSIONS && w.field === TOKEN) {
      // Only exact matches can be hashed. A pattern or range on a token has no meaning here.
      const op = w.operator;
      if (op === "eq" || op === "ne") value = hashOne(w.value);
      else if (op === "in" || op === "not_in") {
        if (!Array.isArray(w.value)) throw new Error("auth adapter: in needs an array");
        value = (w.value as unknown[]).map(hashOne);
      } else throw new Error("auth adapter: unsupported operator on sessions.token");
      if (w.mode === "insensitive") throw new Error("auth adapter: sessions.token is case sensitive");
    }
    return {
      field: w.field,
      value,
      operator: w.operator as AuthWhere["operator"],
      connector: w.connector,
      ...(w.mode === undefined ? {} : { mode: w.mode }),
    };
  });
  return { where, raw };
}

/** Puts back the raw token the caller gave us; any other row keeps only its stored hash. */
function reveal(m: AuthModel, row: AuthRow | null, raw: ReadonlyMap<string, string>): AuthRow | null {
  if (row === null || m !== SESSIONS || typeof row[TOKEN] !== "string") return row;
  const known = raw.get(row[TOKEN]);
  return known === undefined ? row : { ...row, [TOKEN]: known };
}

export function bandwiseAuthAdapter(store: AuthStore, opts: AuthAdapterOptions) {
  const hash = opts.hashSessionToken;
  const where = (m: AuthModel, w: readonly LibraryWhere[] | undefined) => translate(m, w, hash);
  /** A token in written data (create or update) is stored as its hash. */
  const data = (m: AuthModel, d: Record<string, unknown>): { row: AuthRow; raw: Map<string, string> } => {
    const raw = new Map<string, string>();
    if (m !== SESSIONS || d[TOKEN] === undefined) return { row: d, raw };
    if (typeof d[TOKEN] !== "string") throw new Error("auth adapter: a session token must be a string");
    const h = hash(d[TOKEN]);
    raw.set(h, d[TOKEN]);
    return { row: { ...d, [TOKEN]: h }, raw };
  };
  const both = (a: Map<string, string>, b: Map<string, string>) => new Map([...a, ...b]);

  return createAdapterFactory({
    config: {
      adapterId: "bandwise",
      adapterName: "Bandwise auth store",
      usePlural: false,
      supportsUUIDs: true,
      supportsDates: true,
      supportsBooleans: true,
      supportsJSON: true,
      supportsArrays: true,
      transaction: false,
    },
    adapter: () => ({
      create: async ({ model: name, data: input }) => {
        const m = model(name);
        const { row, raw } = data(m, input);
        return reveal(m, await store.create(m, row), raw) as never;
      },
      findOne: async ({ model: name, where: w }) => {
        const m = model(name);
        const q = where(m, w);
        return reveal(m, await store.findOne(m, q.where), q.raw) as never;
      },
      findMany: async ({ model: name, where: w, limit, offset, sortBy }) => {
        const m = model(name);
        const q = where(m, w);
        const rows = await store.findMany(m, {
          where: q.where,
          limit,
          ...(offset === undefined ? {} : { offset }),
          ...(sortBy === undefined ? {} : { sortBy }),
        });
        return rows.map((r) => reveal(m, r, q.raw)) as never;
      },
      count: async ({ model: name, where: w }) => {
        const m = model(name);
        return store.count(m, where(m, w).where);
      },
      update: async ({ model: name, where: w, update }) => {
        const m = model(name);
        const q = where(m, w);
        const u = data(m, update as Record<string, unknown>);
        return reveal(m, await store.update(m, q.where, u.row), both(q.raw, u.raw)) as never;
      },
      updateMany: async ({ model: name, where: w, update }) => {
        const m = model(name);
        return store.updateMany(m, where(m, w).where, data(m, update).row);
      },
      delete: async ({ model: name, where: w }) => {
        const m = model(name);
        return store.delete(m, where(m, w).where);
      },
      deleteMany: async ({ model: name, where: w }) => {
        const m = model(name);
        return store.deleteMany(m, where(m, w).where);
      },
      consumeOne: async ({ model: name, where: w }) => {
        const m = model(name);
        const q = where(m, w);
        return reveal(m, await store.consumeOne(m, q.where), q.raw) as never;
      },
      incrementOne: async ({ model: name, where: w, increment, set }) => {
        const m = model(name);
        const q = where(m, w);
        const s = data(m, (set ?? {}) as Record<string, unknown>);
        const row = await store.incrementOne(m, q.where, increment, set === undefined ? undefined : s.row);
        return reveal(m, row, both(q.raw, s.raw)) as never;
      },
    }),
  });
}
