// Creates the `internal` org for hosted dogfood and imports `.bandwise/sets/*.json` (ADR-020, D2e).
//
//   pnpm --filter @bandwise/console bootstrap-internal --owner <email> [--member <email>:<role> ...] [--sets <dir>]
//
// Reads DATABASE_URL from the shell. Safe to run again: it only adds what is missing, and it never
// changes a set that already exists. Prints ids and slugs only, one per line, so the output can go
// straight into the mint-token commands in docs/runbooks/hosted-dogfood.md.

import { readdirSync, readFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import { Role } from "@bandwise/core";
import { createDatabase } from "@bandwise/db";

import { type BootstrapMember, bootstrapInternalOrg, BootstrapError, type BootstrapSpecFile } from "../src/server/bootstrap/internal-org";

function fail(message: string): never {
  process.stderr.write(`bootstrap-internal: ${message}\n`);
  process.exit(1);
}

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    owner: { type: "string" },
    member: { type: "string", multiple: true, default: [] },
    sets: { type: "string" },
  },
  strict: true,
});

const members: BootstrapMember[] = [{ email: values.owner ?? fail("--owner <email> is required."), role: "owner" }];
for (const m of values.member) {
  const at = m.lastIndexOf(":");
  const role = Role.safeParse(at < 0 ? "" : m.slice(at + 1));
  if (!role.success) fail("--member is <email>:<role>, with role owner, admin, editor, reviewer or viewer.");
  members.push({ email: m.slice(0, at), role: role.data });
}

const repoRoot = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const dir = values.sets === undefined ? join(repoRoot, ".bandwise", "sets") : resolve(values.sets);
const specs: BootstrapSpecFile[] = readdirSync(dir)
  .filter((f) => f.endsWith(".json"))
  .sort()
  .map((f) => {
    try {
      return { slug: basename(f, ".json"), json: JSON.parse(readFileSync(join(dir, f), "utf8")) as unknown };
    } catch {
      return fail(`${f} is not valid JSON.`);
    }
  });
if (specs.length === 0) fail(`no .json specs in ${dir}.`);

const databaseUrl = process.env["DATABASE_URL"] ?? fail("DATABASE_URL is not set.");
const db = createDatabase({ connectionString: databaseUrl, max: 1 });

try {
  const r = await bootstrapInternalOrg(db, { members, specs, now: new Date() });
  const out = [
    `org ${r.orgId} internal ${r.orgCreated ? "created" : "exists"}`,
    ...r.members.map((m) => `member ${m.userId} ${m.role} ${m.outcome}`),
    `project ${r.projectId}`,
    `goal ${r.goalId}`,
    `app ${r.appId}`,
    ...r.sets.map((s) => `set ${s.setId} ${s.slug} ${s.outcome}`),
    `set_ids ${r.sets.map((s) => s.setId).join(",")}`,
  ];
  process.stdout.write(`${out.join("\n")}\n`);
  for (const s of r.sets) {
    if (s.outcome === "differs") process.stderr.write(`bootstrap-internal: ${s.slug} exists and its production spec differs from the file. Nothing changed; use bandwise spec push and publish.\n`);
  }
} catch (e) {
  // Only our own messages print. A database error can carry row values, so it prints its code only.
  if (e instanceof BootstrapError) fail(e.message);
  const code = (e as { code?: unknown; cause?: { code?: unknown } }).code ?? (e as { cause?: { code?: unknown } }).cause?.code;
  fail(`the bootstrap failed${typeof code === "string" ? ` with code ${code}` : ""}. Nothing was written.`);
} finally {
  await db.close();
}
