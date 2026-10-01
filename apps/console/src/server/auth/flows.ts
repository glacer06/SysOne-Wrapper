// The console's auth flows, called by Server Actions. Each one is rate limited and fails with one
// generic message, so a reply never says whether an email exists, is a member, or is locked out.
// Library errors are dropped, never echoed or logged, because their text can carry state.

import { z } from "zod";

import { type AttemptLimiter, LIMITS } from "./attempts";
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH, type ConsoleAuth } from "./config";
import type { EnrollmentStore } from "./enrollment";

export const SIGN_IN_FAILED = "Sign-in failed. Check your email and password, or try again in a few minutes.";
export const CODE_FAILED = "That code did not work. Check your authenticator app, or try again in a few minutes.";
export const SETUP_FAILED = "That password or enrollment code did not work. Check both, or ask for a new code.";
export const RESET_FAILED = "The password was not changed. The link may have expired; ask for a new one.";
export const PASSWORD_LENGTH = `Use ${MIN_PASSWORD_LENGTH} to ${MAX_PASSWORD_LENGTH} characters.`;

export interface FlowDeps {
  auth: ConsoleAuth;
  limiter: AttemptLimiter;
  /** Admin-issued enrollment codes (enrollment.ts). Two-factor setup needs one. */
  enrollment: EnrollmentStore;
  /** The request headers: cookies for the library, the client IP for the limits. */
  headers: Headers;
  /**
   * The library's response headers. In Next the nextCookies plugin already sets the cookies;
   * tests read Set-Cookie from here.
   */
  onHeaders?: (headers: Headers) => void;
}

export type FlowResult<T extends string> = { ok: true; next: T } | { ok: false; error: string };

/**
 * Vercel sets x-real-ip and overwrites any value the client sent. x-forwarded-for is not read: a
 * client can set it anywhere Vercel is not in front, which would let it pick its own IP bucket.
 * Without x-real-ip every request shares one bucket, and the per-email limit still applies.
 */
export function clientIp(headers: Headers): string {
  return headers.get("x-real-ip")?.trim() || "unknown";
}

async function sessionUserId(deps: FlowDeps): Promise<string | null> {
  try {
    const session = await deps.auth.api.getSession({ headers: deps.headers });
    return session?.user.id ?? null;
  } catch {
    return null;
  }
}

async function call<T>(deps: FlowDeps, run: () => Promise<{ headers: Headers; response: T }>): Promise<T> {
  const { headers, response } = await run();
  deps.onHeaders?.(headers);
  return response;
}

const SignInInput = z.object({
  email: z.string().trim().toLowerCase().max(254),
  password: z.string().min(1).max(MAX_PASSWORD_LENGTH),
});

/** Email and password. Next: "two-factor" (the TOTP challenge) or "setup" (no two-factor yet). */
export async function signIn(raw: unknown, deps: FlowDeps): Promise<FlowResult<"two-factor" | "setup">> {
  const fail = { ok: false as const, error: SIGN_IN_FAILED };
  const input = SignInInput.safeParse(raw);
  const email = input.success ? input.data.email : "";
  const allowed = await deps.limiter.take([
    { key: `sign-in:ip:${clientIp(deps.headers)}`, limit: LIMITS.signInPerIp },
    { key: `sign-in:email:${email}`, limit: LIMITS.signInPerEmail },
  ]);
  if (!allowed || !input.success) return fail;
  try {
    const res = await call(deps, () =>
      deps.auth.api.signInEmail({
        body: { email: input.data.email, password: input.data.password, rememberMe: true },
        headers: deps.headers,
        returnHeaders: true,
      }),
    );
    return "twoFactorRedirect" in res && res.twoFactorRedirect === true ? { ok: true, next: "two-factor" } : { ok: true, next: "setup" };
  } catch {
    return fail;
  }
}

const Code = z.string().trim().regex(/^\d{6}$/);
const BackupCode = z.string().trim().min(6).max(40);

/**
 * A TOTP code (or a backup code). After the password it completes sign-in; during setup it turns
 * two-factor on for the account.
 */
