// One repository per table (data-model.md). Tenant repositories take a TenantTx and are
// org-scoped twice: by their own filter and by RLS. The cross-tenant suite
// (src/cross-tenant.test.ts) is generated from TENANT_REPOSITORY_NAMES and fails when a tenant
// repository or method has no coverage.

import { and, asc, desc, eq, getTableColumns, gt, gte, inArray, type InferInsertModel, type InferSelectModel, isNull, lt, lte, ne, not, or, type SQL, sql } from "drizzle-orm";

import type { Action, Band, Channel, ModelPrice, Page, PageReq, PointerChannel, ReviewItemKind, ReviewItemStatus, RunRecordSource, RunStatus, SystemOneProvider } from "@bandwise/core/contracts";

import { type AnyTx, drizzleOf, type TenantTx, type UserTx } from "../internal/drizzle.js";
import * as s from "../schema/index.js";

import { appendOnlyRepo, clampLimit, globalRepo, type IdTable, pageBy, type RepoOptions, tenantRepo } from "./base.js";

function organizationsRepo(opts: RepoOptions) {
  type Row = InferSelectModel<typeof s.organizations>;
  type Insert = Omit<InferInsertModel<typeof s.organizations>, "id">;
  const t = s.organizations;
  const scope = (tx: TenantTx) => (opts.orgFilter ? eq(t.id, tx.orgId) : undefined);
  return {
    table: "organizations",
    /** The org of this transaction. */
    async current(tx: TenantTx): Promise<Row | null> {
      const rows = await drizzleOf(tx).select().from(t).where(scope(tx)).limit(1);
      return rows[0] ?? null;
    },
    async get(tx: TenantTx, id: string): Promise<Row | null> {
      const rows = await drizzleOf(tx)
        .select()
        .from(t)
        .where(and(scope(tx), eq(t.id, id)))
        .limit(1);
      return rows[0] ?? null;
    },
    async list(tx: TenantTx, page: PageReq): Promise<Page<Row>> {
      return pageBy(
        (where, limit) =>
          drizzleOf(tx)
            .select()
            .from(t)
            .where(and(scope(tx), where))
            .orderBy(asc(t.id))
            .limit(limit),
        t.id,
        page,
      );
    },
    /** Creates the org whose id is this transaction's org (withTenant with the new id). */
    async create(tx: TenantTx, values: Insert): Promise<Row> {
      const [row] = await drizzleOf(tx)
        .insert(t)
        .values({ ...values, id: tx.orgId })
        .returning();
      if (row === undefined) throw new Error("insert into organizations returned no row");
      return row;
    },
    async update(tx: TenantTx, id: string, patch: Partial<Insert>): Promise<Row | null> {
      const { id: _id, ...set } = patch as Partial<Insert> & { id?: unknown };
      const rows = await drizzleOf(tx)
        .update(t)
        .set(set)
        .where(and(scope(tx), eq(t.id, id)))
        .returning();
      return rows[0] ?? null;
    },
  };
}

function releasePointersRepo(opts: RepoOptions) {
  type Row = InferSelectModel<typeof s.releasePointers>;
  type Insert = Omit<InferInsertModel<typeof s.releasePointers>, "orgId">;
  const t = s.releasePointers;
  const scope = (tx: TenantTx) => (opts.orgFilter ? eq(t.orgId, tx.orgId) : undefined);
  return {
    table: "release_pointers",
    async get(tx: TenantTx, setId: string, channel: PointerChannel): Promise<Row | null> {
      const rows = await drizzleOf(tx)
        .select()
        .from(t)
        .where(and(scope(tx), eq(t.setId, setId), eq(t.channel, channel)))
        .limit(1);
      return rows[0] ?? null;
    },
    async listBySet(tx: TenantTx, setId: string): Promise<Row[]> {
      return drizzleOf(tx)
        .select()
        .from(t)
        .where(and(scope(tx), eq(t.setId, setId)))
        .orderBy(asc(t.channel));
    },
    async insert(tx: TenantTx, values: Insert): Promise<Row> {
      const [row] = await drizzleOf(tx)
        .insert(t)
        .values({ ...values, orgId: tx.orgId })
        .returning();
      if (row === undefined) throw new Error("insert into release_pointers returned no row");
      return row;
    },
    async update(
      tx: TenantTx,
      setId: string,
      channel: PointerChannel,
      patch: Partial<Pick<Row, "versionId" | "rolloutStage" | "activeExperimentId">>,
    ): Promise<Row | null> {
      const rows = await drizzleOf(tx)
        .update(t)
        .set({ ...patch, updatedAt: new Date() })
        .where(and(scope(tx), eq(t.setId, setId), eq(t.channel, channel)))
        .returning();
      return rows[0] ?? null;
    },
    async delete(tx: TenantTx, setId: string, channel: PointerChannel): Promise<boolean> {
      const rows = await drizzleOf(tx)
        .delete(t)
        .where(and(scope(tx), eq(t.setId, setId), eq(t.channel, channel)))
        .returning();
      return rows.length > 0;
    },
  };
}

/**
 * A newest-first page on (created_at, id). The cursor is the id of the last row of the previous
 * page, read back inside the same org scope, so timestamps never travel through a cursor.
 */
