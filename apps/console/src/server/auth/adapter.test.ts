// The auth adapter's session-token hashing, over a fake AuthStore that records what reaches it.
// Every path that writes or looks up sessions.token must hash it; rows found any other way must
// come back with only the stored hash; and the list-then-revoke paths must match a listed row's
// stored hash, while a cookie lookup never does.

import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import type { AuthModel, AuthRow, AuthStore, AuthWhere } from "@bandwise/db";
import { describe, expect, it } from "vitest";

import { bandwiseAdapterMethods, ListedSessionHashes } from "./adapter";

const hash = (token: string) => `h(${token})`;

interface Call {
  op: string;
  model: AuthModel;
  where?: AuthWhere[];
  data?: AuthRow;
}

/** Records every call; reads answer with `rows`. */
function fakeStore(rows: AuthRow[] = []) {
  const calls: Call[] = [];
  const store: AuthStore = {
    create: async (model, data) => (calls.push({ op: "create", model, data }), { ...data }),
    findOne: async (model, where) => (calls.push({ op: "findOne", model, where }), rows[0] ?? null),
    findMany: async (model, opts) => (calls.push({ op: "findMany", model, ...(opts.where === undefined ? {} : { where: opts.where }) }), rows),
    count: async (model, where) => (calls.push({ op: "count", model, ...(where === undefined ? {} : { where }) }), rows.length),
    update: async (model, where, data) => (calls.push({ op: "update", model, where, data }), rows[0] === undefined ? null : { ...rows[0], ...data }),
    updateMany: async (model, where, data) => (calls.push({ op: "updateMany", model, where, data }), rows.length),
    delete: async (model, where) => void calls.push({ op: "delete", model, where }),
    deleteMany: async (model, where) => (calls.push({ op: "deleteMany", model, where }), rows.length),
    consumeOne: async (model, where) => (calls.push({ op: "consumeOne", model, where }), rows[0] ?? null),
    incrementOne: async (model, where, _increment, set) => (calls.push({ op: "incrementOne", model, where, ...(set === undefined ? {} : { data: set }) }), rows[0] ?? null),
  };
  return { store, calls };
}

type Methods = Record<string, (args: Record<string, unknown>) => Promise<unknown>>;

function adapter(rows: AuthRow[] = [], listed = new ListedSessionHashes()) {
  const { store, calls } = fakeStore(rows);
  const methods = bandwiseAdapterMethods(store, { hashSessionToken: hash, listed }) as unknown as Methods;
  return { m: methods, calls };
}

const byUser = [{ field: "userId", value: "u", operator: "eq", connector: "AND" }];

const byToken = (value: unknown, operator = "eq") => [{ field: "token", value, operator, connector: "AND" }];

