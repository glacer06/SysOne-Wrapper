// Envelope encryption for stored secrets (ADR-003). One random 256-bit DEK per row, AES-256-GCM
// with a random 96-bit IV and a 128-bit tag, and additional authenticated data
// `sysone:v1:<table>:<org_id>:<row_id>`, so a ciphertext copied to another org or row fails to
// open instead of returning the wrong secret. Only this module and KeyResolver touch plaintext.

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

import type { KekProvider } from "./kek.js";

/** Tables whose rows hold a sealed secret. */
export type VaultTable = "org_system_one_keys" | "org_webhook_secrets" | "plugin_configs";

/** The envelope columns, base64-encoded, exactly as stored. */
export interface SealedSecret {
  ciphertext: string;
  iv: string;
  authTag: string;
  wrappedDek: string;
  kekId: string;
}

export interface VaultScope {
  orgId: string;
}

export function secretAad(table: VaultTable, orgId: string, rowId: string): Buffer {
  return Buffer.from(`sysone:v1:${table}:${orgId}:${rowId}`, "utf8");
}

/** First 16 hex characters of the key's SHA-256 (ADR-003). Keys the per-org SDK client cache. */
export function keyFingerprint(apiKey: string): string {
  return createHash("sha256").update(apiKey, "utf8").digest("hex").slice(0, 16);
}

/** The last four characters, the only other thing the UI shows. */
export function keyLast4(apiKey: string): string {
  return apiKey.slice(-4);
}

export interface Vault {
  /** Seals a plaintext for one row. The row id must be known before the insert. */
  seal(scope: VaultScope, table: VaultTable, rowId: string, plaintext: string): Promise<SealedSecret>;
  /** Opens a row's secret. Fails when the row was moved to another org, row id or table. */
  open(scope: VaultScope, table: VaultTable, rowId: string, sealed: SealedSecret): Promise<string>;
  /** KEK rotation: the same ciphertext with its DEK wrapped by the active KEK. */
  rewrap(scope: VaultScope, table: VaultTable, sealed: SealedSecret): Promise<SealedSecret>;
}

export function createVault(kek: KekProvider): Vault {
  return {
    async seal(scope, table, rowId, plaintext) {
      const dek = randomBytes(32);
      try {
        const iv = randomBytes(12);
        const cipher = createCipheriv("aes-256-gcm", dek, iv);
        cipher.setAAD(secretAad(table, scope.orgId, rowId));
        const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
        const wrapped = await kek.wrap(dek, { orgId: scope.orgId, table });
        return {
          ciphertext: ciphertext.toString("base64"),
          iv: iv.toString("base64"),
          authTag: cipher.getAuthTag().toString("base64"),
          wrappedDek: wrapped.wrappedDek,
          kekId: wrapped.kekId,
        };
      } finally {
        dek.fill(0);
      }
    },

    async open(scope, table, rowId, sealed) {
      const dek = await kek.unwrap(
        { wrappedDek: sealed.wrappedDek, kekId: sealed.kekId },
        { orgId: scope.orgId, table },
      );
      try {
        const decipher = createDecipheriv("aes-256-gcm", dek, Buffer.from(sealed.iv, "base64"));
        decipher.setAAD(secretAad(table, scope.orgId, rowId));
        decipher.setAuthTag(Buffer.from(sealed.authTag, "base64"));
        return Buffer.concat([
          decipher.update(Buffer.from(sealed.ciphertext, "base64")),
          decipher.final(),
        ]).toString("utf8");
      } finally {
        dek.fill(0);
      }
    },

    async rewrap(scope, table, sealed) {
      if (sealed.kekId === kek.activeKekId) return sealed;
      const dek = await kek.unwrap(
        { wrappedDek: sealed.wrappedDek, kekId: sealed.kekId },
        { orgId: scope.orgId, table },
      );
      try {
        const wrapped = await kek.wrap(dek, { orgId: scope.orgId, table });
        return { ...sealed, wrappedDek: wrapped.wrappedDek, kekId: wrapped.kekId };
      } finally {
        dek.fill(0);
      }
    },
  };
}
