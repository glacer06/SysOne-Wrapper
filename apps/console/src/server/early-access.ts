// POST /api/public/early-access (ADR-018). The form on www.bandwise.dev posts here. This module
// holds the whole decision so it can be tested without Next or a database; the route file only
// adapts a Request to it.
//
// What protects the list:
// - CORS and an Origin check: only https://www.bandwise.dev (plus localhost in development).
// - A honeypot field and a minimum fill time. A bot that trips either gets the normal 202 and
//   nothing is stored, so it learns nothing.
// - Rate limits inside the database function (5 new signups per IP hash and 300 in total per
//   hour), which the app role cannot change.
// - An idempotent insert. The response is the same 202 whether or not the email was on the list.
//
// The client IP is stored only as an HMAC with a key derived from AUTH_SECRET (@bandwise/tenancy).

import { hashClientIp } from "@bandwise/tenancy";
import { z } from "zod";

export const EARLY_ACCESS_ORIGINS = ["https://www.bandwise.dev"] as const;
export const DEVELOPMENT_ORIGINS = ["http://localhost:3002"] as const;

/** Largest body we read, in bytes. A full form is well under 2 KB. */
export const MAX_BODY_BYTES = 8 * 1024;
/** Faster than this from form mount to submit is a script, not a person. */
export const MIN_FILL_MS = 1500;
/** The database limits are per rolling hour. */
export const RETRY_AFTER_SECONDS = 3600;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));

export const EarlyAccessRequest = z.object({
  email: z.string().trim().max(254).pipe(z.email()),
  name: optionalText(100),
  company: optionalText(120),
  role: optionalText(80),
  useCase: optionalText(1000),
  sourcePage: z
    .string()
    .trim()
    .max(200)
    .regex(/^\/\S*$/, "must be a path that starts with /")
    .nullish()
    .transform((v) => v ?? null),
  /** Honeypot. People never see it, so it is empty. */
  website: z.string().max(500).optional(),
  /** Milliseconds from form mount to submit. */
  elapsedMs: z.number().finite().nonnegative().optional(),
});
export type EarlyAccessRequest = z.infer<typeof EarlyAccessRequest>;

export interface EarlyAccessSignup {
  email: string;
  name: string | null;
  company: string | null;
  role: string | null;
  useCase: string | null;
  sourcePage: string | null;
  ipHash: string;
}

export interface EarlyAccessDeps {
  /** Stores the signup. Resolves "rate_limited" when a database limit is hit. */
  submit(signup: EarlyAccessSignup): Promise<"accepted" | "rate_limited">;
  /**
   * AUTH_SECRET. The IP hash key is derived from it. Read only when a signup is stored, so a
   * missing secret fails that request with the error envelope, not the build or the preflight.
   */
  getSecret(): string;
  allowedOrigins: readonly string[];
  /** Server-side error log. Never receives the email or the IP. */
  logError(message: string, requestId: string): void;
}

export interface EarlyAccessInput {
  method: string;
  origin: string | null;
  contentType: string | null;
  /** The raw body. Read with readLimitedBody so an oversized body never lands in memory whole. */
  body: string | null;
  bodyTooLarge: boolean;
  clientIp: string | null;
}

export interface HandlerResponse {
  status: number;
  headers: Record<string, string>;
  body: unknown;
}

/** The standard error envelope (api.md, Error envelope). */
function errorBody(code: string, message: string, requestId: string, retryable: boolean, details?: unknown[]) {
  return { error: { code, message, requestId, retryable, ...(details ? { details } : {}) } };
}

/** Vercel sets x-real-ip to the client address and overwrites any value the client sent. */
export function clientIpFrom(headers: Headers): string | null {
  const real = headers.get("x-real-ip")?.trim();
  if (real) return real;
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded ? forwarded : null;
}

