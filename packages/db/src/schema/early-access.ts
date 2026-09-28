// Early-access signups (ADR-018). A platform table with no org_id. Only the bandwise_platform role
// reads or writes it. The console's public route adds rows through bandwise_early_access_submit()
// (migration 0004), which runs as that role, so the app role can add a signup but never read the
// list back.

import { sql } from "drizzle-orm";
import { check, index, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";

import { createdAt, pk, ts } from "./columns.js";

export const earlyAccessSignups = pgTable(
  "early_access_signups",
  {
    id: pk(),
    email: text().notNull(),
    name: text(),
    company: text(),
    role: text(),
    useCase: text(),
    sourcePage: text(),
    /** HMAC-SHA256 of the client IP. Used only for rate limits and abuse checks. */
    ipHash: text().notNull(),
    createdAt: createdAt(),
    confirmedAt: ts(),
    unsubscribedAt: ts(),
  },
  (t) => [
    uniqueIndex("early_access_signups_email_key").on(sql`lower(${t.email})`),
    index("early_access_signups_ip_hash_created_at_idx").on(t.ipHash, t.createdAt),
    index("early_access_signups_created_at_idx").on(t.createdAt),
    check("early_access_signups_email_check", sql`length(${t.email}) between 3 and 254 and position('@' in ${t.email}) > 1`),
    check(
      "early_access_signups_lengths_check",
      sql`coalesce(length(${t.name}), 0) <= 100 and coalesce(length(${t.company}), 0) <= 120 and coalesce(length(${t.role}), 0) <= 80 and coalesce(length(${t.useCase}), 0) <= 1000 and coalesce(length(${t.sourcePage}), 0) <= 200 and length(${t.ipHash}) = 64`,
    ),
  ],
);
