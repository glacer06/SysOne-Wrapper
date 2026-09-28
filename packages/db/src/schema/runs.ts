// Runs, truth and review, datasets and evals, Studio, rollups (data-model.md).
//
// runs is partitioned by month on created_at (migration 0001 turns the drizzle table into a
// partitioned one), so its primary key is (id, created_at). Postgres cannot put a unique
// (org_id, id) on a partitioned table without the partition key, so columns that point at a run
// (review_items.run_id and others) carry no foreign key. The repositories scope them by org_id.

import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  doublePrecision,
  foreignKey,
  index,
  integer,
  pgTable,
  primaryKey,
  real,
  text,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import type { Decision, RunStage, SystemOneAnswer } from "@bandwise/core/contracts";

import { count, createdAt, json, microUsd, pk, textArray, textEnum, ts } from "./columns.js";
import { goals, projects, questionSets, questionSetVersions } from "./decisions.js";
import { E } from "./enums.js";
import { organizations } from "./identity.js";

const orgRef = () =>
  uuid()
    .notNull()
    .references(() => organizations.id);

export const runs = pgTable(
  "runs",
  {
    /** uuidv7 from RunPorts.newId, so no default. */
    id: uuid().notNull(),
    orgId: orgRef(),
    projectId: uuid().notNull(),
    setId: uuid().notNull(),
    versionId: uuid().notNull(),
    channel: textEnum(E.channel).notNull(),
    rollout: textEnum(E.rolloutStage).notNull(),
    experimentId: uuid(),
    arm: textEnum(E.experimentArm),
    source: textEnum(E.runSource).notNull(),
    appId: uuid(),
    actorUserId: uuid(),
    actorTokenId: uuid(),
    keyMode: textEnum(E.keyMode).notNull(),
    systemOneProvider: textEnum(E.provider).notNull().default("typesafe"),
    parentRunId: uuid(),
    modelRequested: text().notNull(),
    modelResolved: text(),
    typesafeRequestId: text(),
    interfaceMajor: integer().notNull(),
    externalRef: text(),
    /** Null for hash-only sets and after state retention. */
    state: json<unknown>(),
    stateHash: text().notNull(),
    stages: json<RunStage[]>().notNull(),
    checks: json<Record<string, boolean>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    /** Nulled by answers retention. */
    answers: json<Record<string, SystemOneAnswer>>(),
    decisions: json<Record<string, Decision>>(),
    runBand: textEnum(E.band).notNull(),
    overallAction: textEnum(E.action).notNull(),
    route: text(),
    warnings: json<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    inputTokens: count().notNull(),
    outputTokens: count().notNull(),
    systemOneCostMicroUsd: microUsd(),
    systemOneCalls: count().notNull(),
    cfInputTokens: count().notNull(),
    cfOutputTokens: count().notNull(),
    counterfactualMicroUsd: microUsd().notNull(),
    counterfactualMode: textEnum(E.counterfactualMode).notNull(),
    comparatorModel: text().notNull(),
    savingsMicroUsd: microUsd().notNull(),
    savingsKind: textEnum(E.savingsKind).notNull(),
    savingsSuppressed: textEnum(E.savingsSuppressed),
    escalationCostMicroUsd: microUsd().notNull(),
    llmCallsMade: count().notNull(),
    llmCallsAvoided: count().notNull(),
    contextTokensPruned: integer(),
    latencyMs: count().notNull(),
    status: textEnum(E.runStatus).notNull(),
    errorCode: text(),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ name: "runs_pkey", columns: [t.id, t.createdAt] }),
    index("runs_org_id_id_idx").on(t.orgId, t.id),
    index("runs_org_id_set_id_created_at_idx").on(t.orgId, t.setId, t.createdAt.desc()),
    index("runs_org_id_source_created_at_idx").on(t.orgId, t.source, t.createdAt),
    index("runs_org_id_external_ref_idx").on(t.orgId, t.externalRef),
    index("runs_org_id_experiment_id_idx").on(t.orgId, t.experimentId),
    // A partitioned index: Postgres builds it on every partition, including ones made later.
    index("runs_org_id_version_id_idx").on(t.orgId, t.versionId),
    foreignKey({
      name: "runs_set_fk",
      columns: [t.orgId, t.setId],
      foreignColumns: [questionSets.orgId, questionSets.id],
    }),
    // Every run belongs to exactly one version of the same org (data-model.md, Invariants).
    foreignKey({
      name: "runs_version_fk",
      columns: [t.orgId, t.versionId],
      foreignColumns: [questionSetVersions.orgId, questionSetVersions.id],
    }),
  ],
);

