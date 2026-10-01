// Console sign-in against a real Postgres (PGlite, RLS on, the app role) and the real auth library:
// closed sign-up, the membership gate, one generic error, the attempt limits, TOTP two-factor
// before any console page, and the session to TenantContext resolver.

import { authRepositories, authStore, repos, seedOrgs, type SeededOrg } from "@bandwise/db";
import { createTestDatabase, type TestDatabase } from "@bandwise/db/testing";
import { createSessionTokenHasher } from "@bandwise/tenancy";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createAttemptLimiter } from "./attempts";
import { createConsoleAuth, parseAllowedEmails, type ConsoleAuth } from "./config";
import { dbEnrollmentStore, issueEnrollmentCode } from "./enrollment";
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
      enrollment: dbEnrollmentStore(t.db),
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

const SESSION_COOKIE = "__Secure-bandwise.session_token";

/** Signs a value the way the library signs its session cookie: HMAC-SHA256 under AUTH_SECRET, base64. */
async function signedCookie(value: string): Promise<string> {
  const key = await globalThis.crypto.subtle.importKey("raw", new TextEncoder().encode(SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await globalThis.crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)));
  return encodeURIComponent(`${value}.${btoa(String.fromCharCode(...mac))}`);
}

/** The sessions rows as stored, read past the adapter. */
async function storedSessions(email: string): Promise<Record<string, unknown>[]> {
  const user = await t.db.withNoTenant((tx) => authRepositories.users.getByEmail(tx, email));
  return authStore(t.db).findMany("sessions", { where: [{ field: "userId", value: user?.id ?? "" }] });
}

