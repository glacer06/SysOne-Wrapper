// Console sign-in against a real Postgres (PGlite, RLS on, the app role) and the real auth library:
// closed sign-up, the membership gate, one generic error, the attempt limits, TOTP two-factor
// before any console page, and the session to TenantContext resolver.

import { authRepositories, authStore, repos, seedOrgs, type SeededOrg } from "@bandwise/db";
import { createTestDatabase, type TestDatabase } from "@bandwise/db/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createAttemptLimiter } from "./attempts";
import { createConsoleAuth, parseAllowedEmails, type ConsoleAuth } from "./config";
import { CODE_FAILED, type FlowDeps, resetPassword, SIGN_IN_FAILED, signIn, signOut, startTotpSetup, verifyCode } from "./flows";
import { issueResetToken, provisionConsoleMember } from "./provision";
import { contextForUser, resolveConsoleState } from "./session";

const BASE_URL = "https://app.bandwise.test";
const SECRET = "test-secret-".repeat(4);
const PASSWORD = "correct horse battery staple";

let t: TestDatabase;
let internal: SeededOrg;
let acme: SeededOrg;
const limiter = createAttemptLimiter();

function makeAuth(opts: { allowed?: string[] | null; onResetToken?: (token: string) => Promise<void> } = {}): ConsoleAuth {
  return createConsoleAuth({
    db: t.db,
    secret: SECRET,
    baseURL: BASE_URL,
    allowedEmails: opts.allowed ?? null,
    ...(opts.onResetToken === undefined ? {} : { onResetToken: opts.onResetToken }),
  });
}

/** A browser: keeps the cookies the library sets and sends them back. */
class Browser {
  jar = new Map<string, string>();
  setCookies: string[] = [];
  constructor(readonly ip: string) {}
  headers(): Headers {
    const h = new Headers({ "x-real-ip": this.ip });
    if (this.jar.size > 0) h.set("cookie", [...this.jar].map(([k, v]) => `${k}=${v}`).join("; "));
    return h;
  }
  deps(auth: ConsoleAuth): FlowDeps {
    return {
      auth,
      limiter,
      headers: this.headers(),
      onHeaders: (h) => {
        for (const c of h.getSetCookie()) {
          this.setCookies.push(c);
          const [pair] = c.split(";");
          const eq = (pair ?? "").indexOf("=");
          const name = (pair ?? "").slice(0, eq);
          const value = (pair ?? "").slice(eq + 1);
          if (value === "" || /max-age=0/i.test(c)) this.jar.delete(name);
          else this.jar.set(name, value);
        }
      },
    };
  }
}

function base32(s: string): Uint8Array<ArrayBuffer> {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const c of s.replace(/=+$/, "").toUpperCase()) bits += alphabet.indexOf(c).toString(2).padStart(5, "0");
  const out = new Uint8Array(Math.floor(bits.length / 8));
  for (let i = 0; i < out.length; i++) out[i] = parseInt(bits.slice(i * 8, i * 8 + 8), 2);
  return out;
}

