// pnpm db:migrate: applies migrations and the platform seed to DATABASE_URL.
// DATABASE_URL here is the migrating role (the table owner), not the app's login role.
import { migrateDatabase } from "../src/migrate.js";

const url = process.env["DATABASE_URL"];
if (url === undefined || url === "") {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const { migrations, seeded } = await migrateDatabase(url);
console.warn(`applied ${migrations} migration(s), seeded ${seeded} platform row(s)`);
