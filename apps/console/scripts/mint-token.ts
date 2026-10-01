// Mints one app token (sk_live_ or sk_test_) or agent token (sa_live_) for an org, as a platform
// operator, until the console mints them for signed-in people (ADR-020, D2 and D3).
//
//   pnpm mint-token app   --org <uuid> --app <uuid> --scopes run [--sets <uuid,...>] [--test] [--channel staging] [--days <n>]
//   pnpm mint-token agent --org <uuid> --user <uuid> --name <text> --scopes sets:read,sets:write [--role editor] [--sets <uuid,...>] [--days 90]
//
// Reads DATABASE_URL and BANDWISE_TOKEN_PEPPER from the shell. The token prints once, on stdout,
// and nowhere else: store it in the secret manager straight away. The row keeps only its hash.
// Run it from a trusted shell, never from CI logs.

import { parseArgs } from "node:util";

import { Role, Scope } from "@bandwise/core";
import { createDatabase } from "@bandwise/db";
import { tokenHasherFromEnv } from "@bandwise/tenancy";

import { MAX_AGENT_TOKEN_DAYS, mintAgentToken, mintAppToken } from "../src/server/auth/mint";

const DAY_MS = 86_400_000;

function fail(message: string): never {
  process.stderr.write(`mint-token: ${message}\n`);
  process.exit(1);
}

const [kind, ...rest] = process.argv.slice(2);
if (kind !== "app" && kind !== "agent") fail("the first argument is app or agent.");

const { values } = parseArgs({
  args: rest,
  options: {
    org: { type: "string" },
    app: { type: "string" },
    user: { type: "string" },
    name: { type: "string" },
    scopes: { type: "string" },
    sets: { type: "string" },
    role: { type: "string", default: "editor" },
    channel: { type: "string", default: "production" },
    test: { type: "boolean", default: false },
    days: { type: "string" },
  },
  strict: true,
});

const list = (v: string | undefined) => (v === undefined || v === "" ? [] : v.split(",").map((s) => s.trim()));
const scopes = list(values.scopes).map((s) => {
  const parsed = Scope.safeParse(s);
  return parsed.success ? parsed.data : fail(`unknown scope ${s}.`);
});
if (scopes.length === 0) fail("--scopes needs at least one scope.");
const setIds = values.sets === undefined ? null : list(values.sets);
const org = values.org ?? fail("--org is required.");
const databaseUrl = process.env["DATABASE_URL"] ?? fail("DATABASE_URL is not set.");
const hasher = tokenHasherFromEnv(process.env);
const db = createDatabase({ connectionString: databaseUrl, max: 1 });
const now = new Date();

try {
  if (kind === "app") {
    const channel = values.channel === "staging" ? "staging" : values.channel === "production" ? "production" : fail("--channel is production or staging.");
    const days = values.days === undefined ? null : Number(values.days);
    if (days !== null && (!Number.isInteger(days) || days < 1)) fail("--days is a whole number of days.");
    const minted = await mintAppToken(db, hasher, {
      orgId: org,
      appId: values.app ?? fail("--app is required."),
      mode: values.test ? "test" : "live",
      scopes,
      setIds,
      channel,
      expiresAt: days === null ? null : new Date(now.getTime() + days * DAY_MS),
    });
    process.stderr.write(`mint-token: app token ${minted.id} created. It prints once, below.\n`);
    process.stdout.write(`${minted.token}\n`);
  } else {
    const role = Role.safeParse(values.role);
    if (!role.success) fail(`unknown role ${values.role ?? ""}.`);
    const minted = await mintAgentToken(db, hasher, {
      orgId: org,
      userId: values.user ?? fail("--user is required."),
      name: values.name ?? fail("--name is required."),
      scopes,
      roleCeiling: role.data,
      setIds,
      days: values.days === undefined ? MAX_AGENT_TOKEN_DAYS : Number(values.days),
      now,
    });
    process.stderr.write(`mint-token: agent token ${minted.id} created. It prints once, below.\n`);
    process.stdout.write(`${minted.token}\n`);
  }
} catch (e) {
  fail(e instanceof Error ? e.message : String(e));
} finally {
  await db.close();
}
