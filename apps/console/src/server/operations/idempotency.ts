// Idempotency-Key storage for mutations (management-api.md, Idempotency keys). runOperation claims
// the key in the operation's transaction, before the handler, and stores the response in that same
// transaction, so a commit and its stored response land together. A retry with the same key, from
// the same caller, with the same request replays the stored status and body and runs nothing.

import { hashJson, type OperationId, type TenantContext } from "@bandwise/core";

import { OperationError } from "./errors";

/** Keys live 24 hours. An older row reads as absent, and a new call with that key runs fresh. */
export const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

/** The longest key accepted. A UUID is 36 characters. */
export const MAX_IDEMPOTENCY_KEY_LENGTH = 255;

/** Visible ASCII only, so a key is never a place to hide control characters or other text. */
const KEY_SHAPE = /^[\x21-\x7e]+$/;

/** Refuse a key that is empty, too long or not visible ASCII with 400 invalid_request. */
export function checkIdempotencyKey(key: string): void {
  if (key.length === 0 || key.length > MAX_IDEMPOTENCY_KEY_LENGTH || !KEY_SHAPE.test(key)) {
    throw new OperationError("invalid_request", `Idempotency-Key must be 1 to ${MAX_IDEMPOTENCY_KEY_LENGTH} visible ASCII characters.`);
  }
}

/**
 * Who a key belongs to: the token id for agent and app tokens, the user id for a session. The
 * system actor stores no keys. Keys are also per org, by the table's unique index.
 */
export function idempotencyActorKey(ctx: TenantContext): string | null {
  const a = ctx.actor;
  switch (a.type) {
    case "agent":
      return a.tokenId;
    case "apiKey":
      return a.keyId;
    case "user":
      return a.userId;
    case "system":
      return null;
  }
}

/**
 * What the caller was allowed to do when it used the key: the role and, for tokens, the scopes,
 * set allowlist and channel. A replay runs no handler, so no authorize step checks the caller
 * again. Binding the key to this instead means a caller whose role or token was narrowed since
 * cannot read back a response it got with the wider access: the request no longer matches, and the
 * key is refused as reused.
 */
export function idempotencyGrant(ctx: TenantContext): unknown {
  const a = ctx.actor;
  const sorted = (xs: readonly string[] | null) => (xs === null ? null : [...xs].sort());
  switch (a.type) {
    case "user":
      return { role: a.role, platformRole: a.platformRole, impersonatorId: a.impersonatorId };
    case "agent":
      return { role: a.role, scopes: sorted(a.scopes), setIds: sorted(a.setIds) };
    case "apiKey":
      return { scopes: sorted(a.scopes), setIds: sorted(a.setIds), channel: a.channel, mode: a.mode };
    case "system":
      return null;
  }
}

/**
 * The request a key was first used for: the operation, its validated input and If-Match, and the
 * caller's grant (idempotencyGrant).
 */
export function idempotencyRequestHash(id: OperationId, input: unknown, ifMatch: string | undefined, grant: unknown = null): string {
  return `sha256:${hashJson({ opId: id, input, ifMatch: ifMatch ?? null, grant })}`;
}

/** What the stored `response` column holds for a successful call. */
export interface StoredResponse {
  body: unknown;
  etag?: string;
}

export function isStoredResponse(value: unknown): value is StoredResponse {
  return value !== null && typeof value === "object" && "body" in value;
}
