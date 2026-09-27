// pnpm db:migrate: applies migrations and the platform seed to DATABASE_URL.
// DATABASE_URL here is the migrating role (the table owner), not the app's login role.
// DATABASE_CA_CERT (optional) is the PEM of the server's CA; see docs/runbooks/database.md.
//
// Output is counts only. Errors are printed with the URL and its password removed, so CI logs
// never carry a connection string.
import { migrateDatabase } from "../src/migrate.js";

const url = process.env["DATABASE_URL"];
if (url === undefined || url === "") {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}
const ca = process.env["DATABASE_CA_CERT"];

function redact(text: string): string {
  let out = text.split(url ?? "").join("[DATABASE_URL]");
  try {
    const password = decodeURIComponent(new URL(url ?? "").password);
    if (password !== "") out = out.split(password).join("[password]");
  } catch {
    // Not a URL we can parse; the whole-string replacement above still applies.
  }
  return out;
}

try {
  const { migrations, seeded } = await migrateDatabase(url, ca === undefined || ca === "" ? {} : { ca });
  console.warn(`applied ${migrations} migration(s), seeded ${seeded} platform row(s)`);
} catch (e) {
  const cause = (e as { cause?: { message?: unknown } }).cause;
  const detail = typeof cause?.message === "string" ? `: ${cause.message}` : "";
  console.error(`migration failed: ${redact(e instanceof Error ? e.message : String(e))}${redact(detail)}`);
  process.exit(1);
}
