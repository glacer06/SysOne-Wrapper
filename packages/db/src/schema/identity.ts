// Identity and tenancy tables (data-model.md, Identity and tenancy; ADR-002).
//
// users, sessions, accounts, verification_tokens and two_factors follow Better Auth's Drizzle
// adapter with uuid ids and the admin and two-factor plugin fields. They are auth tables: no tenant
// RLS. The Phase 2 wiring pins the Better Auth minor and reviews this mapping against its schema.
// organizations, memberships and invitations are the organization plugin's tables under our names.

import { sql } from "drizzle-orm";
import { boolean, index, integer, pgTable, text, unique, uuid } from "drizzle-orm/pg-core";

import { createdAt, json, pk, textArray, textEnum, ts } from "./columns.js";
import { E } from "./enums.js";

export const users = pgTable("users", {
  id: pk(),
  name: text().notNull(),
  email: text().notNull().unique("users_email_key"),
  emailVerified: boolean().notNull().default(false),
  image: text(),
  /** Ours: null or superadmin. */
  platformRole: textEnum(E.platformRole),
  // Better Auth admin plugin.
  role: text(),
  banned: boolean().notNull().default(false),
  banReason: text(),
  banExpires: ts(),
  // Better Auth two-factor plugin.
  twoFactorEnabled: boolean().notNull().default(false),
  createdAt: createdAt(),
  updatedAt: createdAt(),
});

export const sessions = pgTable(
  "sessions",
  {
    id: pk(),
    token: text().notNull().unique("sessions_token_key"),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: ts().notNull(),
    ipAddress: text(),
    userAgent: text(),
    /** Better Auth admin plugin: the superadmin running an impersonation. */
    impersonatedBy: uuid(),
    /** Only decides where a user lands after sign-in; the URL picks the org per request (ADR-002). */
    activeOrganizationId: uuid(),
    createdAt: createdAt(),
    updatedAt: createdAt(),
  },
  (t) => [index("sessions_user_id_idx").on(t.userId)],
);

export const accounts = pgTable(
  "accounts",
  {
    id: pk(),
    accountId: text().notNull(),
    providerId: text().notNull(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accessToken: text(),
    refreshToken: text(),
    idToken: text(),
    accessTokenExpiresAt: ts(),
    refreshTokenExpiresAt: ts(),
    scope: text(),
    password: text(),
    createdAt: createdAt(),
    updatedAt: createdAt(),
  },
  (t) => [index("accounts_user_id_idx").on(t.userId)],
);

export const verificationTokens = pgTable("verification_tokens", {
  id: pk(),
  identifier: text().notNull(),
  value: text().notNull(),
  expiresAt: ts().notNull(),
  createdAt: createdAt(),
  updatedAt: createdAt(),
});

export const twoFactors = pgTable("two_factors", {
  id: pk(),
  secret: text().notNull(),
  backupCodes: text().notNull(),
  userId: uuid()
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
});

/** Device flow (RFC 8628). No tenant RLS: only the /api/v1/auth/device/* handlers read it. */
export const deviceCodes = pgTable("device_codes", {
  id: pk(),
  deviceCodeHash: text().notNull().unique("device_codes_device_code_hash_key"),
  userCode: text().notNull().unique("device_codes_user_code_key"),
  client: textEnum(E.deviceClient).notNull(),
  requestedScopes: textArray(),
  orgId: uuid(),
  userId: uuid(),
  status: textEnum(E.deviceCodeStatus).notNull().default("pending"),
  expiresAt: ts().notNull(),
  createdAt: createdAt(),
});

/** The tenant itself. RLS matches `id` against app.org_id. */
export const organizations = pgTable("organizations", {
  id: pk(),
  slug: text().notNull().unique("organizations_slug_key"),
  name: text().notNull(),
  status: textEnum(E.orgStatus).notNull().default("active"),
  keyMode: textEnum(E.keyMode).notNull().default("byo"),
  defaultSystemOneProvider: textEnum(E.provider).notNull().default("typesafe"),
  stateRetentionDays: integer().notNull().default(30),
  answersRetentionDays: integer().notNull().default(180),
  /** Null means the state retention. */
  datasetRetentionDays: integer(),
  piiMode: textEnum(E.piiMode).notNull().default("off"),
  /** agentApprovals, allowPreviewModels, reviewerHourlyRateUsd. */
  settings: json<Record<string, unknown>>()
    .notNull()
    .default(sql`'{}'::jsonb`),
  createdAt: createdAt(),
});

export const memberships = pgTable(
  "memberships",
  {
    id: pk(),
    orgId: uuid()
      .notNull()
      .references(() => organizations.id),
    userId: uuid()
      .notNull()
      .references(() => users.id),
    role: textEnum(E.role).notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    unique("memberships_org_id_id_key").on(t.orgId, t.id),
    unique("memberships_org_id_user_id_key").on(t.orgId, t.userId),
    index("memberships_user_id_idx").on(t.userId),
  ],
);

export const invitations = pgTable(
  "invitations",
  {
    id: pk(),
    orgId: uuid()
      .notNull()
      .references(() => organizations.id),
    email: text().notNull(),
    role: textEnum(E.role).notNull(),
    tokenHash: text().notNull().unique("invitations_token_hash_key"),
    invitedByUserId: uuid(),
    invitedByTokenId: uuid(),
    expiresAt: ts().notNull(),
    acceptedAt: ts(),
    createdAt: createdAt(),
  },
  (t) => [unique("invitations_org_id_id_key").on(t.orgId, t.id)],
);
