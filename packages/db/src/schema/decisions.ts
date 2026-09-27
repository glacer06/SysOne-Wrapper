// Decision domain (data-model.md, Decision domain). Child rows point at their parent through a
// composite (org_id, parent_id) foreign key, so a row can never hang off another org's parent.

import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  primaryKey,
  real,
  text,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import type {
  GateMargins,
  QuestionSetSpec,
  LabelingPolicy,
  QualityTarget,
  ValueSettings,
} from "@bandwise/core/contracts";

import { createdAt, json, pk, textEnum, ts } from "./columns.js";
import { E } from "./enums.js";
import { organizations } from "./identity.js";

const orgRef = () =>
  uuid()
    .notNull()
    .references(() => organizations.id);

export const projects = pgTable(
  "projects",
  {
    id: pk(),
    orgId: orgRef(),
    name: text().notNull(),
    slug: text().notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    unique("projects_org_id_id_key").on(t.orgId, t.id),
    unique("projects_org_id_slug_key").on(t.orgId, t.slug),
  ],
);

export const goals = pgTable(
  "goals",
  {
    id: pk(),
    orgId: orgRef(),
    projectId: uuid().notNull(),
    title: text().notNull(),
    description: text(),
    qualityTarget: json<QualityTarget>().notNull(),
    businessKpi: text(),
    ownerId: uuid(),
    archivedAt: ts(),
    createdAt: createdAt(),
  },
  (t) => [
    unique("goals_org_id_id_key").on(t.orgId, t.id),
    foreignKey({
      name: "goals_project_fk",
      columns: [t.orgId, t.projectId],
      foreignColumns: [projects.orgId, projects.id],
    }),
  ],
);

export const questionSets = pgTable(
  "question_sets",
  {
    id: pk(),
    orgId: orgRef(),
    projectId: uuid().notNull(),
    goalId: uuid().notNull(),
    slug: text().notNull(),
    name: text().notNull(),
    description: text(),
    protected: boolean().notNull().default(false),
    labeling: json<LabelingPolicy>().notNull(),
    dispatchActionsOnStaging: boolean().notNull().default(false),
    valueSettings: json<ValueSettings>(),
    gateMargins: json<GateMargins>()
      .notNull()
      .default(sql`'{"coverageDrop":0.02,"reviewLoadRise":0.1}'::jsonb`),
    storageMode: textEnum(E.storageMode).notNull().default("full"),
    userGenerated: boolean().notNull().default(false),
    resultCacheTtlSeconds: integer(),
    /** Null: the org's default_system_one_provider (ADR-011). */
    systemOneProvider: textEnum(E.provider),
    /**
     * Set right after the set's first draft row is written. The composite foreign key
     * question_sets_draft_version_fk to question_set_versions (org_id, id) is added in the hand-written
     * tail of migration 0001, because the two tables reference each other.
     */
    draftVersionId: uuid(),
    archivedAt: ts(),
    createdByUserId: uuid(),
    createdByTokenId: uuid(),
    createdAt: createdAt(),
  },
  (t) => [
    unique("question_sets_org_id_id_key").on(t.orgId, t.id),
    unique("question_sets_org_id_slug_key").on(t.orgId, t.slug),
    foreignKey({
      name: "question_sets_project_fk",
      columns: [t.orgId, t.projectId],
      foreignColumns: [projects.orgId, projects.id],
    }),
    foreignKey({
      name: "question_sets_goal_fk",
      columns: [t.orgId, t.goalId],
      foreignColumns: [goals.orgId, goals.id],
    }),
    // ADR-004 caps the result cache TTL at one day.
    check(
      "question_sets_result_cache_ttl_check",
      sql`${t.resultCacheTtlSeconds} is null or (${t.resultCacheTtlSeconds} > 0 and ${t.resultCacheTtlSeconds} <= 86400)`,
    ),
  ],
);

/** Published rows are frozen by the question_set_versions_immutable trigger (migration 0001). */
export const questionSetVersions = pgTable(
  "question_set_versions",
  {
    id: pk(),
    orgId: orgRef(),
    setId: uuid().notNull(),
    version: integer().notNull(),
    status: textEnum(E.versionStatus).notNull().default("draft"),
    spec: json<QuestionSetSpec>().notNull(),
    specHash: text().notNull(),
    interfaceHash: text().notNull(),
    interfaceMajor: integer().notNull(),
    model: text().notNull(),
    changelog: text(),
    source: textEnum(E.versionSource).notNull(),
    sourceRef: text(),
    createdByUserId: uuid(),
    createdByTokenId: uuid(),
    publishedByUserId: uuid(),
    publishedByTokenId: uuid(),
    publishedAt: ts(),
    evalRunId: uuid(),
    createdAt: createdAt(),
  },
  (t) => [
    unique("question_set_versions_org_id_id_key").on(t.orgId, t.id),
    unique("question_set_versions_set_id_version_key").on(t.setId, t.version),
    uniqueIndex("question_set_versions_one_draft_idx")
      .on(t.setId)
      .where(sql`status = 'draft'`),
    foreignKey({
      name: "question_set_versions_set_fk",
      columns: [t.orgId, t.setId],
      foreignColumns: [questionSets.orgId, questionSets.id],
    }),
  ],
);

