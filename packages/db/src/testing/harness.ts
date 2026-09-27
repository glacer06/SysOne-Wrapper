// Test harness: a real Postgres (PGlite, Postgres 18 compiled to WebAssembly, in process) with
// migration 0001 applied as the owning superuser, the platform seed written as bandwise_platform,
// and then `SET ROLE bandwise_app` for the rest of the session. Every query a test makes after
// that runs as the app role, which has neither SUPERUSER nor BYPASSRLS, so RLS applies exactly as
// it does in production.
//
// No Docker and no external service: CI runs it like any unit test. Excluded from the build.

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";

import { type BandwiseDb, wrapDrizzle } from "../client.js";
import type { DrizzleDb } from "../internal/drizzle.js";
import { migrateDrizzle, seedPlatformRows } from "../migrate.js";
import { APP_ROLE } from "../rls.js";
import * as schema from "../schema/index.js";

export interface TestDatabase {
  /** The app-role database, as the console gets it. */
  db: BandwiseDb;
  /** The raw PGlite session, for catalog queries in schema tests. Runs as bandwise_app. */
  pglite: PGlite;
  close(): Promise<void>;
}

export async function createTestDatabase(): Promise<TestDatabase> {
  const pglite = new PGlite();
  const owner: DrizzleDb = drizzle(pglite, { schema, casing: "snake_case" });
  await migrateDrizzle(owner);
  await seedPlatformRows(owner);
  await pglite.exec(`SET ROLE ${APP_ROLE}`);
  const app: DrizzleDb = drizzle(pglite, { schema, casing: "snake_case" });
  const close = () => pglite.close();
  return { db: wrapDrizzle(app, close), pglite, close };
}