describe("auth adapter: session tokens", () => {
  it("stores the hash on create and answers with the raw token", async () => {
    const { m, calls } = adapter();
    const row = await m["create"]?.({ model: "sessions", data: { token: "raw-1", userId: "u" } });
    expect(calls[0]?.data).toEqual({ token: "h(raw-1)", userId: "u" });
    expect(row).toEqual({ token: "raw-1", userId: "u" });
  });

  it("hashes a token in every where clause and puts the raw token back on the row", async () => {
    const stored = { id: "s1", token: "h(raw-1)", userId: "u" };
    for (const op of ["findOne", "consumeOne"]) {
      const { m, calls } = adapter([stored]);
      const row = await m[op]?.({ model: "sessions", where: byToken("raw-1") });
      expect(calls[0]?.where?.[0]).toMatchObject({ field: "token", value: "h(raw-1)", operator: "eq" });
      expect(row).toMatchObject({ token: "raw-1" });
    }
    const { m, calls } = adapter([stored]);
    await m["count"]?.({ model: "sessions", where: byToken("raw-1", "ne") });
    expect(calls[0]?.where?.[0]).toMatchObject({ value: "h(raw-1)", operator: "ne" });
  });

  it("hashes the token in update, updateMany and incrementOne, in the where clause and in the data", async () => {
    const stored = { id: "s1", token: "h(raw-1)", userId: "u" };
    const u = adapter([stored]);
    const updated = await u.m["update"]?.({ model: "sessions", where: byToken("raw-1"), update: { token: "raw-2" } });
    expect(u.calls[0]).toMatchObject({ where: [{ value: "h(raw-1)" }], data: { token: "h(raw-2)" } });
    expect(updated).toMatchObject({ token: "raw-2" });

    const many = adapter([stored]);
    await many.m["updateMany"]?.({ model: "sessions", where: byToken("raw-1"), update: { token: "raw-3" } });
    expect(many.calls[0]).toMatchObject({ where: [{ value: "h(raw-1)" }], data: { token: "h(raw-3)" } });

    const inc = adapter([stored]);
    const row = await inc.m["incrementOne"]?.({ model: "sessions", where: byToken("raw-1"), increment: {}, set: { token: "raw-4" } });
    expect(inc.calls[0]).toMatchObject({ where: [{ value: "h(raw-1)" }], data: { token: "h(raw-4)" } });
    expect(row).toMatchObject({ token: "raw-1" });
  });

  it("hashes every element of in and not_in", async () => {
    for (const operator of ["in", "not_in"]) {
      const { m, calls } = adapter();
      await m["findMany"]?.({ model: "sessions", where: byToken(["a", "b"], operator), limit: 10 });
      expect(calls[0]?.where?.[0]).toMatchObject({ value: ["h(a)", "h(b)"], operator });
    }
  });

  it("returns only the stored hash for rows found by user id, and that hash never works as a cookie", async () => {
    const stored = { id: "s1", token: "h(raw-1)", userId: "u" };
    const { m, calls } = adapter([stored]);
    const rows = (await m["findMany"]?.({ model: "sessions", where: byUser, limit: 10 })) as AuthRow[];
    expect(rows[0]?.["token"]).toBe("h(raw-1)");
    expect(rows.some((r) => r["token"] === "raw-1")).toBe(false);
    // The cookie lookup and the updates hash it again, so it matches nothing.
    await m["findOne"]?.({ model: "sessions", where: byToken("h(raw-1)") });
    expect(calls[1]?.where?.[0]).toMatchObject({ value: "h(h(raw-1))", operator: "eq" });
    await m["update"]?.({ model: "sessions", where: byToken("h(raw-1)"), update: {} });
    expect(calls[2]?.where?.[0]).toMatchObject({ value: "h(h(raw-1))" });
    await m["consumeOne"]?.({ model: "sessions", where: byToken("h(raw-1)") });
    expect(calls[3]?.where?.[0]).toMatchObject({ value: "h(h(raw-1))" });
  });

  it("revokes a listed session by the hash it was listed with", async () => {
    const stored = { id: "s1", token: "h(raw-1)", userId: "u" };
    const { m, calls } = adapter([stored]);
    await m["findMany"]?.({ model: "sessions", where: byUser, limit: 10 });
    // What the library does next: look the row up by that token, then delete it.
    await m["findMany"]?.({ model: "sessions", where: byToken("h(raw-1)"), limit: 1 });
    await m["delete"]?.({ model: "sessions", where: byToken("h(raw-1)") });
    await m["deleteMany"]?.({ model: "sessions", where: byToken(["h(raw-1)", "raw-2"], "in") });
    expect(calls.slice(1).map((c) => c.where?.[0]?.value)).toEqual(["h(raw-1)", "h(raw-1)", ["h(raw-1)", "h(raw-2)"]]);
  });

  it("hashes a value it never listed, and forgets a listed hash after a while", async () => {
    let now = 0;
    const listed = new ListedSessionHashes(1_000, 10, () => now);
    const stored = { id: "s1", token: "h(raw-1)", userId: "u" };
    const { m, calls } = adapter([stored], listed);
    await m["delete"]?.({ model: "sessions", where: byToken("h(raw-9)") });
    expect(calls[0]?.where?.[0]?.value).toBe("h(h(raw-9))");
    await m["findMany"]?.({ model: "sessions", where: byUser, limit: 10 });
    now = 2_000;
    await m["delete"]?.({ model: "sessions", where: byToken("h(raw-1)") });
    expect(calls[2]?.where?.[0]?.value).toBe("h(h(raw-1))");
  });

  it("remembers a bounded number of listed hashes", () => {
    const listed = new ListedSessionHashes(60_000, 2, () => 0);
    for (const h of ["a", "b", "c"]) listed.remember(h);
    expect([listed.has("a"), listed.has("b"), listed.has("c")]).toEqual([false, true, true]);
  });

  it("refuses token clauses it cannot hash", async () => {
    const { m } = adapter();
    await expect(m["findOne"]?.({ model: "sessions", where: byToken("raw", "contains") })).rejects.toThrow(/unsupported operator/);
    await expect(m["findOne"]?.({ model: "sessions", where: byToken("raw", "starts_with") })).rejects.toThrow(/unsupported operator/);
    await expect(m["findOne"]?.({ model: "sessions", where: byToken("raw", "in") })).rejects.toThrow(/in needs an array/);
    await expect(m["findOne"]?.({ model: "sessions", where: byToken(42) })).rejects.toThrow(/must be a string/);
    await expect(m["delete"]?.({ model: "sessions", where: byToken(42) })).rejects.toThrow(/must be a string/);
    await expect(m["findMany"]?.({ model: "sessions", where: byToken(["ok", 7], "in") })).rejects.toThrow(/must be a string/);
    await expect(m["findOne"]?.({ model: "sessions", where: [{ ...byToken("raw")[0], mode: "insensitive" }] })).rejects.toThrow(/case sensitive/);
    await expect(m["create"]?.({ model: "sessions", data: { token: 42 } })).rejects.toThrow(/must be a string/);
  });

  it("leaves other models and fields alone", async () => {
    const { m, calls } = adapter([{ id: "v", token: "x" }]);
    await m["findOne"]?.({ model: "verificationTokens", where: byToken("plain") });
    expect(calls[0]?.where?.[0]).toMatchObject({ value: "plain" });
    await expect(m["findOne"]?.({ model: "not-a-model", where: [] })).rejects.toThrow(/unknown model/);
  });
});

describe("auth HTTP handler", () => {
  it("is not mounted: the console calls the library only through Server Actions", () => {
    // A mounted handler would expose library routes (session listing, revoking other sessions)
    // that the adapter's hashing has not been reviewed for. Mounting it needs that review first.
    const dir = fileURLToPath(new URL("../../app/api/auth", import.meta.url));
    expect(existsSync(dir)).toBe(false);
  });
});