async function newestFirst<Row extends { id: string }>(
  run: (after: SQL | undefined, limit: number) => Promise<Row[]>,
  table: { createdAt: AnyColumnLike; id: AnyColumnLike; tableName: string },
  page: PageReq,
): Promise<Page<Row>> {
  const limit = clampLimit(page.limit);
  const after =
    page.cursor === null
      ? undefined
      : sql`(${table.createdAt}, ${table.id}) < (select c.created_at, c.id from ${sql.identifier(table.tableName)} c where c.id = ${page.cursor})`;
  const rows = await run(after, limit + 1);
  const data = rows.slice(0, limit);
  return { data, nextCursor: rows.length > limit ? (data.at(-1)?.id ?? null) : null };
}

type AnyColumnLike = Parameters<typeof eq>[0];

/** run.list filters (management-api.md, Runs and usage). */
export interface RunPageFilter {
  setId?: string;
  /** Limit to these sets: a token's allowlist. */
  setIds?: readonly string[];
  versionId?: string;
  channel?: Channel;
  source?: RunRecordSource;
  status?: RunStatus;
  band?: Band;
  action?: Action;
  from?: Date;
  to?: Date;
}

/** One set's run totals for usage.get, read straight from runs until the usage_daily rollup lands. */
export interface RunSetTotals {
  setId: string;
  runs: number;
  bandHigh: number;
  bandMedium: number;
  bandLow: number;
  errors: number;
  inputTokens: number;
  outputTokens: number;
  systemOneCostMicroUsd: number;
  counterfactualMicroUsd: number;
  savingsMicroUsd: number;
  llmCallsAvoided: number;
}

/** One UTC day of org run totals for the usage.get chart. `day` is YYYY-MM-DD. */
export interface RunDayTotals {
  day: string;
  runs: number;
  errors: number;
  systemOneCostMicroUsd: number;
  counterfactualMicroUsd: number;
  savingsMicroUsd: number;
  llmCallsAvoided: number;
}

/** review.list filters (management-api.md, Review and feedback). */
export interface ReviewPageFilter {
  setId?: string;
  /** Limit to these sets: a token's allowlist. */
  setIds?: readonly string[];
  kind?: ReviewItemKind;
  status?: ReviewItemStatus;
  band?: Band;
}

