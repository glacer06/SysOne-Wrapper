import { createTestDatabase, type TestDatabase } from "@bandwise/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { type AttemptLimiter, createAttemptLimiter, createDbAttemptLimiter } from "./attempts";

let t: TestDatabase;

beforeAll(async () => {
  t = await createTestDatabase();
}, 120_000);

afterAll(async () => {
  await t?.close();
});

async function scenario(make: (clock: () => number) => AttemptLimiter, prefix: string) {
  let now = 1_790_000_000_000;
  const limiter = make(() => now);
  const ip = { key: `${prefix}ip:a`, limit: { max: 3, windowMs: 1000 } };
  const email = { key: `${prefix}email:x`, limit: { max: 2, windowMs: 1000 } };

  expect(await limiter.take([ip, email])).toBe(true);
  expect(await limiter.take([ip, email])).toBe(true);
  // The email is at its limit, so the IP is not charged either.
  expect(await limiter.take([ip, email])).toBe(false);
  expect(await limiter.take([ip])).toBe(true);
  expect(await limiter.take([ip])).toBe(false);

  now += 1000;
  expect(await limiter.take([ip, email])).toBe(true);
}

describe("attempt limiter", () => {
  it("allows up to the limit per key, counts nothing when refused, and resets with the window (memory)", async () => {
    await scenario((clock) => createAttemptLimiter(clock), "");
  });

  it("follows the same rules in the database", async () => {
    await scenario((clock) => createDbAttemptLimiter(t.db, clock), "db:");
  });

  it("shares one count across instances, which is the point of the database limiter", async () => {
    const now = () => 1_790_000_100_000;
    const a = createDbAttemptLimiter(t.db, now);
    const b = createDbAttemptLimiter(t.db, now);
    const key = [{ key: "shared:email:y", limit: { max: 2, windowMs: 60_000 } }];
    expect(await a.take(key)).toBe(true);
    expect(await b.take(key)).toBe(true);
    expect(await a.take(key)).toBe(false);
    expect(await b.take(key)).toBe(false);
  });
});