describe("session tokens at rest", () => {
  const EMAIL = "pj@bandwise.test";
  const hashOf = createSessionTokenHasher(SECRET);

  /** Signs in from a fresh browser and returns it with the raw token inside its cookie. */
  async function signedIn(auth: ConsoleAuth, ip: string): Promise<{ b: Browser; raw: string }> {
    const b = new Browser(ip);
    expect(await signIn({ email: EMAIL, password: PASSWORD }, b.deps(auth))).toEqual({ ok: true, next: "setup" });
    const cookie = b.jar.get(SESSION_COOKIE) ?? "";
    const raw = decodeURIComponent(cookie).split(".")[0] ?? "";
    expect(raw).not.toBe("");
    // Our signing matches the library's, so the forged cookie below is signed correctly too.
    expect(await signedCookie(raw)).toBe(cookie);
    return { b, raw };
  }

  it("stores an HMAC of the token, never the cookie value, and the cookie still signs in", async () => {
    const auth = makeAuth();
    const before = new Set((await storedSessions(EMAIL)).map((r) => r.id));
    const { b, raw } = await signedIn(auth, "10.6.0.1");
    const created = (await storedSessions(EMAIL)).filter((r) => !before.has(r.id));
    expect(created).toHaveLength(1);
    const stored = created[0]?.token as string;
    expect(stored).toMatch(/^[0-9a-f]{64}$/);
    expect(stored).not.toBe(raw);
    expect(stored).toBe(hashOf(raw));
    expect((await auth.api.getSession({ headers: b.headers() }))?.user.email).toBe(EMAIL);
  });

  it("does not sign in with a stored hash copied into a correctly signed cookie", async () => {
    const auth = makeAuth();
    const { raw } = await signedIn(auth, "10.6.1.1");
    const stored = hashOf(raw);
    expect((await storedSessions(EMAIL)).some((r) => r.token === stored)).toBe(true);
    const thief = new Browser("10.6.1.2");
    thief.jar.set(SESSION_COOKIE, await signedCookie(stored));
    expect(await auth.api.getSession({ headers: thief.headers() })).toBeNull();
  });

  it("signs out by the cookie: the stored row goes and the cookie stops working", async () => {
    const auth = makeAuth();
    const { b, raw } = await signedIn(auth, "10.6.2.1");
    const old = b.headers();
    await signOut(b.deps(auth));
    expect((await storedSessions(EMAIL)).some((r) => r.token === hashOf(raw))).toBe(false);
    expect(await auth.api.getSession({ headers: old })).toBeNull();
  });

  it("revokes every session on a password reset", async () => {
    const auth = makeAuth();
    const { b } = await signedIn(auth, "10.6.3.1");
    const old = b.headers();
    expect(await sessionCount(EMAIL)).toBeGreaterThan(0);
    await setPassword(internal, EMAIL);
    expect(await sessionCount(EMAIL)).toBe(0);
    expect(await auth.api.getSession({ headers: old })).toBeNull();
  });

  it("really revokes a session the library listed by user id and then deletes by its token", async () => {
    const auth = makeAuth();
    const { b, raw } = await signedIn(auth, "10.6.5.1");
    const ctx = await auth.$context;
    const user = await t.db.withNoTenant((tx) => authRepositories.users.getByEmail(tx, EMAIL));
    const listed = await ctx.internalAdapter.listSessions(user?.id ?? "");
    const mine = listed.find((s) => s.token === hashOf(raw));
    // A listed row carries only the stored hash, never the cookie value.
    expect(mine).toBeDefined();
    expect(listed.some((s) => s.token === raw)).toBe(false);
    await ctx.internalAdapter.deleteSession(mine?.token ?? "");
    expect((await storedSessions(EMAIL)).some((r) => r.token === hashOf(raw))).toBe(false);
    expect(await auth.api.getSession({ headers: b.headers() })).toBeNull();
  });

  it("keeps the raw token in the cookie when the library refreshes a session", async () => {
    const auth = makeAuth();
    const { b, raw } = await signedIn(auth, "10.6.4.1");
    // Age the session past updateAge, so the next read refreshes it and sets the cookie again.
    const stored = hashOf(raw);
    const aged = new Date(Date.now() + 60 * 60 * 1000);
    await authStore(t.db).update("sessions", [{ field: "token", value: stored }], { expiresAt: aged });
    const res = await auth.api.getSession({ headers: b.headers(), returnHeaders: true });
    expect(res.response?.user.email).toBe(EMAIL);
    const again = res.headers.getSetCookie().find((c) => c.startsWith(`${SESSION_COOKIE}=`)) ?? "";
    expect(again).not.toBe("");
    expect(decodeURIComponent(again.slice(SESSION_COOKIE.length + 1).split(";")[0] ?? "").split(".")[0]).toBe(raw);
    const row = (await storedSessions(EMAIL)).find((r) => r.token === stored);
    expect((row?.expiresAt as Date).getTime()).toBeGreaterThan(aged.getTime());
  });
});

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

    // Setup needs the password again and the enrollment code an admin issued. The password alone,
    // a wrong code, or another person's code all fail.
    const userId = first?.user.id ?? "";
    const pjId = (await t.db.withNoTenant((tx) => authRepositories.users.getByEmail(tx, "pj@bandwise.test")))?.id ?? "";
    expect((await startTotpSetup({ password: PASSWORD, enrollmentCode: "" }, b.deps(auth))).ok).toBe(false);
    const pjCode = await issueEnrollmentCode(t.db, pjId);
    const code = await issueEnrollmentCode(t.db, userId);
    expect((await startTotpSetup({ password: PASSWORD, enrollmentCode: pjCode }, b.deps(auth))).ok).toBe(false);
    expect((await startTotpSetup({ password: PASSWORD, enrollmentCode: "AAAA-AAAA-AAAA-AAAA" }, b.deps(auth))).ok).toBe(false);
    expect((await startTotpSetup({ password: "wrong password, long enough", enrollmentCode: code }, b.deps(auth))).ok).toBe(false);
    // Case and dashes do not matter.
    const started = await startTotpSetup({ password: PASSWORD, enrollmentCode: code.toLowerCase().replace(/-/g, " ") }, b.deps(auth));
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
    // Two-factor is on, so the enrollment code is used up.
    expect(await dbEnrollmentStore(t.db).matches(userId, code)).toBe(false);

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

  it("ends a live session when the email leaves BANDWISE_CONSOLE_EMAILS", async () => {
    const pj = { user: { ...user(internal, "pj@bandwise.test"), twoFactorEnabled: true } };
    expect((await resolveConsoleState(t.db, pj, "req", ["pj@bandwise.test"])).kind).toBe("ready");
    expect((await resolveConsoleState(t.db, pj, "req", ["nick@bandwise.test"])).kind).toBe("no-access");
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
