// Platform tables: no org_id and no tenant RLS (data-model.md, Platform tables). The app role
// reads them; the bandwise_platform role writes them. RunSink is the one app-role writer of
// model_alias_observations, inside the run's transaction.

import { boolean, date, pgTable, primaryKey, text, unique } from "drizzle-orm/pg-core";

import type { ModelLimits, RouteLimits } from "@bandwise/core/contracts";

import { createdAt, json, pk, textArray, textEnum, ts } from "./columns.js";
import { E } from "./enums.js";

/** One row per ModelProfile. */
export const systemOneModels = pgTable("system_one_models", {
  id: text().primaryKey(),
  family: text().notNull(),
  kind: textEnum(E.modelKind).notNull(),
  aliasTarget: text(),
  status: textEnum(E.modelStatus).notNull(),
  releaseDate: date({ mode: "string" }),
  retireAt: date({ mode: "string" }),
  questionTypes: textArray(),
  limits: json<ModelLimits>(),
  inputModalities: textArray(),
  weaknesses: textArray(),
  supersedes: textArray(),
  docsUrl: text().notNull(),
  jaggednessUrl: text(),
  lastReviewed: date({ mode: "string" }).notNull(),
  updatedAt: createdAt(),
});

/** One row per ModelRoute (ADR-011). TypeSafe is the identity route and has no rows. */
export const systemOneModelRoutes = pgTable(
  "system_one_model_routes",
  {
    modelId: text()
      .notNull()
      .references(() => systemOneModels.id),
    provider: textEnum(E.provider).notNull(),
    providerModelId: text().notNull(),
    pinned: boolean().notNull().default(false),
    resolvedIds: textArray(),
    limits: json<RouteLimits>().notNull(),
    docsUrl: text().notNull(),
    lastReviewed: date({ mode: "string" }).notNull(),
  },
  (t) => [primaryKey({ name: "system_one_model_routes_pkey", columns: [t.modelId, t.provider] })],
);

export const modelAliasObservations = pgTable(
  "model_alias_observations",
  {
    id: pk(),
    provider: textEnum(E.provider).notNull(),
    alias: text().notNull(),
    resolvedId: text().notNull(),
    firstSeen: createdAt(),
    lastSeen: createdAt(),
  },
  (t) => [unique("model_alias_observations_key").on(t.provider, t.alias, t.resolvedId)],
);

/** Platform key/value: global RPM budget per model, default comparator, alert thresholds. */
export const settings = pgTable("settings", {
  key: text().primaryKey(),
  value: json<unknown>().notNull(),
  updatedAt: createdAt(),
});

export const stripeWebhookEvents = pgTable("stripe_webhook_events", {
  eventId: text().primaryKey(),
  type: text().notNull(),
  processedAt: ts().notNull().defaultNow(),
});
