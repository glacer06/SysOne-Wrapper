// Console sign-in limits and admin-issued enrollment codes (migration 0007), as the app role.

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { eq } from "drizzle-orm";

import { drizzleOf } from "./internal/drizzle.js";
import { authRepositories } from "./repos/index.js";
import { authAttempts } from "./schema/index.js";
import { createTestDatabase, type TestDatabase } from "./testing/harness.js";

let t: TestDatabase;

beforeAll(async () => {
  t = await createTestDatabase();
}, 120_000);

afterAll(async () => {
  await t?.close();
});

const MIN = 60_000;
const take = (keys: { keyHash: string; max: number; windowMs: number }[], at: number) =>
  t.db.withNoTenant((tx) => authRepositories.authAttempts.take(tx, keys, new Date(at)));

describe("auth attempts", () => {
  it("allows max attempts per window, then refuses until the window ends", async () => {
    const k = [{ keyHash: "a".repeat(64), max: 3, windowMs: 15 * MIN }];
    const start = Date.parse("2026-10-01T12:00:00Z");
    expect([await take(k, start), await take(k, start + 1), await take(k, start + 2)]).toEqual([true, true, true]);
    expect(await take(k, start + 3)).toBe(false);
    expect(await take(k, start + 15 * MIN)).toBe(true);
  });

  it("counts nothing when any key is at its limit", async () => {
    const start = Date.parse("2026-10-01T13:00:00Z");
    const ip = { keyHash: "b".repeat(64), max: 10, windowMs: 15 * MIN };
    const email = { keyHash: "c".repeat(64), max: 1, windowMs: 15 * MIN };
    expect(await take([ip, email], start)).toBe(true);
    expect(await take([ip, email], start + 1)).toBe(false);
    const row = await t.db.withNoTenant(async (tx) => (await drizzleOf(tx).select().from(authAttempts).where(eq(authAttempts.keyHash, ip.keyHash)))[0]);
    expect(row?.count).toBe(1);
  });
});

describe("console enrollments", () => {
  it("matches an unexpired code once, and a new code replaces the old one", async () => {
    const userId = await t.db.withNoTenant(async (tx) => (await authRepositories.users.insert(tx, { email: "enrol@x.test", name: "E", emailVerified: true })).id);
    const now = new Date("2026-10-01T12:00:00Z");
    const later = new Date(now.getTime() + 60 * MIN);
    await t.db.withNoTenant((tx) => authRepositories.consoleEnrollments.issue(tx, userId, "h1", later));
    expect(await t.db.withNoTenant((tx) => authRepositories.consoleEnrollments.matches(tx, userId, "h1", now))).toBe(true);
    expect(await t.db.withNoTenant((tx) => authRepositories.consoleEnrollments.matches(tx, userId, "h2", now))).toBe(false);
    expect(await t.db.withNoTenant((tx) => authRepositories.consoleEnrollments.matches(tx, userId, "h1", later))).toBe(false);
    await t.db.withNoTenant((tx) => authRepositories.consoleEnrollments.issue(tx, userId, "h2", later));
    expect(await t.db.withNoTenant((tx) => authRepositories.consoleEnrollments.matches(tx, userId, "h1", now))).toBe(false);
    expect(await t.db.withNoTenant((tx) => authRepositories.consoleEnrollments.consume(tx, userId))).toBe(true);
    expect(await t.db.withNoTenant((tx) => authRepositories.consoleEnrollments.consume(tx, userId))).toBe(false);
  });
});
