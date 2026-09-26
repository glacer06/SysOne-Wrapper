// Billing and usage, admin, jobs and events (data-model.md; ADR-006 for usage_events).

import { sql } from "drizzle-orm";
import { boolean, check, index, integer, pgTable, text, unique, uuid } from "drizzle-orm/pg-core";

import type { EventEnvelope } from "@sysone/core/contracts";

import { createdAt, json, microUsd, pk, textArray, textEnum, ts } from "./columns.js";
import { E } from "./enums.js";
import { organizations } from "./identity.js";

const orgRef = () =>
  uuid()
    .notNull()
    .references(() => organizations.id);

export const billingAccounts = pgTable(
  "billing_accounts",
  {
    id: pk(),
    orgId: orgRef().unique("billing_accounts_org_id_key"),
    stripeCustomerId: text(),
    stripeSubscriptionId: text(),
    plan: text().notNull(),
    status: text().notNull(),
    currentPeriodStart: ts(),
    currentPeriodEnd: ts(),
    cancelAt: ts(),
    graceUntil: ts(),
  },
  (t) => [unique("billing_accounts_org_id_id_key").on(t.orgId, t.id)],
);

/** Platform admin only; set_by is a platform admin user. */
export const entitlementOverrides = pgTable(
  "entitlement_overrides",
  {
    id: pk(),
    orgId: orgRef(),
    key: text().notNull(),
    value: json<unknown>().notNull(),
    reason: text().notNull(),
    setBy: uuid().notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    unique("entitlement_overrides_org_id_id_key").on(t.orgId, t.id),
    unique("entitlement_overrides_org_id_key_key").on(t.orgId, t.key),
  ],
);

/**
 * The meter outbox (ADR-006): kinds run, eval_run, system_one_cost and llm_cost. Exactly one of
 * run_id and job_id is set. Written by RunSink in the run's transaction.
 */
export const usageEvents = pgTable(
  "usage_events",
  {
    id: pk(),
    orgId: orgRef(),
    runId: uuid(),
    jobId: uuid(),
    kind: textEnum(E.usageKind).notNull(),
    /** The resolved model. */
    model: text().notNull(),
    provider: textEnum(E.provider).notNull(),
    quantity: microUsd().notNull(),
    keyMode: textEnum(E.keyMode).notNull(),
    pushStatus: textEnum(E.pushStatus).notNull().default("pending"),
    reportedToStripeAt: ts(),
    createdAt: createdAt(),
  },
  (t) => [
    unique("usage_events_org_id_id_key").on(t.orgId, t.id),
    index("usage_events_org_id_run_id_idx").on(t.orgId, t.runId),
    index("usage_events_org_id_push_status_idx").on(t.orgId, t.pushStatus, t.createdAt),
    check("usage_events_one_source_check", sql`(${t.runId} is null) <> (${t.jobId} is null)`),
  ],
);

/**
 * Hybrid table: platform rows have org_id null. Read policy allows null or the caller's org; org
 * rows are written by the org, platform rows only by the sysone_platform role.
 */
export const priceBooks = pgTable(
  "price_books",
  {
    id: pk(),
    orgId: uuid().references(() => organizations.id),
    model: text().notNull(),
    /** Null: the price holds on every provider (ADR-011). */
    provider: textEnum(E.provider),
    displayName: text(),
    inputPerMtokMicroUsd: microUsd().notNull(),
    outputPerMtokMicroUsd: microUsd().notNull(),
    updatedByUserId: uuid(),
    updatedByTokenId: uuid(),
    updatedAt: createdAt(),
  },
  (t) => [
    unique("price_books_org_id_id_key").on(t.orgId, t.id),
    unique("price_books_org_id_model_provider_key").on(t.orgId, t.model, t.provider).nullsNotDistinct(),
  ],
);

