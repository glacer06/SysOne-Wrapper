// pnpm db:seed [--three]: seeds the two-org set (acme, globex) or, with --three, sgr, personal and
// dallas for the Phase 2 E2E org switch. DATABASE_URL must be the app's login role (a member of
// sysone_app), so the seed writes through withTenant and RLS like the console does.
import { createDatabase, seedOrgs, THREE_ORG_SEED, TWO_ORG_SEED } from "../src/index.js";

const url = process.env["DATABASE_URL"];
if (url === undefined || url === "") {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const db = createDatabase({ connectionString: url, max: 1 });
try {
  const seeds = process.argv.includes("--three") ? THREE_ORG_SEED : TWO_ORG_SEED;
  const orgs = await seedOrgs(db, seeds);
  for (const o of orgs) console.warn(`seeded ${o.slug} (${o.orgId}), set ${o.setSlug}`);
} finally {
  await db.close();
}