/** Builds every repository. Exported repositories always use `{ orgFilter: true }`. */
export function buildRepositories(opts: RepoOptions) {
  const questionSets = tenantRepo(s.questionSets, opts);
  const questionSetVersions = tenantRepo(s.questionSetVersions, opts);
  const runs = tenantRepo(s.runs, opts);
  const releaseEvents = tenantRepo(s.releaseEvents, opts);
  const approvalRequests = tenantRepo(s.approvalRequests, opts);
  const reviewItems = tenantRepo(s.reviewItems, opts);
  const usageEvents = tenantRepo(s.usageEvents, opts);
  const memberships = tenantRepo(s.memberships, opts);
  const orgSystemOneKeys = tenantRepo(s.orgSystemOneKeys, opts);
  const priceBooks = tenantRepo(s.priceBooks, opts);
  const idempotencyKeys = tenantRepo(s.idempotencyKeys, opts);
  const runFeedback = tenantRepo(s.runFeedback, opts);
  const projects = tenantRepo(s.projects, opts);
  const agentTokens = tenantRepo(s.agentTokens, opts);
  const appTokens = tenantRepo(s.appTokens, opts);

  return {
    organizations: organizationsRepo(opts),
    memberships: {
      ...memberships,
      async getByUser(tx: TenantTx, userId: string) {
        const [row] = await memberships.findMany(tx, eq(s.memberships.userId, userId), 1);
        return row ?? null;
      },
    },
    invitations: tenantRepo(s.invitations, opts),
    orgSystemOneKeys: {
      ...orgSystemOneKeys,
      async getByProvider(tx: TenantTx, provider: SystemOneProvider) {
        const [row] = await orgSystemOneKeys.findMany(tx, eq(s.orgSystemOneKeys.provider, provider), 1);
        return row ?? null;
      },
    },
    agentTokens: {
      ...agentTokens,
      /** The token with this hash in the transaction's org, revoked or not. The caller checks. */
      async getByHash(tx: TenantTx, hash: string) {
        const [row] = await agentTokens.findMany(tx, eq(s.agentTokens.hash, hash), 1);
        return row ?? null;
      },
    },
    orgWebhookSecrets: tenantRepo(s.orgWebhookSecrets, opts),
    apps: tenantRepo(s.apps, opts),
    appTokens: {
      ...appTokens,
      /** The token with this hash in the transaction's org, revoked or not. The caller checks. */
      async getByHash(tx: TenantTx, hash: string) {
        const [row] = await appTokens.findMany(tx, eq(s.appTokens.hash, hash), 1);
        return row ?? null;
      },
    },
    appOpportunities: tenantRepo(s.appOpportunities, opts),
    appSetBindings: tenantRepo(s.appSetBindings, opts),
    projects: {
      ...projects,
      async getBySlug(tx: TenantTx, slug: string) {
        const [row] = await projects.findMany(tx, eq(s.projects.slug, slug), 1);
        return row ?? null;
      },
    },
    goals: tenantRepo(s.goals, opts),
    questionSets: {
      ...questionSets,
      async getBySlug(tx: TenantTx, slug: string) {
        const [row] = await questionSets.findMany(tx, eq(s.questionSets.slug, slug), 1);
        return row ?? null;
      },
    },
    questionSetVersions: {
      ...questionSetVersions,
      async getDraft(tx: TenantTx, setId: string) {
        const where = and(eq(s.questionSetVersions.setId, setId), eq(s.questionSetVersions.status, "draft"));
        const [row] = await questionSetVersions.findMany(tx, where, 1);
        return row ?? null;
      },
      async getByNumber(tx: TenantTx, setId: string, version: number) {
        const where = and(eq(s.questionSetVersions.setId, setId), eq(s.questionSetVersions.version, version));
        const [row] = await questionSetVersions.findMany(tx, where, 1);
        return row ?? null;
      },
      /** Published and archived versions, newest first. The cursor is a version number. */
      async listPublished(tx: TenantTx, setId: string, page: PageReq) {
        const t = s.questionSetVersions;
        const limit = clampLimit(page.limit);
        const before = page.cursor === null ? undefined : lt(t.version, Number(page.cursor));
        const rows = await drizzleOf(tx)
          .select()
          .from(t)
          .where(questionSetVersions.scope(tx, and(eq(t.setId, setId), ne(t.status, "draft"), before)))
          .orderBy(desc(t.version))
          .limit(limit + 1);
        const data = rows.slice(0, limit);
        const last = data.at(-1);
        return { data, nextCursor: rows.length > limit && last !== undefined ? String(last.version) : null };
      },
      /** The highest interface major of the set's published versions, 0 when it has none. */
      async maxInterfaceMajor(tx: TenantTx, setId: string): Promise<number> {
        const t = s.questionSetVersions;
        const rows = await drizzleOf(tx)
          .select({ max: sql<number | null>`max(${t.interfaceMajor})` })
          .from(t)
          .where(questionSetVersions.scope(tx, and(eq(t.setId, setId), ne(t.status, "draft"))));
        return Number(rows[0]?.max ?? 0);
      },
      /**
       * Write to a draft only while it is still a draft holding the spec hash the caller read, so two
       * concurrent writers cannot both win. Null when the row moved on.
       */
      async updateDraftIf(tx: TenantTx, id: string, expectedSpecHash: string, patch: Partial<Omit<InferInsertModel<typeof s.questionSetVersions>, "orgId" | "id">>) {
        const t = s.questionSetVersions;
        const { orgId: _o, id: _i, ...set } = patch as typeof patch & { orgId?: unknown; id?: unknown };
        const rows = await drizzleOf(tx)
          .update(t)
          .set(set)
          .where(questionSetVersions.scope(tx, and(eq(t.id, id), eq(t.status, "draft"), eq(t.specHash, expectedSpecHash))))
          .returning();
        return rows[0] ?? null;
      },
      /** The highest version number of the set, 0 when it has none. */
      async maxVersion(tx: TenantTx, setId: string): Promise<number> {
        const rows = await drizzleOf(tx)
          .select({ max: sql<number | null>`max(${s.questionSetVersions.version})` })
          .from(s.questionSetVersions)
          .where(questionSetVersions.scope(tx, eq(s.questionSetVersions.setId, setId)));
        return Number(rows[0]?.max ?? 0);
      },
    },
    releasePointers: releasePointersRepo(opts),
    releaseEvents: {
      ...releaseEvents,
      /** One channel's release history, newest first. */
      async listByChannel(tx: TenantTx, setId: string, channel: PointerChannel, limit?: number) {
        const t = s.releaseEvents;
        return drizzleOf(tx)
          .select()
          .from(t)
          .where(releaseEvents.scope(tx, and(eq(t.setId, setId), eq(t.channel, channel))))
          .orderBy(desc(t.at), desc(t.id))
          .limit(clampLimit(limit));
      },
    },
    experiments: tenantRepo(s.experiments, opts),
    proposals: tenantRepo(s.proposals, opts),
    runs: {
      ...runs,
      /** Feedback matching: the newest run with this external ref, optionally within one set. */
      async findByExternalRef(tx: TenantTx, externalRef: string, setId?: string) {
        const rows = await drizzleOf(tx)
          .select()
          .from(s.runs)
          .where(
            runs.scope(
              tx,
              and(eq(s.runs.externalRef, externalRef), setId === undefined ? undefined : eq(s.runs.setId, setId)),
            ),
          )
          .orderBy(desc(s.runs.createdAt))
          .limit(1);
        return rows[0] ?? null;
      },
      /** run.list: newest first, filtered, without the state column. */
      async listPage(tx: TenantTx, filter: RunPageFilter, page: PageReq) {
        const t = s.runs;
        if (filter.setIds !== undefined && filter.setIds.length === 0) return { data: [], nextCursor: null };
        const { state: _state, ...columns } = getTableColumns(t);
        const where = and(
          filter.setId === undefined ? undefined : eq(t.setId, filter.setId),
          filter.setIds === undefined ? undefined : inArray(t.setId, [...filter.setIds]),
          filter.versionId === undefined ? undefined : eq(t.versionId, filter.versionId),
          filter.channel === undefined ? undefined : eq(t.channel, filter.channel),
          filter.source === undefined ? undefined : eq(t.source, filter.source),
          filter.status === undefined ? undefined : eq(t.status, filter.status),
          filter.band === undefined ? undefined : eq(t.runBand, filter.band),
          filter.action === undefined ? undefined : eq(t.overallAction, filter.action),
          filter.from === undefined ? undefined : gte(t.createdAt, filter.from),
          filter.to === undefined ? undefined : lte(t.createdAt, filter.to),
        );
        return newestFirst(
          (after, limit) =>
            drizzleOf(tx)
              .select(columns)
              .from(t)
              .where(runs.scope(tx, and(where, after)))
              .orderBy(desc(t.createdAt), desc(t.id))
              .limit(limit),
          { createdAt: t.createdAt, id: t.id, tableName: "runs" },
          page,
        );
      },
      /** usage.get: per-set totals over [from, to]. */
      async totalsBySet(tx: TenantTx, range: { from: Date; to: Date; setIds?: readonly string[] }): Promise<RunSetTotals[]> {
        const t = s.runs;
        if (range.setIds !== undefined && range.setIds.length === 0) return [];
        const n = (expr: SQL) => sql<number>`coalesce(${expr}, 0)::bigint`.mapWith(Number);
        return drizzleOf(tx)
          .select({
            setId: t.setId,
            runs: n(sql`count(*)`),
            bandHigh: n(sql`count(*) filter (where ${t.runBand} = 'high')`),
            bandMedium: n(sql`count(*) filter (where ${t.runBand} = 'medium')`),
            bandLow: n(sql`count(*) filter (where ${t.runBand} = 'low')`),
            errors: n(sql`count(*) filter (where ${t.status} <> 'ok')`),
            inputTokens: n(sql`sum(${t.inputTokens})`),
            outputTokens: n(sql`sum(${t.outputTokens})`),
            systemOneCostMicroUsd: n(sql`sum(${t.systemOneCostMicroUsd})`),
            counterfactualMicroUsd: n(sql`sum(${t.counterfactualMicroUsd})`),
            savingsMicroUsd: n(sql`sum(${t.savingsMicroUsd})`),
            llmCallsAvoided: n(sql`sum(${t.llmCallsAvoided})`),
          })
          .from(t)
          .where(
            runs.scope(
              tx,
              and(
                gte(t.createdAt, range.from),
                lte(t.createdAt, range.to),
                range.setIds === undefined ? undefined : inArray(t.setId, [...range.setIds]),
              ),
            ),
          )
          .groupBy(t.setId)
          .orderBy(asc(t.setId));
      },
      /** usage.get: org totals per UTC day over [from, to], oldest first. Days without runs are left out. */
      async totalsByDay(tx: TenantTx, range: { from: Date; to: Date; setIds?: readonly string[] }): Promise<RunDayTotals[]> {
        const t = s.runs;
        if (range.setIds !== undefined && range.setIds.length === 0) return [];
        const n = (expr: SQL) => sql<number>`coalesce(${expr}, 0)::bigint`.mapWith(Number);
        const day = sql<string>`to_char(${t.createdAt} at time zone 'UTC', 'YYYY-MM-DD')`;
        return drizzleOf(tx)
          .select({
            day,
            runs: n(sql`count(*)`),
            errors: n(sql`count(*) filter (where ${t.status} <> 'ok')`),
            systemOneCostMicroUsd: n(sql`sum(${t.systemOneCostMicroUsd})`),
            counterfactualMicroUsd: n(sql`sum(${t.counterfactualMicroUsd})`),
            savingsMicroUsd: n(sql`sum(${t.savingsMicroUsd})`),
            llmCallsAvoided: n(sql`sum(${t.llmCallsAvoided})`),
          })
          .from(t)
          .where(
            runs.scope(
              tx,
              and(
                gte(t.createdAt, range.from),
                lte(t.createdAt, range.to),
                range.setIds === undefined ? undefined : inArray(t.setId, [...range.setIds]),
              ),
            ),
          )
          .groupBy(day)
          .orderBy(asc(day));
      },
      async listBySet(tx: TenantTx, setId: string, limit?: number) {
        return drizzleOf(tx)
          .select()
          .from(s.runs)
          .where(runs.scope(tx, eq(s.runs.setId, setId)))
          .orderBy(desc(s.runs.createdAt))
          .limit(clampLimit(limit));
      },
    },
    runFeedback: {
      ...runFeedback,
      async getByIdempotencyKey(tx: TenantTx, key: string) {
        const [row] = await runFeedback.findMany(tx, eq(s.runFeedback.idempotencyKey, key), 1);
        return row ?? null;
      },
    },
    reviewItems: {
      ...reviewItems,
      async listByRun(tx: TenantTx, runId: string) {
        return reviewItems.findMany(tx, eq(s.reviewItems.runId, runId));
      },
      /** review.list: newest first, filtered. */
      async listPage(tx: TenantTx, filter: ReviewPageFilter, page: PageReq) {
        const t = s.reviewItems;
        if (filter.setIds !== undefined && filter.setIds.length === 0) return { data: [], nextCursor: null };
        const where = and(
          filter.setId === undefined ? undefined : eq(t.setId, filter.setId),
          filter.setIds === undefined ? undefined : inArray(t.setId, [...filter.setIds]),
          filter.kind === undefined ? undefined : eq(t.kind, filter.kind),
          filter.status === undefined ? undefined : eq(t.status, filter.status),
          filter.band === undefined ? undefined : eq(t.band, filter.band),
        );
        return newestFirst(
          (after, limit) =>
            drizzleOf(tx)
              .select()
              .from(t)
              .where(reviewItems.scope(tx, and(where, after)))
              .orderBy(desc(t.createdAt), desc(t.id))
              .limit(limit),
          { createdAt: t.createdAt, id: t.id, tableName: "review_items" },
          page,
        );
      },
      /** Label items created for a set since `since`: the labeling policy's day counter. */
      async countLabelItemsSince(tx: TenantTx, setId: string, since: Date): Promise<number> {
        const rows = await drizzleOf(tx)
          .select({ n: sql<number>`count(*)` })
          .from(s.reviewItems)
          .where(
            reviewItems.scope(
              tx,
              and(
                eq(s.reviewItems.setId, setId),
                eq(s.reviewItems.kind, "label"),
                gte(s.reviewItems.createdAt, since),
              ),
            ),
          );
        return Number(rows[0]?.n ?? 0);
      },
    },
    datasets: tenantRepo(s.datasets, opts),
    datasetCases: tenantRepo(s.datasetCases, opts),
    datasetSnapshots: appendOnlyRepo(s.datasetSnapshots, opts),
    evalRuns: tenantRepo(s.evalRuns, opts),
    evalCaseResults: tenantRepo(s.evalCaseResults, opts),
    studioSessions: tenantRepo(s.studioSessions, opts),
    studioExamples: tenantRepo(s.studioExamples, opts),
    questionDaily: tenantRepo(s.questionDaily, opts),
    usageDaily: tenantRepo(s.usageDaily, opts),
    billingAccounts: tenantRepo(s.billingAccounts, opts),
    entitlementOverrides: tenantRepo(s.entitlementOverrides, opts),
    usageEvents: {
      ...usageEvents,
      async listByRun(tx: TenantTx, runId: string) {
        return usageEvents.findMany(tx, eq(s.usageEvents.runId, runId));
      },
    },
    priceBooks: {
      ...priceBooks,
      /**
       * The price for an exact model id: the org row wins over the platform row, and a row for
       * `provider` wins over a provider-independent row (ADR-011). Null when neither exists.
       */
      async resolve(tx: TenantTx, model: string, provider?: SystemOneProvider): Promise<ModelPrice | null> {
        const t = s.priceBooks;
        const providerMatch = provider === undefined ? isNull(t.provider) : or(eq(t.provider, provider), isNull(t.provider));
        const orgMatch = opts.orgFilter ? or(isNull(t.orgId), eq(t.orgId, tx.orgId)) : undefined;
        const rows = await drizzleOf(tx)
          .select()
          .from(t)
          .where(and(eq(t.model, model), providerMatch, orgMatch))
          .orderBy(sql`${t.orgId} is null`, sql`${t.provider} is null`)
          .limit(1);
        const row = rows[0];
        return row === undefined
          ? null
          : { inputPerMtokMicroUsd: row.inputPerMtokMicroUsd, outputPerMtokMicroUsd: row.outputPerMtokMicroUsd };
      },
    },
    auditLog: appendOnlyRepo(s.auditLog, opts),
    approvalRequests: {
      ...approvalRequests,
      /** A pending, unexpired request from this token for the same operation and input. */
      async findPending(tx: TenantTx, tokenId: string, opId: string, inputHash: string, now: Date) {
        const t = s.approvalRequests;
        const where = and(
          eq(t.requestedByTokenId, tokenId),
          eq(t.opId, opId),
          eq(t.inputHash, inputHash),
          eq(t.status, "pending"),
          gte(t.expiresAt, now),
        );
        const [row] = await approvalRequests.findMany(tx, where, 1);
        return row ?? null;
      },
      /**
       * Move a request on only from the status the caller expects (and, with `unexpiredAt`, only while
       * it has not expired), so a double decide or a double run cannot both land. Null when it moved on.
       */
      async transition(
        tx: TenantTx,
        id: string,
        from: "pending" | "approved",
        patch: Partial<Omit<InferInsertModel<typeof s.approvalRequests>, "orgId" | "id">>,
        unexpiredAt?: Date,
      ) {
        const t = s.approvalRequests;
        const { orgId: _o, id: _i, ...set } = patch as typeof patch & { orgId?: unknown; id?: unknown };
        const rows = await drizzleOf(tx)
          .update(t)
          .set(set)
          .where(approvalRequests.scope(tx, and(eq(t.id, id), eq(t.status, from), unexpiredAt === undefined ? undefined : gt(t.expiresAt, unexpiredAt))))
          .returning();
        return rows[0] ?? null;
      },
      /** Pending, unexpired requests, newest first; only one token's when tokenId is set. */
      async listPending(tx: TenantTx, filter: { tokenId?: string; now: Date }, page: PageReq) {
        const t = s.approvalRequests;
        const where = and(
          eq(t.status, "pending"),
          gte(t.expiresAt, filter.now),
          filter.tokenId === undefined ? undefined : eq(t.requestedByTokenId, filter.tokenId),
        );
        return newestFirst(
          (after, limit) =>
            drizzleOf(tx)
              .select()
              .from(t)
              .where(approvalRequests.scope(tx, and(where, after)))
              .orderBy(desc(t.createdAt), desc(t.id))
              .limit(limit),
          { createdAt: t.createdAt, id: t.id, tableName: "approval_requests" },
          page,
        );
      },
    },
    idempotencyKeys: {
      ...idempotencyKeys,
      /** The caller's row for a key. With `liveSince`, a row created before it reads as absent. */
      async lookup(tx: TenantTx, actorKey: string, key: string, liveSince?: Date) {
        const t = s.idempotencyKeys;
        const where = and(eq(t.actorKey, actorKey), eq(t.key, key), liveSince === undefined ? undefined : gte(t.createdAt, liveSince));
        const [row] = await idempotencyKeys.findMany(tx, where, 1);
        return row ?? null;
      },
      /**
       * Claim a key for this transaction: insert the row with `responseStatus` 0, or take over a
       * row created before `liveSince` (an expired key). A live row is left as it is and returned
       * with `claimed: false`. A concurrent claim of the same key blocks on the unique index until
       * the other transaction ends, then sees its committed row, or claims the key if it rolled back.
       *
       * Every claim also deletes the org's other expired rows, so a stored response does not
       * outlive the key's lifetime by more than the time until the org's next keyed call.
       */
      async claim(
        tx: TenantTx,
        values: { actorKey: string; key: string; opId: string; requestHash: string; createdAt: Date },
        liveSince: Date,
      ): Promise<{ claimed: boolean; row: InferSelectModel<typeof s.idempotencyKeys> }> {
        const t = s.idempotencyKeys;
        await drizzleOf(tx)
          .delete(t)
          .where(
            and(
              eq(t.orgId, tx.orgId),
              lt(t.createdAt, liveSince),
              not(and(eq(t.actorKey, values.actorKey), eq(t.key, values.key)) as SQL),
            ),
          );
        const fresh = { ...values, orgId: tx.orgId, responseStatus: 0, response: null };
        const [row] = await drizzleOf(tx)
          .insert(t)
          .values(fresh)
          .onConflictDoUpdate({
            target: [t.orgId, t.actorKey, t.key],
            set: { opId: values.opId, requestHash: values.requestHash, responseStatus: 0, response: null, createdAt: values.createdAt },
            setWhere: lt(t.createdAt, liveSince),
          })
          .returning();
        if (row !== undefined) return { claimed: true, row };
        const where = and(eq(t.actorKey, values.actorKey), eq(t.key, values.key));
        const [live] = await idempotencyKeys.findMany(tx, where, 1);
        if (live === undefined) throw new Error("idempotency key conflict with no row");
        return { claimed: false, row: live };
      },
    },
    jobs: tenantRepo(s.jobs, opts),
    events: appendOnlyRepo(s.events, opts),
    webhookEndpoints: tenantRepo(s.webhookEndpoints, opts),
    pluginConfigs: tenantRepo(s.pluginConfigs, opts),
  };
}