export const runFeedback = pgTable(
  "run_feedback",
  {
    id: pk(),
    orgId: orgRef(),
    runId: uuid().notNull(),
    decisionId: text(),
    observed: json<unknown>().notNull(),
    source: textEnum(E.feedbackSource).notNull(),
    observedAt: ts().notNull(),
    userId: uuid(),
    tokenId: uuid(),
    reviewItemId: uuid(),
    idempotencyKey: text().notNull(),
    confirmedByUserId: uuid(),
    confirmedAt: ts(),
    createdAt: createdAt(),
  },
  (t) => [
    unique("run_feedback_org_id_id_key").on(t.orgId, t.id),
    unique("run_feedback_org_id_idempotency_key_key").on(t.orgId, t.idempotencyKey),
    index("run_feedback_org_id_run_id_idx").on(t.orgId, t.runId),
  ],
);

export const reviewItems = pgTable(
  "review_items",
  {
    id: pk(),
    orgId: orgRef(),
    /** Null for Studio items. */
    runId: uuid(),
    studioExampleId: uuid(),
    setId: uuid().notNull(),
    decisionId: text().notNull(),
    kind: textEnum(E.reviewKind).notNull(),
    reason: textEnum(E.reviewReason).notNull(),
    sampleRate: doublePrecision(),
    band: textEnum(E.band).notNull(),
    suggested: json<unknown>(),
    status: textEnum(E.reviewStatus).notNull().default("open"),
    assigneeId: uuid(),
    resolution: json<unknown>(),
    resolvedByUserId: uuid(),
    resolvedByTokenId: uuid(),
    resolvedAt: ts(),
    dueAt: ts(),
    addToDataset: boolean().notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [
    unique("review_items_org_id_id_key").on(t.orgId, t.id),
    index("review_items_org_id_run_id_idx").on(t.orgId, t.runId),
    index("review_items_org_id_set_id_status_idx").on(t.orgId, t.setId, t.status, t.createdAt),
    foreignKey({
      name: "review_items_set_fk",
      columns: [t.orgId, t.setId],
      foreignColumns: [questionSets.orgId, questionSets.id],
    }),
  ],
);

export const datasets = pgTable(
  "datasets",
  {
    id: pk(),
    orgId: orgRef(),
    setId: uuid().notNull(),
    name: text().notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    unique("datasets_org_id_id_key").on(t.orgId, t.id),
    unique("datasets_org_id_set_id_name_key").on(t.orgId, t.setId, t.name),
    foreignKey({
      name: "datasets_set_fk",
      columns: [t.orgId, t.setId],
      foreignColumns: [questionSets.orgId, questionSets.id],
    }),
  ],
);

/** `split` never changes after insert (dataset_cases_split_immutable trigger). */
export const datasetCases = pgTable(
  "dataset_cases",
  {
    id: pk(),
    orgId: orgRef(),
    datasetId: uuid().notNull(),
    runId: uuid(),
    versionId: uuid(),
    modelResolved: text(),
    state: json<unknown>().notNull(),
    stateHash: text().notNull(),
    answers: json<unknown>(),
    expected: json<unknown>().notNull(),
    source: textEnum(E.datasetCaseSource).notNull(),
    labelSource: textEnum(E.datasetLabelSource).notNull(),
    labelConfirmedBy: uuid(),
    split: textEnum(E.split).notNull(),
    tags: textArray(),
    createdAt: createdAt(),
  },
  (t) => [
    unique("dataset_cases_org_id_id_key").on(t.orgId, t.id),
    index("dataset_cases_org_id_dataset_id_idx").on(t.orgId, t.datasetId),
    foreignKey({
      name: "dataset_cases_dataset_fk",
      columns: [t.orgId, t.datasetId],
      foreignColumns: [datasets.orgId, datasets.id],
    }).onDelete("cascade"),
  ],
);

/** Immutable: the app role has no UPDATE grant on it. */
export const datasetSnapshots = pgTable(
  "dataset_snapshots",
  {
    id: pk(),
    orgId: orgRef(),
    datasetId: uuid().notNull(),
    caseIds: uuid().array().notNull(),
    snapshotHash: text().notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    unique("dataset_snapshots_org_id_id_key").on(t.orgId, t.id),
    index("dataset_snapshots_org_id_dataset_id_idx").on(t.orgId, t.datasetId),
    foreignKey({
      name: "dataset_snapshots_dataset_fk",
      columns: [t.orgId, t.datasetId],
      foreignColumns: [datasets.orgId, datasets.id],
    }),
  ],
);

export const evalRuns = pgTable(
  "eval_runs",
  {
    id: pk(),
    orgId: orgRef(),
    setId: uuid().notNull(),
    versionId: uuid().notNull(),
    datasetId: uuid().notNull(),
    snapshotId: uuid(),
    model: text().notNull(),
    repeats: integer(),
    jobId: uuid(),
    status: textEnum(E.jobStatus).notNull().default("queued"),
    metrics: json<unknown>(),
    costMicroUsd: microUsd().notNull().default(0),
    createdByUserId: uuid(),
    createdByTokenId: uuid(),
    startedAt: ts(),
    finishedAt: ts(),
  },
  (t) => [
    unique("eval_runs_org_id_id_key").on(t.orgId, t.id),
    index("eval_runs_org_id_version_id_idx").on(t.orgId, t.versionId),
    index("eval_runs_org_id_dataset_id_idx").on(t.orgId, t.datasetId),
    foreignKey({
      name: "eval_runs_version_fk",
      columns: [t.orgId, t.versionId],
      foreignColumns: [questionSetVersions.orgId, questionSetVersions.id],
    }),
    foreignKey({
      name: "eval_runs_dataset_fk",
      columns: [t.orgId, t.datasetId],
      foreignColumns: [datasets.orgId, datasets.id],
    }),
  ],
);

export const evalCaseResults = pgTable(
  "eval_case_results",
  {
    id: pk(),
    orgId: orgRef(),
    evalRunId: uuid().notNull(),
    caseId: uuid().notNull(),
    runId: uuid(),
    perQuestion: json<unknown>().notNull(),
  },
  (t) => [
    unique("eval_case_results_org_id_id_key").on(t.orgId, t.id),
    index("eval_case_results_org_id_eval_run_id_idx").on(t.orgId, t.evalRunId),
    foreignKey({
      name: "eval_case_results_eval_run_fk",
      columns: [t.orgId, t.evalRunId],
      foreignColumns: [evalRuns.orgId, evalRuns.id],
    }).onDelete("cascade"),
  ],
);

export const studioSessions = pgTable(
  "studio_sessions",
  {
    id: pk(),
    orgId: orgRef(),
    goalId: uuid().notNull(),
    setId: uuid(),
    opportunityId: uuid(),
    status: text().notNull(),
    intent: json<unknown>(),
    definition: text(),
    fitTest: json<unknown>(),
    createdByUserId: uuid(),
    createdByTokenId: uuid(),
    createdAt: createdAt(),
  },
  (t) => [
    unique("studio_sessions_org_id_id_key").on(t.orgId, t.id),
    index("studio_sessions_org_id_goal_id_idx").on(t.orgId, t.goalId),
    foreignKey({
      name: "studio_sessions_goal_fk",
      columns: [t.orgId, t.goalId],
      foreignColumns: [goals.orgId, goals.id],
    }),
  ],
);

export const studioExamples = pgTable(
  "studio_examples",
  {
    id: pk(),
    orgId: orgRef(),
    sessionId: uuid().notNull(),
    state: json<unknown>().notNull(),
    label: json<unknown>(),
    reason: text(),
    labelSource: textEnum(E.studioLabelSource).notNull(),
    split: textEnum(E.split).notNull(),
    burnedAt: ts(),
    createdAt: createdAt(),
  },
  (t) => [
    unique("studio_examples_org_id_id_key").on(t.orgId, t.id),
    index("studio_examples_org_id_session_id_idx").on(t.orgId, t.sessionId),
    foreignKey({
      name: "studio_examples_session_fk",
      columns: [t.orgId, t.sessionId],
      foreignColumns: [studioSessions.orgId, studioSessions.id],
    }).onDelete("cascade"),
  ],
);

export const questionDaily = pgTable(
  "question_daily",
  {
    id: pk(),
    orgId: orgRef(),
    day: date({ mode: "string" }).notNull(),
    setId: uuid().notNull(),
    versionId: uuid().notNull(),
    modelResolved: text().notNull(),
    questionId: text().notNull(),
    n: count().notNull().default(0),
    bandHigh: count().notNull().default(0),
    bandMedium: count().notNull().default(0),
    bandLow: count().notNull().default(0),
    answerHist: json<unknown>(),
    meanConfidence: doublePrecision(),
    labeledN: count().notNull().default(0),
    correctN: count().notNull().default(0),
    reviewCreated: count().notNull().default(0),
  },
  (t) => [
    unique("question_daily_org_id_id_key").on(t.orgId, t.id),
    unique("question_daily_key").on(t.orgId, t.day, t.setId, t.versionId, t.modelResolved, t.questionId),
  ],
);

/** savings-model.md, Rollups. */
export const usageDaily = pgTable(
  "usage_daily",
  {
    id: pk(),
    orgId: orgRef(),
    day: date({ mode: "string" }).notNull(),
    projectId: uuid().notNull(),
    setId: uuid().notNull(),
    appId: uuid(),
    versionId: uuid().notNull(),
    modelResolved: text().notNull(),
    systemOneProvider: textEnum(E.provider).notNull(),
    keyMode: textEnum(E.keyMode).notNull(),
    source: textEnum(E.runSource).notNull(),
    savingsKind: textEnum(E.savingsKind).notNull(),
    runs: count().notNull().default(0),
    autoDecisions: count().notNull().default(0),
    bandHigh: count().notNull().default(0),
    bandMedium: count().notNull().default(0),
    bandLow: count().notNull().default(0),
    systemOneInputTokens: microUsd().notNull().default(0),
    systemOneOutputTokens: microUsd().notNull().default(0),
    systemOneCostMicroUsd: microUsd().notNull().default(0),
    cfInputTokens: microUsd().notNull().default(0),
    cfOutputTokens: microUsd().notNull().default(0),
    counterfactualMicroUsd: microUsd().notNull().default(0),
    savingsMicroUsd: microUsd().notNull().default(0),
    suppressedSavingsMicroUsd: microUsd().notNull().default(0),
    llmCallsAvoided: count().notNull().default(0),
    contextTokensPruned: microUsd().notNull().default(0),
    escalationCostMicroUsd: microUsd().notNull().default(0),
    llmCallsMade: count().notNull().default(0),
    experimentCostMicroUsd: microUsd().notNull().default(0),
    reviewCreated: count().notNull().default(0),
    labelCreated: count().notNull().default(0),
    reviewResolved: count().notNull().default(0),
    reviewCostMicroUsd: microUsd().notNull().default(0),
    errorCostEstMicroUsd: microUsd().notNull().default(0),
    p50LatencyMs: real(),
    p95LatencyMs: real(),
  },
  (t) => [
    unique("usage_daily_org_id_id_key").on(t.orgId, t.id),
    unique("usage_daily_key")
      .on(
        t.orgId,
        t.day,
        t.projectId,
        t.setId,
        t.appId,
        t.versionId,
        t.modelResolved,
        t.systemOneProvider,
        t.keyMode,
        t.source,
        t.savingsKind,
      )
      .nullsNotDistinct(),
    index("usage_daily_org_id_project_id_idx").on(t.orgId, t.projectId),
    foreignKey({
      name: "usage_daily_project_fk",
      columns: [t.orgId, t.projectId],
      foreignColumns: [projects.orgId, projects.id],
    }),
  ],
);
