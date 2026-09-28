// One pooled database per server instance, created on first use. On Vercel, DATABASE_URL is the
// Supavisor transaction pooler (runbooks/database.md), so the pool stays small.
import "server-only";

import { createDatabase, type BandwiseDb } from "@bandwise/db";

import { env } from "~/env";

let db: BandwiseDb | undefined;

export function getDb(): BandwiseDb {
  db ??= createDatabase({ connectionString: env.DATABASE_URL, max: 3 });
  return db;
}