export type Repositories = ReturnType<typeof buildRepositories>;
export type TenantRepositoryName = keyof Repositories;

/** Auth tables and the pre-org lookups (ADR-002). */
export const authRepositories = {
  users: {
    ...globalRepo(s.users),
    async getByEmail(tx: AnyTx, email: string) {
      const rows = await drizzleOf(tx)
        .select()
        .from(s.users)
        .where(sql`lower(${s.users.email}) = lower(${email})`)
        .limit(1);
      return rows[0] ?? null;
    },
  },
  sessions: globalRepo(s.sessions),
  accounts: globalRepo(s.accounts),
  verificationTokens: globalRepo(s.verificationTokens),
  twoFactors: globalRepo(s.twoFactors),
  deviceCodes: globalRepo(s.deviceCodes),
  authAttempts: {
    table: "auth_attempts",
    /**
     * Counts one attempt for every key, in one transaction with the rows locked, so two instances
     * cannot both slip under a limit. False when any key is already at its limit; then nothing is
     * counted. Windows older than a day are deleted on the way.
     */
    async take(tx: AnyTx, unsorted: readonly { keyHash: string; max: number; windowMs: number }[], now: Date): Promise<boolean> {
      const t = s.authAttempts;
      const db = drizzleOf(tx);
      if (unsorted.length === 0) return true;
      // One lock order for every caller, so two sign-ins sharing keys cannot deadlock.
      const keys = [...unsorted].sort((x, y) => (x.keyHash < y.keyHash ? -1 : x.keyHash > y.keyHash ? 1 : 0));
      await db.delete(t).where(lt(t.windowStart, new Date(now.getTime() - 24 * 60 * 60 * 1000)));
      await db
        .insert(t)
        .values(keys.map((k) => ({ keyHash: k.keyHash, windowStart: now, count: 0 })))
        .onConflictDoNothing();
      const rows = await db
        .select()
        .from(t)
        .where(inArray(t.keyHash, keys.map((k) => k.keyHash)))
        .orderBy(asc(t.keyHash))
        .for("update");
      const byHash = new Map(rows.map((r) => [r.keyHash, r]));
      const current = keys.map((k) => {
        const row = byHash.get(k.keyHash);
        const live = row !== undefined && now.getTime() - row.windowStart.getTime() < k.windowMs;
        return { k, start: live ? row.windowStart : now, count: live ? row.count : 0 };
      });
      if (current.some((c) => c.count >= c.k.max)) return false;
      for (const c of current) {
        await db.update(t).set({ windowStart: c.start, count: c.count + 1 }).where(eq(t.keyHash, c.k.keyHash));
      }
      return true;
    },
  },
  runLimits: {
    table: "run_limits",
    /**
     * Adds `amount` to the key's window in one locked upsert, so two instances cannot both slip
     * under `max`. A newer window replaces an older one; a caller whose clock is behind counts
     * against the newer window. Returns ok false, and counts nothing, when the window would pass
     * `max`.
     */
    async take(tx: AnyTx, k: { keyHash: string; windowStart: Date; amount: number; max: number }): Promise<{ ok: boolean; used: number }> {
      const t = s.runLimits;
      if (k.amount > k.max) return { ok: false, used: 0 };
      const rows = await drizzleOf(tx)
        .insert(t)
        .values({ keyHash: k.keyHash, windowStart: k.windowStart, used: k.amount })
        .onConflictDoUpdate({
          target: t.keyHash,
          set: {
            windowStart: sql`greatest(${t.windowStart}, excluded.window_start)`,
            used: sql`case when excluded.window_start > ${t.windowStart} then excluded.used else ${t.used} + excluded.used end`,
          },
          setWhere: sql`excluded.window_start > ${t.windowStart} or ${t.used} + excluded.used <= ${k.max}`,
        })
        .returning({ used: t.used });
      const row = rows[0];
      return row === undefined ? { ok: false, used: k.max } : { ok: true, used: row.used };
    },
    /** Adds `amount` to the key's window with no limit: a cost that was already spent. */
    async charge(tx: AnyTx, k: { keyHash: string; windowStart: Date; amount: number }): Promise<number> {
      const t = s.runLimits;
      const rows = await drizzleOf(tx)
        .insert(t)
        .values({ keyHash: k.keyHash, windowStart: k.windowStart, used: k.amount })
        .onConflictDoUpdate({
          target: t.keyHash,
          set: {
            windowStart: sql`greatest(${t.windowStart}, excluded.window_start)`,
            used: sql`case when excluded.window_start > ${t.windowStart} then excluded.used else ${t.used} + excluded.used end`,
          },
        })
        .returning({ used: t.used });
      return rows[0]?.used ?? k.amount;
    },
    /** What the key used in the window that starts at `windowStart` (or a newer one), 0 for none. */
    async used(tx: AnyTx, keyHash: string, windowStart: Date): Promise<number> {
      const t = s.runLimits;
      const rows = await drizzleOf(tx)
        .select({ used: t.used })
        .from(t)
        .where(and(eq(t.keyHash, keyHash), gte(t.windowStart, windowStart)))
        .limit(1);
      return rows[0]?.used ?? 0;
    },
    /** Deletes windows that started before `before`. */
    async prune(tx: AnyTx, before: Date): Promise<void> {
      const t = s.runLimits;
      await drizzleOf(tx).delete(t).where(lt(t.windowStart, before));
    },
  },
  consoleEnrollments: {
    table: "console_enrollments",
    /** Issues (or replaces) the user's enrollment code. Only its hash is stored. */
    async issue(tx: AnyTx, userId: string, codeHash: string, expiresAt: Date): Promise<void> {
      const t = s.consoleEnrollments;
      await drizzleOf(tx)
        .insert(t)
        .values({ userId, codeHash, expiresAt })
        .onConflictDoUpdate({ target: t.userId, set: { codeHash, expiresAt, createdAt: sql`now()` } });
    },
    /** True when the user holds an unexpired code with this hash. */
    async matches(tx: AnyTx, userId: string, codeHash: string, now: Date): Promise<boolean> {
      const t = s.consoleEnrollments;
      const rows = await drizzleOf(tx)
        .select({ userId: t.userId })
        .from(t)
        .where(and(eq(t.userId, userId), eq(t.codeHash, codeHash), gt(t.expiresAt, now)))
        .limit(1);
      return rows.length === 1;
    },
    /** Deletes the user's code. Returns whether one was there. */
    async consume(tx: AnyTx, userId: string): Promise<boolean> {
      const t = s.consoleEnrollments;
      const rows = await drizzleOf(tx).delete(t).where(eq(t.userId, userId)).returning({ userId: t.userId });
      return rows.length === 1;
    },
  },
  /** The signed-in user's memberships across orgs, before any org is picked. */
  async myMemberships(tx: UserTx) {
    return drizzleOf(tx)
      .select()
      .from(s.memberships)
      .where(eq(s.memberships.userId, tx.userId))
      .orderBy(asc(s.memberships.createdAt));
  },
  /** Orgs the signed-in user belongs to (org switcher). */
  async myOrganizations(tx: UserTx) {
    return drizzleOf(tx).select().from(s.organizations).orderBy(asc(s.organizations.slug));
  },
  /** Open invitations addressed to the signed-in user's email. */
  async myInvitations(tx: UserTx) {
    return drizzleOf(tx)
      .select()
      .from(s.invitations)
      .where(isNull(s.invitations.acceptedAt))
      .orderBy(asc(s.invitations.createdAt));
  },
};

