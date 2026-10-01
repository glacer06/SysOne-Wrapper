// Hosted run limit windows (migration 0008), as the app role.

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { authRepositories } from "./repos/index.js";
import { createTestDatabase, type TestDatabase } from "./testing/harness.js";

let t: TestDatabase;

beforeAll(async () => {
  t = await createTestDatabase();
}, 120_000);

afterAll(async () => {
  await t?.close();
});

const r = authRepositories.runLimits;
const MIN = 60_000;
const at = (iso: string) => new Date(iso);

describe("run limits", () => {
  it("counts up to max in a window, refuses past it without counting, and starts over in the next window", async () => {
    const k = { keyHash: "a".repeat(64), amount: 1, max: 3 };
    const w1 = at("2026-10-01T12:00:00Z");
    const take = (windowStart: Date) => t.db.withNoTenant((tx) => r.take(tx, { ...k, windowStart }));
    expect((await Promise.all([take(w1), take(w1), take(w1)])).map((x) => x.ok)).toEqual([true, true, true]);
    expect(await take(w1)).toEqual({ ok: false, used: 3 });
    expect(await t.db.withNoTenant((tx) => r.used(tx, k.keyHash, w1))).toBe(3);
    const w2 = new Date(w1.getTime() + MIN);
    expect(await take(w2)).toEqual({ ok: true, used: 1 });
    // A caller whose clock is still in the old window counts against the newer one.
    expect(await take(w1)).toEqual({ ok: true, used: 2 });
    expect(await t.db.withNoTenant((tx) => r.used(tx, k.keyHash, w2))).toBe(2);
  });

  it("charges spend without a limit and reads it back per window", async () => {
    const keyHash = "b".repeat(64);
    const day = at("2026-10-01T00:00:00Z");
    expect(await t.db.withNoTenant((tx) => r.charge(tx, { keyHash, windowStart: day, amount: 4_000_000 }))).toBe(4_000_000);
    expect(await t.db.withNoTenant((tx) => r.charge(tx, { keyHash, windowStart: day, amount: 3_000_000 }))).toBe(7_000_000);
    expect(await t.db.withNoTenant((tx) => r.used(tx, keyHash, day))).toBe(7_000_000);
    const next = at("2026-10-02T00:00:00Z");
    expect(await t.db.withNoTenant((tx) => r.used(tx, keyHash, next))).toBe(0);
    expect(await t.db.withNoTenant((tx) => r.used(tx, "c".repeat(64), day))).toBe(0);
  });

  it("prunes windows older than the cutoff", async () => {
    const keyHash = "d".repeat(64);
    const old = at("2026-09-01T00:00:00Z");
    await t.db.withNoTenant((tx) => r.charge(tx, { keyHash, windowStart: old, amount: 5 }));
    await t.db.withNoTenant((tx) => r.prune(tx, at("2026-09-02T00:00:00Z")));
    expect(await t.db.withNoTenant((tx) => r.used(tx, keyHash, old))).toBe(0);
  });
});