/** The only place the rollout stage lives. Primary key (set_id, channel). */
export const releasePointers = pgTable(
  "release_pointers",
  {
    orgId: orgRef(),
    setId: uuid().notNull(),
    channel: textEnum(E.pointerChannel).notNull(),
    versionId: uuid().notNull(),
    rolloutStage: textEnum(E.rolloutStage).notNull().default("inactive"),
    activeExperimentId: uuid(),
    updatedAt: createdAt(),
  },
  (t) => [
    primaryKey({ name: "release_pointers_pkey", columns: [t.setId, t.channel] }),
    unique("release_pointers_org_id_set_id_channel_key").on(t.orgId, t.setId, t.channel),
    foreignKey({
      name: "release_pointers_set_fk",
      columns: [t.orgId, t.setId],
      foreignColumns: [questionSets.orgId, questionSets.id],
    }),
    foreignKey({
      name: "release_pointers_version_fk",
      columns: [t.orgId, t.versionId],
      foreignColumns: [questionSetVersions.orgId, questionSetVersions.id],
    }),
  ],
);

export const releaseEvents = pgTable(
  "release_events",
  {
    id: pk(),
    orgId: orgRef(),
    setId: uuid().notNull(),
    channel: textEnum(E.pointerChannel).notNull(),
    fromVersionId: uuid(),
    toVersionId: uuid(),
    kind: textEnum(E.releaseKind).notNull(),
    fromStage: textEnum(E.rolloutStage),
    toStage: textEnum(E.rolloutStage),
    reason: text(),
    actorUserId: uuid(),
    actorTokenId: uuid(),
    approvalId: uuid(),
    at: createdAt(),
  },
  (t) => [
    unique("release_events_org_id_id_key").on(t.orgId, t.id),
    index("release_events_org_id_set_id_at_idx").on(t.orgId, t.setId, t.at),
    foreignKey({
      name: "release_events_set_fk",
      columns: [t.orgId, t.setId],
      foreignColumns: [questionSets.orgId, questionSets.id],
    }),
  ],
);

export const experiments = pgTable(
  "experiments",
  {
    id: pk(),
    orgId: orgRef(),
    setId: uuid().notNull(),
    channel: textEnum(E.pointerChannel).notNull(),
    championVersionId: uuid().notNull(),
    challengerVersionId: uuid().notNull(),
    kind: textEnum(E.experimentKind).notNull(),
    samplePct: real().notNull(),
    minRuns: integer().notNull(),
    minLabeled: integer().notNull(),
    status: textEnum(E.experimentStatus).notNull().default("running"),
    result: json<unknown>(),
    decidedByUserId: uuid(),
    decidedByTokenId: uuid(),
    createdAt: createdAt(),
  },
  (t) => [
    unique("experiments_org_id_id_key").on(t.orgId, t.id),
    uniqueIndex("experiments_one_running_idx")
      .on(t.setId, t.channel)
      .where(sql`status = 'running'`),
    foreignKey({
      name: "experiments_set_fk",
      columns: [t.orgId, t.setId],
      foreignColumns: [questionSets.orgId, questionSets.id],
    }),
    foreignKey({
      name: "experiments_champion_fk",
      columns: [t.orgId, t.championVersionId],
      foreignColumns: [questionSetVersions.orgId, questionSetVersions.id],
    }),
    foreignKey({
      name: "experiments_challenger_fk",
      columns: [t.orgId, t.challengerVersionId],
      foreignColumns: [questionSetVersions.orgId, questionSetVersions.id],
    }),
  ],
);

export const proposals = pgTable(
  "proposals",
  {
    id: pk(),
    orgId: orgRef(),
    setId: uuid().notNull(),
    kind: textEnum(E.proposalKind).notNull(),
    evidence: json<unknown>().notNull(),
    patch: json<unknown>(),
    draftVersionId: uuid(),
    evalRunId: uuid(),
    metricsDelta: json<unknown>(),
    rationale: text().notNull(),
    status: textEnum(E.proposalStatus).notNull().default("open"),
    createdByKind: textEnum(E.proposalCreatedBy).notNull(),
    createdByUserId: uuid(),
    createdByTokenId: uuid(),
    createdAt: createdAt(),
  },
  (t) => [
    unique("proposals_org_id_id_key").on(t.orgId, t.id),
    foreignKey({
      name: "proposals_set_fk",
      columns: [t.orgId, t.setId],
      foreignColumns: [questionSets.orgId, questionSets.id],
    }),
  ],
);
