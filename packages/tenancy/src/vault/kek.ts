// Key encryption keys (ADR-003). BANDWISE_KEK names the KEK:
//   production: aws-kms:<key ARN>             (Phase 2; not implemented here)
//   dev and CI: local:<base64 32 bytes>[,<base64 32 bytes>...]
// With a local KEK the first key is active and the others only unwrap, which lets tests exercise
// rotation. kek_id is `local:` plus the first 8 hex characters of the key's SHA-256.

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/** Bound into every wrap, like the KMS encryption context `{ orgId, table }`. */
export interface EncryptionContext {
  orgId: string;
  table: string;
}

export interface WrappedDek {
  /** base64 of iv (12 bytes), tag (16 bytes) and the wrapped key. */
  wrappedDek: string;
  kekId: string;
}

export interface KekProvider {
  readonly activeKekId: string;
  wrap(dek: Buffer, context: EncryptionContext): Promise<WrappedDek>;
  /** Throws KekUnavailableError when the KEK cannot be reached, and fails on a wrong context. */
  unwrap(wrapped: WrappedDek, context: EncryptionContext): Promise<Buffer>;
}

/** The KEK could not be reached (KMS down, or a kek_id this process does not hold). */
export class KekUnavailableError extends Error {
  override readonly name = "KekUnavailableError";
}

/** BANDWISE_KEK is missing, malformed or not allowed in this environment. */
export class KekConfigError extends Error {
  override readonly name = "KekConfigError";
}

const IV_BYTES = 12;
const TAG_BYTES = 16;

function contextAad(context: EncryptionContext): Buffer {
  return Buffer.from(`bandwise:kek:v1:${context.table}:${context.orgId}`, "utf8");
}

export function localKekId(key: Buffer): string {
  return `local:${createHash("sha256").update(key).digest("hex").slice(0, 8)}`;
}

/** A KEK held in process memory. Dev and CI only. */
export class LocalKekProvider implements KekProvider {
  readonly activeKekId: string;
  readonly #keys: Map<string, Buffer>;

  constructor(keys: readonly Buffer[]) {
    const [active] = keys;
    if (active === undefined) throw new KekConfigError("a local KEK needs at least one key");
    for (const k of keys) {
      if (k.length !== 32) throw new KekConfigError("each local KEK must be 32 bytes");
    }
    this.#keys = new Map(keys.map((k) => [localKekId(k), k]));
    this.activeKekId = localKekId(active);
  }

  async wrap(dek: Buffer, context: EncryptionContext): Promise<WrappedDek> {
    const key = this.#keys.get(this.activeKekId);
    if (key === undefined) throw new KekUnavailableError("active KEK missing");
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    cipher.setAAD(contextAad(context));
    const body = Buffer.concat([cipher.update(dek), cipher.final()]);
    return {
      wrappedDek: Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64"),
      kekId: this.activeKekId,
    };
  }

  async unwrap(wrapped: WrappedDek, context: EncryptionContext): Promise<Buffer> {
    const key = this.#keys.get(wrapped.kekId);
    if (key === undefined) throw new KekUnavailableError(`KEK ${wrapped.kekId} is not configured`);
    const raw = Buffer.from(wrapped.wrappedDek, "base64");
    const iv = raw.subarray(0, IV_BYTES);
    const tag = raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
    const body = raw.subarray(IV_BYTES + TAG_BYTES);
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAAD(contextAad(context));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(body), decipher.final()]);
  }
}

export interface KekEnv {
  BANDWISE_KEK?: string | undefined;
  VERCEL_ENV?: string | undefined;
}

/**
 * Builds the KEK provider from BANDWISE_KEK. Refuses a `local:` KEK when VERCEL_ENV is production.
 * `aws-kms:` lands with the Phase 2 KMS provider.
 */
export function kekFromEnv(env: KekEnv): KekProvider {
  const value = env.BANDWISE_KEK;
  if (value === undefined || value === "") throw new KekConfigError("BANDWISE_KEK is not set");
  if (value.startsWith("local:")) {
    if (env.VERCEL_ENV === "production") {
      throw new KekConfigError("a local: BANDWISE_KEK is not allowed in production");
    }
    const keys = value
      .slice("local:".length)
      .split(",")
      .map((part) => Buffer.from(part.trim(), "base64"));
    return new LocalKekProvider(keys);
  }
  if (value.startsWith("aws-kms:")) {
    throw new KekConfigError("the aws-kms KEK provider lands in Phase 2 (ADR-003)");
  }
  throw new KekConfigError("BANDWISE_KEK must start with local: or aws-kms:");
}
