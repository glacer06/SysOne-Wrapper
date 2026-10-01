// The auth library's database adapter (ADR-002), over @bandwise/db's auth store. The store reaches
// only the five auth tables, so the library can never read or write a tenant table.

import { createAdapterFactory } from "better-auth/adapters";

import { type AuthModel, type AuthStore, type AuthValue, type AuthWhere, AUTH_MODELS } from "@bandwise/db";

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

function where(clauses: readonly LibraryWhere[] | undefined): AuthWhere[] {
  return (clauses ?? []).map((w) => ({
    field: w.field,
    value: w.value,
    operator: w.operator as AuthWhere["operator"],
    connector: w.connector,
    ...(w.mode === undefined ? {} : { mode: w.mode }),
  }));
}

export function bandwiseAuthAdapter(store: AuthStore) {
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
      create: async ({ model: m, data }) => (await store.create(model(m), data)) as never,
      findOne: async ({ model: m, where: w }) => (await store.findOne(model(m), where(w))) as never,
      findMany: async ({ model: m, where: w, limit, offset, sortBy }) =>
        (await store.findMany(model(m), {
          where: where(w),
          limit,
          ...(offset === undefined ? {} : { offset }),
          ...(sortBy === undefined ? {} : { sortBy }),
        })) as never,
      count: async ({ model: m, where: w }) => store.count(model(m), where(w)),
      update: async ({ model: m, where: w, update }) => (await store.update(model(m), where(w), update as Record<string, unknown>)) as never,
      updateMany: async ({ model: m, where: w, update }) => store.updateMany(model(m), where(w), update),
      delete: async ({ model: m, where: w }) => store.delete(model(m), where(w)),
      deleteMany: async ({ model: m, where: w }) => store.deleteMany(model(m), where(w)),
      consumeOne: async ({ model: m, where: w }) => (await store.consumeOne(model(m), where(w))) as never,
      incrementOne: async ({ model: m, where: w, increment, set }) =>
        (await store.incrementOne(model(m), where(w), increment, set as Record<string, unknown> | undefined)) as never,
    }),
  });
}
