// Adds a person to the console for the internal org (ADR-020, D3), as a platform operator.
// Sign-up is closed, so this is how Nick and PJ get in.
//
//   pnpm --filter @bandwise/console console-member --org <uuid> --email <email> --name <text> [--role owner] [--out <file>]
//
// Creates the user row (if new) and the internal-org membership (if missing), each with an audit
// row, then writes a one-time password reset link to --out (default ./console-reset-link.txt) with
// mode 0600. Nothing secret prints: hand the file's link to the person over a private channel and
// delete the file. The link lasts 24 hours. They set a password, sign in, and set up two-factor.
//
// Reads DATABASE_URL, AUTH_SECRET and BETTER_AUTH_URL from the shell. Run it from a trusted shell.

import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";

import { Role } from "@bandwise/core";
import { createDatabase } from "@bandwise/db";

import { createConsoleAuth } from "../src/server/auth/config";
import { issueResetToken, provisionConsoleMember } from "../src/server/auth/provision";

function fail(message: string): never {
  process.stderr.write(`console-member: ${message}\n`);
  process.exit(1);
}

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    org: { type: "string" },
    email: { type: "string" },
    name: { type: "string" },
    role: { type: "string", default: "owner" },
    out: { type: "string", default: "console-reset-link.txt" },
  },
  strict: true,
});

const role = Role.safeParse(values.role);
if (!role.success) fail(`unknown role ${values.role ?? ""}.`);
const orgId = values.org ?? fail("--org is required.");
const email = values.email ?? fail("--email is required.");
const name = values.name ?? fail("--name is required.");
const databaseUrl = process.env["DATABASE_URL"] ?? fail("DATABASE_URL is not set.");
const secret = process.env["AUTH_SECRET"] ?? fail("AUTH_SECRET is not set.");
if (secret.length < 32) fail("AUTH_SECRET must be at least 32 characters.");
const baseURL = process.env["BETTER_AUTH_URL"] ?? fail("BETTER_AUTH_URL is not set.");
const out = resolve(values.out);

const db = createDatabase({ connectionString: databaseUrl, max: 1 });

try {
  const member = await provisionConsoleMember(db, { orgId, email, name, role: role.data });
  process.stderr.write(
    `console-member: user ${member.userId} ${member.userCreated ? "created" : "already there"}, ` +
      `membership ${member.membershipCreated ? "created" : "already there"} (role ${member.role}).\n`,
  );
  const token = await issueResetToken(
    db,
    (onResetToken) => createConsoleAuth({ db, secret, baseURL, allowedEmails: null, onResetToken: (t) => onResetToken(t) }),
    { orgId, userId: member.userId, email },
  );
  const link = `${baseURL.replace(/\/$/, "")}/reset-password?token=${encodeURIComponent(token)}`;
  await writeFile(out, `${link}\n`, { mode: 0o600, flag: "w" });
  process.stderr.write(`console-member: reset link written to ${out} (mode 0600). It lasts 24 hours and works once.\n`);
} catch (e) {
  // Our own errors carry no secrets; anything else is reduced to its type.
  fail(e instanceof Error && e.message.length < 200 ? e.message : "failed.");
} finally {
  await db.close();
}
