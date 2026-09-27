// Applies migrations/*.sql in journal order and seeds the platform rows (the model registry, its
// OpenRouter routes, platform price rows and platform settings) from @bandwise/core's catalog.
//
// Runs as the migrating role (the table owner), never as bandwise_app. The migrator is driver
// agnostic, so the node-postgres deployment and the PGlite test harness share it.

import { readMigrationFiles } from "drizzle-orm/migrator";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { fileURLToPath } from "node:url";
import pg from "pg";

import {
  SEED_COMPARATOR_PRICES,
  SEED_DEFAULT_COMPARATOR_MODEL,
  SEED_MODEL_PROFILES,
  SEED_MODEL_ROUTES,
  SEED_PLATFORM_DEFAULT_MODEL,
  SEED_SYSTEM_ONE_PRICES,
} from "@bandwise/core";

import { dataApiExposureError, findDataApiExposure } from "./data-api-roles.js";
import type { DrizzleDb } from "./internal/drizzle.js";
import { PLATFORM_ROLE } from "./rls.js";
import * as s from "./schema/index.js";

/** packages/db/migrations, from src/ and from dist/. */
export const MIGRATIONS_DIR = fileURLToPath(new URL("../migrations/", import.meta.url));

const JOURNAL_TABLE = "bandwise_migrations";

/**
 * Applies every migration not yet recorded in bandwise_migrations. Returns how many ran.
 *
 * Then, in the same transaction, checks that no Supabase Data API role (anon, authenticated,
 * service_role) can reach schema public or anything in it. When one can, the whole run rolls back.
 */
export async function migrateDrizzle(db: DrizzleDb, migrationsFolder = MIGRATIONS_DIR): Promise<number> {
  const migrations = readMigrationFiles({ migrationsFolder });
  return db.transaction(async (tx) => {
    await tx.execute(
      sql.raw(`CREATE TABLE IF NOT EXISTS ${JOURNAL_TABLE} (hash text PRIMARY KEY, created_at bigint NOT NULL)`),
    );
    const done = (await tx.execute(sql.raw(`SELECT hash FROM ${JOURNAL_TABLE}`))) as unknown as {
      rows: { hash: string }[];
    };
    const applied = new Set(done.rows.map((r) => r.hash));
    let ran = 0;
    for (const m of migrations) {
      if (applied.has(m.hash)) continue;
      for (const statement of m.sql) {
        if (statement.trim() === "") continue;
        await tx.execute(sql.raw(statement));
      }
      await tx.execute(sql`INSERT INTO ${sql.raw(JOURNAL_TABLE)} (hash, created_at) VALUES (${m.hash}, ${m.folderMillis})`);
      ran += 1;
    }
    const exposed = await findDataApiExposure(tx);
    if (exposed.length > 0) throw dataApiExposureError(exposed);
    return ran;
  });
}

/**
 * Seeds platform rows as bandwise_platform (SET LOCAL ROLE), so the platform policies apply. Existing
 * rows are left alone: once seeded, the registry belongs to the platform admin. Writes one platform
 * audit row when anything was inserted.
 */
export async function seedPlatformRows(db: DrizzleDb): Promise<number> {
  return db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL ROLE ${PLATFORM_ROLE}`));
    let inserted = 0;
    const models = await tx
      .insert(s.systemOneModels)
      .values(
        SEED_MODEL_PROFILES.map((p) => ({
          id: p.id,
          family: p.family,
          kind: p.kind,
          aliasTarget: p.aliasTarget,
          status: p.status,
          releaseDate: p.releaseDate,
          retireAt: p.retireAt,
          questionTypes: [...p.questionTypes],
          limits: p.limits,
          inputModalities: [...p.inputModalities],
          weaknesses: [...p.weaknesses],
          supersedes: [...p.supersedes],
          docsUrl: p.docsUrl,
          jaggednessUrl: p.jaggednessUrl,
          lastReviewed: p.lastReviewed,
        })),
      )
      .onConflictDoNothing()
      .returning({ id: s.systemOneModels.id });
    inserted += models.length;
    const routes = await tx
      .insert(s.systemOneModelRoutes)
      .values(
        SEED_MODEL_ROUTES.map((r) => ({
          modelId: r.modelId,
          provider: r.provider,
          providerModelId: r.providerModelId,
          pinned: r.pinned,
          resolvedIds: [...r.resolvedIds],
          limits: r.limits,
          docsUrl: r.docsUrl,
          lastReviewed: r.lastReviewed,
        })),
      )
      .onConflictDoNothing()
      .returning({ modelId: s.systemOneModelRoutes.modelId });
    inserted += routes.length;
    const prices = await tx
      .insert(s.priceBooks)
      .values(
        [...SEED_SYSTEM_ONE_PRICES, ...SEED_COMPARATOR_PRICES].map((p) => ({
          orgId: null,
          model: p.model,
          provider: null,
          inputPerMtokMicroUsd: p.inputPerMtokMicroUsd,
          outputPerMtokMicroUsd: p.outputPerMtokMicroUsd,
        })),
      )
      .onConflictDoNothing()
      .returning({ id: s.priceBooks.id });
    inserted += prices.length;
    const settings = await tx
      .insert(s.settings)
      .values([
        { key: "defaultModel", value: SEED_PLATFORM_DEFAULT_MODEL },
        { key: "defaultComparatorModel", value: SEED_DEFAULT_COMPARATOR_MODEL },
      ])
      .onConflictDoNothing()
      .returning({ key: s.settings.key });
    inserted += settings.length;
    if (inserted > 0) {
      await tx.insert(s.auditLog).values({
        orgId: null,
        actorType: "system",
        client: "job",
        action: "platform.seed",
        targetType: "platform",
        targetId: "seed",
        diff: { models: models.length, routes: routes.length, prices: prices.length, settings: settings.length },
      });
    }
    return inserted;
  });
}

export interface MigrateOptions {
  /**
   * PEM of the CA that signed the server certificate (Supabase's CA, from the dashboard). When set,
   * the connection uses TLS and verifies the certificate against it. Leave sslmode out of the URL
   * then, because node-postgres lets URL parameters replace this setting.
   */
  ca?: string;
}

/** `pnpm db:migrate`: migrations, then the platform seed, on DATABASE_URL (the migrating role). */
export async function migrateDatabase(
  connectionString: string,
  options: MigrateOptions = {},
): Promise<{ migrations: number; seeded: number }> {
  const ssl = options.ca === undefined ? undefined : { ca: options.ca, rejectUnauthorized: true };
  const pool = new pg.Pool({ connectionString, max: 1, ...(ssl === undefined ? {} : { ssl }) });
  try {
    const db: DrizzleDb = drizzle(pool, { schema: s, casing: "snake_case" });
    const migrations = await migrateDrizzle(db);
    const seeded = await seedPlatformRows(db);
    return { migrations, seeded };
  } finally {
    await pool.end();
  }
}