/** Append-only: the app role has SELECT and INSERT only. org_id null is a platform event. */
export const auditLog = pgTable(
  "audit_log",
  {
    id: pk(),
    orgId: uuid().references(() => organizations.id),
    actorType: textEnum(E.actorType).notNull(),
    client: textEnum(E.client).notNull(),
    actorUserId: uuid(),
    actorTokenId: uuid(),
    actorRole: textEnum(E.role),
    approvalId: uuid(),
    impersonatorId: uuid(),
    /** The operation id, noun.verb. */
    action: text().notNull(),
    targetType: text().notNull(),
    targetId: text().notNull(),
    diff: json<unknown>(),
    ip: text(),
    userAgent: text(),
    createdAt: createdAt(),
  },
  (t) => [
    unique("audit_log_org_id_id_key").on(t.orgId, t.id),
    index("audit_log_org_id_created_at_idx").on(t.orgId, t.createdAt),
  ],
);

export const approvalRequests = pgTable(
  "approval_requests",
  {
    id: pk(),
    orgId: orgRef(),
    opId: text().notNull(),
    input: json<unknown>().notNull(),
    inputHash: text().notNull(),
    /** The If-Match value the agent sent, re-checked when the approved request runs. */
    ifMatch: text(),
    requestedByTokenId: uuid().notNull(),
    requestedByUserId: uuid().notNull(),
    reason: text().notNull(),
    status: textEnum(E.approvalStatus).notNull().default("pending"),
    decidedByUserId: uuid(),
    decidedAt: ts(),
    expiresAt: ts().notNull(),
    result: json<unknown>(),
    createdAt: createdAt(),
  },
  (t) => [
    unique("approval_requests_org_id_id_key").on(t.orgId, t.id),
    index("approval_requests_org_id_status_idx").on(t.orgId, t.status, t.createdAt),
  ],
);

export const idempotencyKeys = pgTable(
  "idempotency_keys",
  {
    id: pk(),
    orgId: orgRef(),
    actorKey: text().notNull(),
    key: text().notNull(),
    opId: text().notNull(),
    requestHash: text().notNull(),
    responseStatus: integer().notNull(),
    response: json<unknown>(),
    createdAt: createdAt(),
  },
  (t) => [
    unique("idempotency_keys_org_id_id_key").on(t.orgId, t.id),
    unique("idempotency_keys_org_id_actor_key_key_key").on(t.orgId, t.actorKey, t.key),
  ],
);

export const jobs = pgTable(
  "jobs",
  {
    id: pk(),
    orgId: orgRef(),
    kind: text().notNull(),
    status: textEnum(E.jobStatus).notNull().default("queued"),
    input: json<unknown>(),
    result: json<unknown>(),
    error: json<unknown>(),
    createdByUserId: uuid(),
    createdByTokenId: uuid(),
    createdAt: createdAt(),
    finishedAt: ts(),
  },
  (t) => [
    unique("jobs_org_id_id_key").on(t.orgId, t.id),
    index("jobs_org_id_status_idx").on(t.orgId, t.status, t.createdAt),
  ],
);

/** The event feed (events.md). id is a uuidv7 and the feed cursor. org_id null is platform-only. */
export const events = pgTable(
  "events",
  {
    id: uuid().primaryKey(),
    orgId: uuid().references(() => organizations.id),
    type: text().notNull(),
    occurredAt: createdAt(),
    actor: json<EventEnvelope["actor"]>().notNull(),
    subjectType: text().notNull(),
    subjectId: text().notNull(),
    data: json<unknown>(),
  },
  (t) => [unique("events_org_id_id_key").on(t.orgId, t.id)],
);

export const webhookEndpoints = pgTable(
  "webhook_endpoints",
  {
    id: pk(),
    orgId: orgRef(),
    url: text().notNull(),
    types: textArray(),
    enabled: boolean().notNull().default(true),
    createdByUserId: uuid(),
    createdByTokenId: uuid(),
    createdAt: createdAt(),
  },
  (t) => [unique("webhook_endpoints_org_id_id_key").on(t.orgId, t.id)],
);

/** ADR-003 leaves the envelope layout of config_ciphertext to Phase 5. */
export const pluginConfigs = pgTable(
  "plugin_configs",
  {
    id: pk(),
    orgId: orgRef(),
    pluginId: text().notNull(),
    version: text().notNull(),
    enabled: boolean().notNull().default(false),
    configCiphertext: text(),
    createdAt: createdAt(),
  },
  (t) => [
    unique("plugin_configs_org_id_id_key").on(t.orgId, t.id),
    unique("plugin_configs_org_id_plugin_id_key").on(t.orgId, t.pluginId),
  ],
);
