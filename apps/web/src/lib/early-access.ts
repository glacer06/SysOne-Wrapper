// The early-access form contract (ADR-018): the request body the console's public route accepts,
// client-side checks that mirror its limits, and how each response reads to a visitor.

export const LIMITS = {
  email: 254,
  name: 100,
  company: 120,
  role: 80,
  useCase: 1000,
  sourcePage: 200,
} as const;

export interface EarlyAccessFields {
  email: string;
  name: string;
  company: string;
  role: string;
  useCase: string;
  /** The honeypot. People never see it, so it stays empty. */
  website: string;
}

export interface EarlyAccessBody {
  email: string;
  name?: string;
  company?: string;
  role?: string;
  useCase?: string;
  sourcePage?: string;
  website: string;
  elapsedMs: number;
}

export type FieldErrors = Partial<Record<"email" | "name" | "company" | "role" | "useCase", string>>;

// Deliberately loose: one @, something on each side, a dot in the domain, no spaces.
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validate(fields: EarlyAccessFields): FieldErrors {
  const errors: FieldErrors = {};
  const email = fields.email.trim();
  if (email === "") errors.email = "Enter your work email.";
  else if (email.length > LIMITS.email) errors.email = `Use an email under ${LIMITS.email} characters.`;
  else if (!EMAIL_SHAPE.test(email)) errors.email = "That does not look like an email address. Check for a missing @ or dot.";
  if (fields.name.trim().length > LIMITS.name) errors.name = `Keep your name under ${LIMITS.name} characters.`;
  if (fields.company.trim().length > LIMITS.company) errors.company = `Keep the company under ${LIMITS.company} characters.`;
  if (fields.role.trim().length > LIMITS.role) errors.role = `Keep the role under ${LIMITS.role} characters.`;
  if (fields.useCase.trim().length > LIMITS.useCase) errors.useCase = `Keep this under ${LIMITS.useCase} characters.`;
  return errors;
}

/** The JSON body. Optional fields are left out when empty; the honeypot is always sent. */
export function buildBody(fields: EarlyAccessFields, sourcePage: string, elapsedMs: number): EarlyAccessBody {
  const body: EarlyAccessBody = { email: fields.email.trim(), website: fields.website, elapsedMs: Math.max(0, Math.round(elapsedMs)) };
  const optional = { name: fields.name, company: fields.company, role: fields.role, useCase: fields.useCase } as const;
  for (const [key, value] of Object.entries(optional) as Array<[keyof typeof optional, string]>) {
    const v = value.trim();
    if (v !== "") body[key] = v;
  }
  const page = sourcePage.slice(0, LIMITS.sourcePage);
  if (page !== "") body.sourcePage = page;
  return body;
}

export type SubmitOutcome =
  | { kind: "success" }
  | { kind: "invalid"; message: string }
  | { kind: "rate_limited"; retryAfterSeconds: number | null }
  | { kind: "failed" };

/** Read the route's response. Anything not handled on purpose is a generic retry. */
export async function readResponse(res: { status: number; headers: { get(name: string): string | null }; json(): Promise<unknown> }): Promise<SubmitOutcome> {
  if (res.status === 202) return { kind: "success" };
  if (res.status === 429) {
    const header = res.headers.get("Retry-After");
    const seconds = header !== null && /^\d+$/.test(header.trim()) ? Number(header.trim()) : null;
    return { kind: "rate_limited", retryAfterSeconds: seconds };
  }
  if (res.status === 400) {
    try {
      const data = (await res.json()) as { error?: { code?: unknown; message?: unknown } };
      if (data.error?.code === "invalid_request" && typeof data.error.message === "string") {
        return { kind: "invalid", message: data.error.message };
      }
    } catch {
      // Fall through to the generic message.
    }
  }
  return { kind: "failed" };
}

export function retryAfterText(seconds: number | null): string {
  if (seconds === null || seconds <= 0) return "Please wait a few minutes and try again.";
  if (seconds < 90) return `Please try again in about ${seconds} seconds.`;
  const minutes = Math.ceil(seconds / 60);
  return `Please try again in about ${minutes} minutes.`;
}