export async function handleEarlyAccess(input: EarlyAccessInput, deps: EarlyAccessDeps): Promise<HandlerResponse> {
  const requestId = globalThis.crypto.randomUUID();
  const allowed = input.origin !== null && deps.allowedOrigins.includes(input.origin);
  const headers: Record<string, string> = { "cache-control": "no-store", vary: "Origin" };
  if (allowed && input.origin !== null) {
    headers["access-control-allow-origin"] = input.origin;
    // The form reads Retry-After on a 429 to say how long to wait.
    headers["access-control-expose-headers"] = "Retry-After";
  }

  if (input.method === "OPTIONS") {
    if (!allowed) return { status: 403, headers, body: null };
    return {
      status: 204,
      headers: {
        ...headers,
        "access-control-allow-methods": "POST, OPTIONS",
        "access-control-allow-headers": "content-type",
        "access-control-max-age": "86400",
      },
      body: null,
    };
  }

  if (input.method !== "POST") {
    return { status: 405, headers: { ...headers, allow: "POST, OPTIONS" }, body: errorBody("method_not_allowed", "Use POST.", requestId, false) };
  }
  if (!allowed) {
    return { status: 403, headers, body: errorBody("origin_not_allowed", "This form only accepts requests from www.bandwise.dev.", requestId, false) };
  }
  if (!input.contentType?.toLowerCase().startsWith("application/json")) {
    return { status: 415, headers, body: errorBody("unsupported_media_type", "Send the form as application/json.", requestId, false) };
  }
  if (input.bodyTooLarge) {
    return { status: 413, headers, body: errorBody("payload_too_large", "The form is too large.", requestId, false) };
  }

  let json: unknown;
  try {
    json = JSON.parse(input.body ?? "");
  } catch {
    return { status: 400, headers, body: errorBody("invalid_request", "The body is not valid JSON.", requestId, false) };
  }
  const parsed = EarlyAccessRequest.safeParse(json);
  if (!parsed.success) {
    const details = parsed.error.issues.map((issue) => ({
      path: `/${issue.path.join("/")}`,
      rule: issue.code,
      severity: "error",
      message: issue.path[0] === "email" ? "Enter a valid email address." : issue.message,
    }));
    const message = details[0]?.message ?? "Check the form and try again.";
    return { status: 400, headers, body: errorBody("invalid_request", message, requestId, false, details) };
  }
  const form = parsed.data;

  // Bot checks. A bot gets the same answer a person gets, and nothing is stored.
  if ((form.website ?? "") !== "" || (form.elapsedMs !== undefined && form.elapsedMs < MIN_FILL_MS)) {
    return { status: 202, headers, body: { ok: true } };
  }

  try {
    const outcome = await deps.submit({
      email: form.email,
      name: form.name,
      company: form.company,
      role: form.role,
      useCase: form.useCase,
      sourcePage: form.sourcePage,
      ipHash: hashClientIp(deps.getSecret(), input.clientIp),
    });
    if (outcome === "rate_limited") {
      return {
        status: 429,
        headers: { ...headers, "retry-after": String(RETRY_AFTER_SECONDS) },
        body: errorBody("rate_limited", "Too many signups from this network. Try again in an hour.", requestId, true),
      };
    }
  } catch (err) {
    deps.logError(err instanceof Error ? err.message : "unknown error", requestId);
    return { status: 500, headers, body: errorBody("internal_error", "Something went wrong on our side. Try again in a minute.", requestId, true) };
  }
  return { status: 202, headers, body: { ok: true } };
}

/** Reads at most `limit` bytes. Returns tooLarge instead of the text when the body is bigger. */
export async function readLimitedBody(req: Request, limit = MAX_BODY_BYTES): Promise<{ text: string | null; tooLarge: boolean }> {
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > limit) return { text: null, tooLarge: true };
  if (req.body === null) return { text: "", tooLarge: false };
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      return { text: null, tooLarge: true };
    }
    chunks.push(value);
  }
  return { text: Buffer.concat(chunks).toString("utf8"), tooLarge: false };
}
