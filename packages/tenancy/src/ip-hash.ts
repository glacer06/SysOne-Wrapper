// Salted IP hashes for abuse checks (ADR-018, early-access signups). The key is derived from a
// server secret, so a leaked table of hashes cannot be reversed by hashing every IPv4 address
// without that secret, and the secret itself is never used directly as the HMAC key.

import { createHmac } from "node:crypto";

const IP_HASH_LABEL = "bandwise:early-access:ip-hash:v1";

/** 64 hex characters: HMAC-SHA256 of the IP under a key derived from `secret`. */
export function hashClientIp(secret: string, ip: string | null): string {
  const key = createHmac("sha256", secret).update(IP_HASH_LABEL).digest();
  return createHmac("sha256", key)
    .update(ip ?? "unknown")
    .digest("hex");
}
