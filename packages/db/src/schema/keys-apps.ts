// Keys, agent tokens and app integration (data-model.md, Keys and agent tokens; Apps and
// integration). Envelope columns follow ADR-003 and are stored base64-encoded.

import { boolean, foreignKey, index, integer, pgTable, text, unique, uuid } from "drizzle-orm/pg-core";


import { createdAt, json, microUsd, pk, textArray, textEnum, ts, uuidArray } from "./columns.js";
import { questionSets } from "./decisions.js";
import { E } from "./enums.js";
import { organizations, users } from "./identity.js";

const orgRef = () =>
  uuid()
    .notNull()
    .references(() => organizations.id);

/** ADR-011: one row per org and provider. */
export const orgSystemOneKeys = pgTable(
  "org_system_one_keys",
  {
    id: pk(),
    orgId: orgRef(),
    provider: textEnum(E.provider).notNull(),
    ciphertext: text().notNull(),
    iv: text().notNull(),
    authTag: text().notNull(),
    wrappedDek: text().notNull(),
    kekId: text().notNull(),
    keyLast4: text().notNull(),
    fingerprint: text().notNull(),
    status: textEnum(E.keyStatus).notNull().default("active"),
    /** Registry ids the key can reach on this provider. */
    models: textArray(),
    createdByUserId: uuid(),
    createdByTokenId: uuid(),
    createdAt: createdAt(),
    rotatedAt: ts(),
  },
  (t) => [
    unique("org_system_one_keys_org_id_id_key").on(t.orgId, t.id),
    unique("org_system_one_keys_org_id_provider_key").on(t.orgId, t.provider),
  ],
);

export const agentTokens = pgTable(
  "agent_tokens",
  {
    id: pk(),
    orgId: orgRef(),
    userId: uuid()
      .notNull()
      .references(() => users.id),
    name: text().notNull(),
    client: textEnum(E.agentClient).notNull(),
    prefix: text().notNull().default("sa_live_"),
    /** sha256 + pepper. */
    hash: text().notNull().unique("agent_tokens_hash_key"),
    scopes: textArray(),
    roleCeiling: textEnum(E.role).notNull(),
    setIds: uuidArray(),
    dailySpendCapMicroUsd: microUsd(),
    expiresAt: ts().notNull(),
    revokedAt: ts(),
    lastUsedAt: ts(),
    createdAt: createdAt(),
  },
  (t) => [
    unique("agent_tokens_org_id_id_key").on(t.orgId, t.id),
    index("agent_tokens_org_id_user_id_idx").on(t.orgId, t.userId),
  ],
);

export const orgWebhookSecrets = pgTable(
  "org_webhook_secrets",
  {
    id: pk(),
    orgId: orgRef(),
    ciphertext: text().notNull(),
    iv: text().notNull(),
    authTag: text().notNull(),
    wrappedDek: text().notNull(),
    kekId: text().notNull(),
    createdAt: createdAt(),
    rotatedAt: ts(),
  },
  (t) => [unique("org_webhook_secrets_org_id_id_key").on(t.orgId, t.id)],
);

export const apps = pgTable(
  "apps",
  {
    id: pk(),
    orgId: orgRef(),
    name: text().notNull(),
    description: text(),
    language: textEnum(E.appLanguage).notNull(),
    framework: text(),
    repoUrl: text(),
    allowedOrigins: textArray(),
    createdAt: createdAt(),
  },
  (t) => [unique("apps_org_id_id_key").on(t.orgId, t.id)],
);

export const appTokens = pgTable(
  "app_tokens",
  {
    id: pk(),
    orgId: orgRef(),
    appId: uuid().notNull(),
    kind: textEnum(E.appTokenKind).notNull(),
    prefix: textEnum(E.appTokenPrefix).notNull(),
    hash: text().notNull().unique("app_tokens_hash_key"),
    channel: textEnum(E.pointerChannel).notNull().default("production"),
    scopes: textArray(),
    setIds: uuidArray(),
    rpmLimit: integer(),
    expiresAt: ts(),
    revokedAt: ts(),
    lastUsedAt: ts(),
    createdByUserId: uuid(),
    createdByTokenId: uuid(),
    createdAt: createdAt(),
  },
  (t) => [
    unique("app_tokens_org_id_id_key").on(t.orgId, t.id),
    foreignKey({ name: "app_tokens_app_fk", columns: [t.orgId, t.appId], foreignColumns: [apps.orgId, apps.id] }),
  ],
);

export const appOpportunities = pgTable(
  "app_opportunities",
  {
    id: pk(),
    orgId: orgRef(),
    appId: uuid().notNull(),
    source: textEnum(E.opportunitySource).notNull(),
    /** { file, lines }. Summaries only, never source code. */
    location: json<unknown>(),
    currentApproach: textEnum(E.currentApproach).notNull(),
    decisionSummary: text().notNull(),
    primitiveGuess: text(),
    pattern: textEnum(E.pattern).notNull(),
    tenSecondFit: boolean().notNull().default(false),
    status: textEnum(E.opportunityStatus).notNull().default("proposed"),
    setId: uuid(),
    createdByUserId: uuid(),
    createdByTokenId: uuid(),
    createdAt: createdAt(),
  },
  (t) => [
    unique("app_opportunities_org_id_id_key").on(t.orgId, t.id),
    foreignKey({
      name: "app_opportunities_app_fk",
      columns: [t.orgId, t.appId],
      foreignColumns: [apps.orgId, apps.id],
    }),
    foreignKey({
      name: "app_opportunities_set_fk",
      columns: [t.orgId, t.setId],
      foreignColumns: [questionSets.orgId, questionSets.id],
    }),
  ],
);

export const appSetBindings = pgTable(
  "app_set_bindings",
  {
    id: pk(),
    orgId: orgRef(),
    appId: uuid().notNull(),
    setId: uuid().notNull(),
    channel: textEnum(E.pointerChannel).notNull(),
    target: textEnum(E.deployTarget).notNull(),
    runtime: textEnum(E.bindingRuntime).notNull(),
    interfaceMajor: integer().notNull(),
    interfaceHash: text().notNull(),
    generatorVersion: text(),
    sourceRef: text(),
    createdByUserId: uuid(),
    createdByTokenId: uuid(),
    createdAt: createdAt(),
    removedAt: ts(),
  },
  (t) => [
    unique("app_set_bindings_org_id_id_key").on(t.orgId, t.id),
    index("app_set_bindings_org_id_set_id_idx").on(t.orgId, t.setId),
    foreignKey({
      name: "app_set_bindings_app_fk",
      columns: [t.orgId, t.appId],
      foreignColumns: [apps.orgId, apps.id],
    }),
    foreignKey({
      name: "app_set_bindings_set_fk",
      columns: [t.orgId, t.setId],
      foreignColumns: [questionSets.orgId, questionSets.id],
    }),
  ],
);
