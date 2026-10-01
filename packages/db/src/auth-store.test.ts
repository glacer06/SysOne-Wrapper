// The auth store behind the console's auth library adapter (ADR-002). It reaches only the five
// auth tables and their named columns, and its where clauses match what the library sends.

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { authStore, type AuthStore } from "./auth-store.js";
import { createTestDatabase, type TestDatabase } from "./testing/harness.js";

let t: TestDatabase;
let store: AuthStore;

beforeAll(async () => {
  t = await createTestDatabase();
  store = authStore(t.db);
}, 120_000);

afterAll(async () => {
  await t?.close();
});

async function user(email: string) {
  return store.create("users", { name: email.split("@")[0], email, emailVerified: true });
}

describe("auth store", () => {
  it("creates and finds a user, case-insensitively when asked", async () => {
    const u = await user("Ada@Example.test");
    expect(u["id"]).toEqual(expect.any(String));
    expect(await store.findOne("users", [{ field: "email", value: "ada@example.test" }])).toBeNull();
    const found = await store.findOne("users", [{ field: "email", value: "ada@example.test", mode: "insensitive" }]);
    expect(found?.["id"]).toBe(u["id"]);
  });

  it("refuses a model or field outside the auth tables", async () => {
    await expect(store.findOne("memberships" as never, [])).rejects.toThrow(/unknown model/);
    await expect(store.findOne("users", [{ field: "orgId", value: "x" }])).rejects.toThrow(/unknown field/);
    await expect(store.create("users", { name: "x", email: "x@x.test", nope: 1 })).rejects.toThrow(/unknown field/);
  });

  it("groups AND clauses and OR clauses like the library", async () => {
    const a = await user("or-a@example.test");
    const b = await user("or-b@example.test");
    const rows = await store.findMany("users", {
      where: [
        { field: "email", value: "or-a@example.test", connector: "OR" },
        { field: "email", value: "or-b@example.test", connector: "OR" },
      ],
      sortBy: { field: "email", direction: "desc" },
    });
    expect(rows.map((r) => r["id"])).toEqual([b["id"], a["id"]]);
    expect(await store.count("users", [{ field: "email", value: "or-", operator: "starts_with" }])).toBe(2);
    expect(await store.count("users", [{ field: "email", value: ["or-a@example.test"], operator: "in" }])).toBe(1);
    expect(await store.count("users", [{ field: "email", value: "%", operator: "contains" }])).toBe(0);
  });

  it("updates one row, consumes one row and increments a counter", async () => {
    const u = await user("tf@example.test");
    const tf = await store.create("twoFactors", { userId: u["id"], secret: "s", backupCodes: "b", verified: false });
    expect(tf["verified"]).toBe(false);
    const updated = await store.update("twoFactors", [{ field: "userId", value: u["id"] as string }], { verified: true });
    expect(updated?.["verified"]).toBe(true);

    const bumped = await store.incrementOne("twoFactors", [{ field: "id", value: tf["id"] as string }], { failedVerificationCount: 2 });
    expect(bumped?.["failedVerificationCount"]).toBe(2);

    const expiresAt = new Date(Date.UTC(2030, 0, 1));
    await store.create("verificationTokens", { identifier: "once", value: "v", expiresAt });
    await store.create("verificationTokens", { identifier: "once", value: "w", expiresAt });
    const first = await store.consumeOne("verificationTokens", [{ field: "identifier", value: "once" }]);
    expect(first).not.toBeNull();
    expect(await store.count("verificationTokens", [{ field: "identifier", value: "once" }])).toBe(1);
    expect(await store.deleteMany("verificationTokens", [{ field: "identifier", value: "once" }])).toBe(1);
    expect(await store.consumeOne("verificationTokens", [{ field: "identifier", value: "once" }])).toBeNull();
  });

  it("deletes sessions with the user", async () => {
    const u = await user("cascade@example.test");
    const expiresAt = new Date(Date.UTC(2030, 0, 1));
    await store.create("sessions", { userId: u["id"], token: "tok-cascade", expiresAt });
    await store.delete("users", [{ field: "id", value: u["id"] as string }]);
    expect(await store.findOne("sessions", [{ field: "token", value: "tok-cascade" }])).toBeNull();
  });
});