/** RFC 6238 with SHA-1, 6 digits, 30 seconds, through WebCrypto. */
async function totp(uri: string, atMs: number): Promise<string> {
  const secret = new URL(uri).searchParams.get("secret") ?? "";
  const key = await globalThis.crypto.subtle.importKey("raw", base32(secret), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const counter = new ArrayBuffer(8);
  new DataView(counter).setBigUint64(0, BigInt(Math.floor(atMs / 30_000)));
  const mac = new Uint8Array(await globalThis.crypto.subtle.sign("HMAC", key, counter));
  const off = (mac[19] ?? 0) & 0xf;
  const bin = (((mac[off] ?? 0) & 0x7f) << 24) | ((mac[off + 1] ?? 0) << 16) | ((mac[off + 2] ?? 0) << 8) | (mac[off + 3] ?? 0);
  return String(bin % 1_000_000).padStart(6, "0");
}

/** A six-digit code that is valid in no window near now, picked without chance. */
async function wrongCode(uri: string): Promise<string> {
  const now = Date.now();
  const valid = new Set(await Promise.all([-2, -1, 0, 1, 2].map((k) => totp(uri, now + k * 30_000))));
  for (let n = 0; ; n++) {
    const code = String(n).padStart(6, "0");
    if (!valid.has(code)) return code;
  }
}

async function setPassword(org: SeededOrg, email: string) {
  const userId = org.userIds[email] as string;
  const token = await issueResetToken(t.db, (onResetToken) => makeAuth({ onResetToken: (tok) => onResetToken(tok) }), {
    orgId: org.orgId,
    userId,
    email,
  });
  const res = await resetPassword({ token, password: PASSWORD }, new Browser("10.0.0.1").deps(makeAuth()));
  expect(res).toEqual({ ok: true, next: "sign-in" });
}

beforeAll(async () => {
  t = await createTestDatabase();
  [internal, acme] = (await seedOrgs(t.db, [
    {
      slug: "internal",
      name: "Internal",
      members: [
        { email: "nick@bandwise.test", name: "Nick", role: "owner" },
        { email: "pj@bandwise.test", name: "PJ", role: "editor" },
      ],
    },
    { slug: "acme", name: "Acme", members: [{ email: "ada@acme.test", name: "Ada", role: "owner" }] },
  ])) as [SeededOrg, SeededOrg];
  await setPassword(internal, "nick@bandwise.test");
  await setPassword(internal, "pj@bandwise.test");
  // Ada has a password but is not in the internal org.
  await setPassword(acme, "ada@acme.test");
}, 120_000);

afterAll(async () => {
  await t?.close();
});

beforeEach(() => limiter.reset());

async function sessionCount(email: string): Promise<number> {
  const user = await t.db.withNoTenant((tx) => authRepositories.users.getByEmail(tx, email));
  return authStore(t.db).count("sessions", [{ field: "userId", value: user?.id ?? "" }]);
}

describe("auth config", () => {
  it("reads the console email allowlist", () => {
    expect(parseAllowedEmails(undefined)).toBeNull();
    expect(parseAllowedEmails(" , ")).toBeNull();
    expect(parseAllowedEmails("Nick@Bandwise.dev, pj@bandwise.dev")).toEqual(["nick@bandwise.dev", "pj@bandwise.dev"]);
  });

  it("keeps sign-up closed", async () => {
    const auth = makeAuth();
    await expect(
      auth.api.signUpEmail({ body: { email: "new@bandwise.test", password: PASSWORD, name: "New" } }),
    ).rejects.toThrow();
    expect(await t.db.withNoTenant((tx) => authRepositories.users.getByEmail(tx, "new@bandwise.test"))).toBeNull();
  });

  it("sets httpOnly, Secure, SameSite=Lax session cookies on an https origin", async () => {
    const b = new Browser("10.0.1.1");
    expect(await signIn({ email: "pj@bandwise.test", password: PASSWORD }, b.deps(makeAuth()))).toEqual({ ok: true, next: "setup" });
    const session = b.setCookies.find((c) => c.includes("session_token"));
    expect(session).toBeDefined();
    expect(session).toMatch(/^__Secure-bandwise\./);
    expect(session).toMatch(/HttpOnly/i);
    expect(session).toMatch(/Secure/);
    expect(session).toMatch(/SameSite=Lax/i);
  });
});

describe("sign-in", () => {
  it("gives the same error for an unknown email, a wrong password and a non-member", async () => {
    const auth = makeAuth();
    const cases = [
      { email: "nobody@bandwise.test", password: PASSWORD },
      { email: "nick@bandwise.test", password: "wrong password, long enough" },
      { email: "ada@acme.test", password: PASSWORD },
      { email: "not-an-email", password: PASSWORD },
      { email: "nick@bandwise.test", password: "" },
    ];
    for (const c of cases) {
      expect(await signIn(c, new Browser("10.0.2.1").deps(auth))).toEqual({ ok: false, error: SIGN_IN_FAILED });
    }
    // The non-member's right password made no session at all.
    expect(await sessionCount("ada@acme.test")).toBe(0);
  });

  it("refuses a member who is not on the allowlist when one is set", async () => {
    const auth = makeAuth({ allowed: ["nick@bandwise.test"] });
    expect(await signIn({ email: "pj@bandwise.test", password: PASSWORD }, new Browser("10.0.3.1").deps(auth))).toEqual({
      ok: false,
      error: SIGN_IN_FAILED,
    });
    expect(await signIn({ email: "NICK@bandwise.test", password: PASSWORD }, new Browser("10.0.3.1").deps(auth))).toEqual({
      ok: true,
      next: "setup",
    });
  });

  it("limits attempts per email and per IP, with the same error", async () => {
    const auth = makeAuth();
    for (let i = 0; i < 5; i++) {
      await signIn({ email: "pj@bandwise.test", password: "wrong password, long enough" }, new Browser(`10.1.0.${i}`).deps(auth));
    }
    // The right password from a fresh IP is refused once the email is at its limit.
    expect(await signIn({ email: "pj@bandwise.test", password: PASSWORD }, new Browser("10.1.1.1").deps(auth))).toEqual({
      ok: false,
      error: SIGN_IN_FAILED,
    });

    limiter.reset();
    for (let i = 0; i < 20; i++) await signIn({ email: `x${i}@bandwise.test`, password: "nope nope nope" }, new Browser("10.2.0.1").deps(auth));
    expect(await signIn({ email: "pj@bandwise.test", password: PASSWORD }, new Browser("10.2.0.1").deps(auth))).toEqual({
      ok: false,
      error: SIGN_IN_FAILED,
    });
  });
});

describe("two-factor", () => {
  it("is required before any console page, then gates every later sign-in", async () => {
    const auth = makeAuth();
    const b = new Browser("10.3.0.1");
    expect(await signIn({ email: "nick@bandwise.test", password: PASSWORD }, b.deps(auth))).toEqual({ ok: true, next: "setup" });

    // Signed in with a password only: the state is needs-two-factor, never a context.
    const first = await auth.api.getSession({ headers: b.headers() });
    expect((await resolveConsoleState(t.db, first, "req")).kind).toBe("needs-two-factor");

    // Setup needs the password again.
    expect((await startTotpSetup({ password: "wrong password, long enough" }, b.deps(auth))).ok).toBe(false);
    const started = await startTotpSetup({ password: PASSWORD }, b.deps(auth));
    if (!started.ok) throw new Error("setup did not start");
    expect(started.enrollment.backupCodes.length).toBeGreaterThan(0);
    const uri = started.enrollment.totpURI;

    // A wrong code leaves two-factor off.
    expect(await verifyCode({ code: await wrongCode(uri) }, b.deps(auth))).toEqual({ ok: false, error: CODE_FAILED });
    const stillOff = await auth.api.getSession({ headers: b.headers() });
    expect(stillOff?.user.twoFactorEnabled).toBe(false);

    expect(await verifyCode({ code: await totp(uri, Date.now()) }, b.deps(auth))).toEqual({ ok: true, next: "console" });
    const ready = await resolveConsoleState(t.db, await auth.api.getSession({ headers: b.headers() }), "req");
    expect(ready.kind).toBe("ready");

    // The next sign-in stops at the challenge with no session, and a code completes it.
    await signOut(b.deps(auth));
    expect(await auth.api.getSession({ headers: b.headers() })).toBeNull();
    const again = new Browser("10.3.0.2");
    expect(await signIn({ email: "nick@bandwise.test", password: PASSWORD }, again.deps(auth))).toEqual({ ok: true, next: "two-factor" });
    expect(await auth.api.getSession({ headers: again.headers() })).toBeNull();
    expect(await verifyCode({ code: await wrongCode(uri) }, again.deps(auth))).toEqual({ ok: false, error: CODE_FAILED });
    expect(await auth.api.getSession({ headers: again.headers() })).toBeNull();
    expect(await verifyCode({ code: await totp(uri, Date.now()) }, again.deps(auth))).toEqual({ ok: true, next: "console" });
    const session = await auth.api.getSession({ headers: again.headers() });
    expect(session?.user.email).toBe("nick@bandwise.test");

    // A backup code works once.
    const third = new Browser("10.3.0.3");
    await signIn({ email: "nick@bandwise.test", password: PASSWORD }, third.deps(auth));
    const backup = started.enrollment.backupCodes[0] as string;
    expect(await verifyCode({ code: backup, backup: true }, third.deps(auth))).toEqual({ ok: true, next: "console" });
    const fourth = new Browser("10.3.0.4");
    await signIn({ email: "nick@bandwise.test", password: PASSWORD }, fourth.deps(auth));
    expect(await verifyCode({ code: backup, backup: true }, fourth.deps(auth))).toEqual({ ok: false, error: CODE_FAILED });
  });
});

describe("session to TenantContext", () => {
  const user = (org: SeededOrg, email: string) => ({
    id: org.userIds[email] as string,
    email,
    name: email,
    twoFactorEnabled: true,
    platformRole: null,
  });

  it("gives a member a console UserActor context with their role", async () => {
    const c = await contextForUser(t.db, user(internal, "pj@bandwise.test"), "req-7");
    expect(c?.org.slug).toBe("internal");
    expect(c?.ctx).toEqual({
      orgId: internal.orgId,
      actor: { type: "user", userId: internal.userIds["pj@bandwise.test"], role: "editor", platformRole: null, impersonatorId: null },
      client: "console",
      plan: "free",
      requestId: "req-7",
    });
  });

  it("gives a non-member nothing, even with an org of their own", async () => {
    expect(await contextForUser(t.db, user(acme, "ada@acme.test"), "req")).toBeNull();
    const state = await resolveConsoleState(t.db, { user: { ...user(acme, "ada@acme.test") } }, "req");
    expect(state.kind).toBe("no-access");
  });

  it("drops access as soon as the membership is gone", async () => {
    const sys = { orgId: internal.orgId, actor: { type: "system" as const }, client: "job" as const, plan: "internal", requestId: "t" };
    const pj = internal.userIds["pj@bandwise.test"] as string;
    const membership = await t.db.withTenant(sys, (tx) => repos.memberships.getByUser(tx, pj));
    await t.db.withTenant(sys, (tx) => repos.memberships.delete(tx, membership?.id as string));
    expect(await contextForUser(t.db, user(internal, "pj@bandwise.test"), "req")).toBeNull();
    await t.db.withTenant(sys, (tx) => repos.memberships.insert(tx, { userId: pj, role: "editor" }));
  });

  it("signed out is signed out", async () => {
    expect(await resolveConsoleState(t.db, null, "req")).toEqual({ kind: "signed-out" });
  });
});

describe("provisioning", () => {
  it("adds a member once, with an audit row, and keeps an existing role", async () => {
    const first = await provisionConsoleMember(t.db, { orgId: internal.orgId, email: " Sam@Bandwise.test ", name: "Sam", role: "reviewer" });
    expect(first).toMatchObject({ userCreated: true, membershipCreated: true, role: "reviewer" });
    const again = await provisionConsoleMember(t.db, { orgId: internal.orgId, email: "sam@bandwise.test", name: "Sam", role: "owner" });
    expect(again).toMatchObject({ userId: first.userId, userCreated: false, membershipCreated: false, role: "reviewer" });
    const sys = { orgId: internal.orgId, actor: { type: "system" as const }, client: "job" as const, plan: "internal", requestId: "t" };
    const audit = await t.db.withTenant(sys, (tx) => repos.auditLog.findMany(tx, undefined, 200));
    expect(audit.filter((a) => a.action === "member.add" && (a.diff as { userId?: string }).userId === first.userId)).toHaveLength(1);
  });

  it("refuses any org but internal", async () => {
    await expect(provisionConsoleMember(t.db, { orgId: acme.orgId, email: "x@acme.test", name: "X", role: "owner" })).rejects.toThrow(/internal/);
  });

  it("makes a reset link that works once", async () => {
    const userId = internal.userIds["pj@bandwise.test"] as string;
    const token = await issueResetToken(t.db, (on) => makeAuth({ onResetToken: (tok) => on(tok) }), {
      orgId: internal.orgId,
      userId,
      email: "pj@bandwise.test",
    });
    const auth = makeAuth();
    expect(await resetPassword({ token, password: "short" }, new Browser("10.4.0.1").deps(auth))).toMatchObject({ ok: false });
    expect(await resetPassword({ token, password: PASSWORD }, new Browser("10.4.0.1").deps(auth))).toEqual({ ok: true, next: "sign-in" });
    expect(await resetPassword({ token, password: PASSWORD }, new Browser("10.4.0.1").deps(auth))).toMatchObject({ ok: false });
  });
});
