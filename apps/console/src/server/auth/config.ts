// The console's auth library setup (ADR-002): email and password plus TOTP two-factor, sessions in
// our sessions table, sign-up closed.
//
// The library's HTTP handler is not mounted. Pages call it through Server Actions (auth.api), so
// only the flows below exist: no sign-up, no social or magic links, no account changes from the
// browser. Next checks the Origin of every Server Action; our actions add the rate limits and the
// one generic error (sign-in.ts).

import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { twoFactor } from "better-auth/plugins/two-factor";

import { authStore, type BandwiseDb } from "@bandwise/db";
import { createSessionTokenHasher } from "@bandwise/tenancy";

import { bandwiseAuthAdapter } from "./adapter";
import { mayHoldConsoleSession } from "./session";

export const MIN_PASSWORD_LENGTH = 12;
export const MAX_PASSWORD_LENGTH = 128;
export const SESSION_DAYS = 7;
/** A platform-script reset link lasts a day; the person may be asleep when it is made. */
export const RESET_LINK_SECONDS = 24 * 60 * 60;
export const TOTP_ISSUER = "Bandwise";

export interface ConsoleAuthOptions {
  db: BandwiseDb;
  /** AUTH_SECRET. Signs cookies, keys the session token hashes, and encrypts TOTP secrets and backup codes. */
  secret: string;
  /** BETTER_AUTH_URL, the console origin, for example https://app.bandwise.dev. */
  baseURL: string;
  /** BANDWISE_CONSOLE_EMAILS, lowercased. Null: membership alone decides. */
  allowedEmails: readonly string[] | null;
  /** Receives the reset token. Only the platform script sets it; the console sends no email. */
  onResetToken?: (token: string, email: string) => Promise<void>;
  /** Server Actions set cookies through next/headers. Off in tests, which read Set-Cookie. */
  nextCookies?: boolean;
}

/** Writes only the level and the library's fixed message, never the arguments, which can hold state. */
function quietLog(level: string, message: string) {
  if (level === "error") process.stderr.write(`auth: ${level}: ${message.slice(0, 200)}\n`);
}

export function createConsoleAuth(opts: ConsoleAuthOptions) {
  const secure = opts.baseURL.startsWith("https://");
  return betterAuth({
    appName: TOTP_ISSUER,
    baseURL: opts.baseURL,
    basePath: "/api/auth",
    secret: opts.secret,
    trustedOrigins: [opts.baseURL],
    // Session tokens are stored as an HMAC under a key derived from the secret (adapter.ts).
    database: bandwiseAuthAdapter(authStore(opts.db), { hashSessionToken: createSessionTokenHasher(opts.secret) }),
    telemetry: { enabled: false },
    logger: { level: "error", log: quietLog },
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      autoSignIn: false,
      minPasswordLength: MIN_PASSWORD_LENGTH,
      maxPasswordLength: MAX_PASSWORD_LENGTH,
      resetPasswordTokenExpiresIn: RESET_LINK_SECONDS,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, token }) => {
        await opts.onResetToken?.(token, user.email);
      },
    },
    user: {
      modelName: "users",
      additionalFields: {
        platformRole: { type: "string", required: false, input: false },
      },
    },
    session: {
      modelName: "sessions",
      expiresIn: SESSION_DAYS * 24 * 60 * 60,
      updateAge: 24 * 60 * 60,
    },
    account: {
      modelName: "accounts",
      accountLinking: { enabled: false },
    },
    // Reset tokens and two-factor challenge ids are stored hashed, so a database read cannot use them.
    verification: { modelName: "verificationTokens", storeIdentifier: "hashed" },
    advanced: {
      useSecureCookies: secure,
      cookiePrefix: "bandwise",
      defaultCookieAttributes: { httpOnly: true, secure, sameSite: "lax", path: "/" },
      database: { generateId: "uuid" },
    },
    databaseHooks: {
      session: {
        create: {
          // Every session, including the one a TOTP code completes, needs console access.
          before: async (session) => ((await mayHoldConsoleSession(opts.db, session.userId, opts.allowedEmails)) ? undefined : false),
        },
      },
    },
    plugins: [
      twoFactor({
        issuer: TOTP_ISSUER,
        twoFactorTable: "twoFactors",
        skipVerificationOnEnable: false,
        accountLockout: { enabled: true, maxFailedAttempts: 10, durationSeconds: 15 * 60 },
      }),
      // Must stay last (the library checks).
      ...(opts.nextCookies === true ? [nextCookies()] : []),
    ],
  });
}

export type ConsoleAuth = ReturnType<typeof createConsoleAuth>;

/** BANDWISE_CONSOLE_EMAILS as a lowercased list, or null when unset or empty. */
export function parseAllowedEmails(raw: string | undefined): string[] | null {
  const list = (raw ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s !== "");
  return list.length === 0 ? null : list;
}