export async function verifyCode(raw: { code: unknown; backup?: boolean }, deps: FlowDeps): Promise<FlowResult<"console">> {
  const fail = { ok: false as const, error: CODE_FAILED };
  if (!(await deps.limiter.take([{ key: `code:ip:${clientIp(deps.headers)}`, limit: LIMITS.codePerIp }]))) return fail;
  // A session exists only during setup (sign-in completes it after the code). Read it before the
  // check, which can replace the session.
  const setupUserId = await sessionUserId(deps);
  try {
    if (raw.backup === true) {
      const code = BackupCode.safeParse(raw.code);
      if (!code.success) return fail;
      await call(deps, () =>
        deps.auth.api.verifyBackupCode({ body: { code: code.data, trustDevice: false }, headers: deps.headers, returnHeaders: true }),
      );
    } else {
      const code = Code.safeParse(raw.code);
      if (!code.success) return fail;
      await call(deps, () =>
        deps.auth.api.verifyTOTP({ body: { code: code.data, trustDevice: false }, headers: deps.headers, returnHeaders: true }),
      );
    }
    // Two-factor is on: the enrollment code has done its job and cannot be used again.
    if (setupUserId !== null) await deps.enrollment.consume(setupUserId);
    return { ok: true, next: "console" };
  } catch {
    return fail;
  }
}

export interface TotpEnrollment {
  totpURI: string;
  backupCodes: string[];
}

/**
 * Starts TOTP setup for the signed-in user. Needs the password again and the enrollment code an
 * admin issued with the reset link, so a password alone cannot enroll an authenticator.
 */
export async function startTotpSetup(
  raw: { password: unknown; enrollmentCode: unknown },
  deps: FlowDeps,
): Promise<{ ok: true; enrollment: TotpEnrollment } | { ok: false; error: string }> {
  const fail = { ok: false as const, error: SETUP_FAILED };
  if (!(await deps.limiter.take([{ key: `code:ip:${clientIp(deps.headers)}`, limit: LIMITS.codePerIp }]))) return fail;
  const password = z.string().min(1).max(MAX_PASSWORD_LENGTH).safeParse(raw.password);
  const code = z.string().trim().min(8).max(40).safeParse(raw.enrollmentCode);
  if (!password.success || !code.success) return fail;
  const userId = await sessionUserId(deps);
  if (userId === null || !(await deps.enrollment.matches(userId, code.data))) return fail;
  try {
    const res = await call(deps, () =>
      deps.auth.api.enableTwoFactor({ body: { password: password.data }, headers: deps.headers, returnHeaders: true }),
    );
    if (!("totpURI" in res) || typeof res.totpURI !== "string" || !Array.isArray(res.backupCodes)) return fail;
    return { ok: true, enrollment: { totpURI: res.totpURI, backupCodes: res.backupCodes } };
  } catch {
    return fail;
  }
}

const ResetInput = z.object({ token: z.string().min(10).max(200), password: z.string() });

/** Sets a new password from a reset link. Ends every session of the account. */
export async function resetPassword(raw: unknown, deps: FlowDeps): Promise<FlowResult<"sign-in">> {
  const fail = { ok: false as const, error: RESET_FAILED };
  if (!(await deps.limiter.take([{ key: `reset:ip:${clientIp(deps.headers)}`, limit: LIMITS.resetPerIp }]))) return fail;
  const input = ResetInput.safeParse(raw);
  if (!input.success) return fail;
  // Length is about the new password only, so saying so reveals nothing about the account.
  if (input.data.password.length < MIN_PASSWORD_LENGTH || input.data.password.length > MAX_PASSWORD_LENGTH) {
    return { ok: false, error: PASSWORD_LENGTH };
  }
  try {
    await deps.auth.api.resetPassword({ body: { token: input.data.token, newPassword: input.data.password } });
    return { ok: true, next: "sign-in" };
  } catch {
    return fail;
  }
}

export async function signOut(deps: FlowDeps): Promise<void> {
  try {
    await call(deps, () => deps.auth.api.signOut({ headers: deps.headers, returnHeaders: true }));
  } catch {
    // Already signed out, or the session is gone. Either way the page sends them to sign-in.
  }
}