function readOnly<T extends IdTable>(table: T) {
  const { get, list, table: name } = globalRepo(table);
  return { table: name, get, list };
}

/** Platform tables. The app role reads them; only bandwise_platform writes them (except below). */
export const platformRepositories = {
  systemOneModels: readOnly(s.systemOneModels),
  systemOneModelRoutes: {
    table: "system_one_model_routes",
    async listByProvider(tx: AnyTx, provider: SystemOneProvider) {
      return drizzleOf(tx)
        .select()
        .from(s.systemOneModelRoutes)
        .where(eq(s.systemOneModelRoutes.provider, provider))
        .orderBy(asc(s.systemOneModelRoutes.modelId));
    },
    async get(tx: AnyTx, modelId: string, provider: SystemOneProvider) {
      const rows = await drizzleOf(tx)
        .select()
        .from(s.systemOneModelRoutes)
        .where(and(eq(s.systemOneModelRoutes.modelId, modelId), eq(s.systemOneModelRoutes.provider, provider)))
        .limit(1);
      return rows[0] ?? null;
    },
  },
  modelAliasObservations: {
    ...readOnly(s.modelAliasObservations),
    /** Upsert one observation and bump last_seen. Returns true when the (provider, alias, resolved) row is new. */
    async record(tx: AnyTx, provider: SystemOneProvider, alias: string, resolvedId: string, at: Date): Promise<boolean> {
      const t = s.modelAliasObservations;
      const rows = await drizzleOf(tx)
        .insert(t)
        .values({ provider, alias, resolvedId, firstSeen: at, lastSeen: at })
        .onConflictDoUpdate({ target: [t.provider, t.alias, t.resolvedId], set: { lastSeen: at } })
        .returning({ firstSeen: t.firstSeen });
      return rows[0]?.firstSeen.getTime() === at.getTime();
    },
  },
  settings: {
    table: "settings",
    async get(tx: AnyTx, key: string) {
      const rows = await drizzleOf(tx).select().from(s.settings).where(eq(s.settings.key, key)).limit(1);
      return rows[0] ?? null;
    },
  },
  earlyAccessSignups: {
    table: "early_access_signups",
    /**
     * Adds a signup through bandwise_early_access_submit() (migration 0005). The app role can call
     * it but cannot read the table. A known email is a no-op that still returns "accepted", so the
     * result never reveals whether an address was already on the list.
     */
    async submit(tx: AnyTx, signup: EarlyAccessSubmission): Promise<EarlyAccessOutcome> {
      const result = (await drizzleOf(tx).execute(
        sql`select bandwise_early_access_submit(${signup.email}, ${signup.name ?? null}, ${signup.company ?? null}, ${signup.role ?? null}, ${signup.useCase ?? null}, ${signup.sourcePage ?? null}, ${signup.ipHash}) as outcome`,
      )) as { rows: Array<{ outcome?: unknown }> };
      const outcome = result.rows[0]?.outcome;
      if (outcome !== "accepted" && outcome !== "rate_limited") {
        throw new Error(`bandwise_early_access_submit returned ${String(outcome)}`);
      }
      return outcome;
    },
    /** Every signup, paged in id order. Platform role only: the app role has no grant and gets an error. */
    async list(tx: AnyTx, page: PageReq) {
      const t = s.earlyAccessSignups;
      return pageBy(
        (where, limit) => drizzleOf(tx).select().from(t).where(where).orderBy(asc(t.id)).limit(limit),
        t.id,
        page,
      );
    },
    /** Deletes a signup by email, any case. Platform role only. Returns true when a row was removed. */
    async removeByEmail(tx: AnyTx, email: string): Promise<boolean> {
      const t = s.earlyAccessSignups;
      const rows = await drizzleOf(tx)
        .delete(t)
        .where(sql`lower(${t.email}) = lower(${email})`)
        .returning({ id: t.id });
      return rows.length > 0;
    },
  },
  stripeWebhookEvents: {
    table: "stripe_webhook_events",
    /** True when the event id is new. A duplicate delivery is a no-op. */
    async insertIfNew(tx: AnyTx, eventId: string, type: string): Promise<boolean> {
      const rows = await drizzleOf(tx)
        .insert(s.stripeWebhookEvents)
        .values({ eventId, type })
        .onConflictDoNothing()
        .returning({ eventId: s.stripeWebhookEvents.eventId });
      return rows.length > 0;
    },
  },
};

export interface EarlyAccessSubmission {
  email: string;
  name?: string | null;
  company?: string | null;
  role?: string | null;
  useCase?: string | null;
  sourcePage?: string | null;
  /** 64 hex characters: HMAC-SHA256 of the client IP. */
  ipHash: string;
}

export type EarlyAccessOutcome = "accepted" | "rate_limited";

/** The repositories the app uses. Always org-filtered. */
export const repos: Repositories = buildRepositories({ orgFilter: true });
