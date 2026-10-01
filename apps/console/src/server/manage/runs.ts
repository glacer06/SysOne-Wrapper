// Handlers for run.list, run.get and usage.get (management-api.md, Runs and usage). Runs are read
// without state except in run.get, and only for sets the caller's allowlist admits.

import type { Action, Band, Channel, RunRecordSource, RunStatus } from "@bandwise/core";
import { repos, type RunPageFilter, type RunSetTotals } from "@bandwise/db";

import type { OperationEnv } from "../operations/define";
import { OperationError } from "../operations/errors";
import type { RunDetail, RunSummary, UsageView } from "../operations/views";
import { allowlistOf, findSet, inAllowlist, iso, isoOrNull, isUuid, setNotFound } from "./common";
import { cursorOf } from "./sets";

/** usage.get without a range: the last seven days. */
export const DEFAULT_USAGE_DAYS = 7;

type RunRow = Awaited<ReturnType<typeof repos.runs.listPage>>["data"][number];

function summary(r: RunRow): RunSummary {
  return {
    id: r.id,
    setId: r.setId,
    versionId: r.versionId,
    channel: r.channel,
    rollout: r.rollout,
    source: r.source,
    status: r.status,
    runBand: r.runBand,
    overallAction: r.overallAction,
    route: r.route,
    modelRequested: r.modelRequested,
    modelResolved: r.modelResolved,
    latencyMs: r.latencyMs,
    inputTokens: r.inputTokens,
    outputTokens: r.outputTokens,
    systemOneCostMicroUsd: r.systemOneCostMicroUsd,
    counterfactualMicroUsd: r.counterfactualMicroUsd,
    savingsMicroUsd: r.savingsMicroUsd,
    errorCode: r.errorCode,
    createdAt: iso(r.createdAt),
  };
}

/** The set filter: a set the caller can see, or 404 with the same message as a missing set. */
async function visibleSetId(env: OperationEnv, ref: string): Promise<string> {
  const set = await findSet(env.tx, ref);
  if (!inAllowlist(env.ctx, set.id)) throw new OperationError("not_found", setNotFound(ref));
  return set.id;
}

const date = (v: string | undefined): Date | undefined => (v === undefined ? undefined : new Date(v));

export async function listRuns(
  env: OperationEnv,
  input: {
    set?: string | undefined;
    version?: number | undefined;
    channel?: Channel | undefined;
    source?: RunRecordSource | undefined;
    status?: RunStatus | undefined;
    band?: Band | undefined;
    action?: Action | undefined;
    from?: string | undefined;
    to?: string | undefined;
    limit: number;
    cursor?: string | undefined;
  },
) {
  env.authorize({});
  const filter: RunPageFilter = {};
  const allow = allowlistOf(env.ctx);
  if (allow !== undefined) filter.setIds = allow;
  if (input.set !== undefined) filter.setId = await visibleSetId(env, input.set);
  if (input.version !== undefined) {
    if (filter.setId === undefined) throw new OperationError("invalid_request", "version needs set.");
    const v = await repos.questionSetVersions.getByNumber(env.tx, filter.setId, input.version);
    if (v === null) return { data: [], nextCursor: null };
    filter.versionId = v.id;
  }
  if (input.channel !== undefined) filter.channel = input.channel;
  if (input.source !== undefined) filter.source = input.source;
  if (input.status !== undefined) filter.status = input.status;
  if (input.band !== undefined) filter.band = input.band;
  if (input.action !== undefined) filter.action = input.action;
  const from = date(input.from);
  const to = date(input.to);
  if (from !== undefined) filter.from = from;
  if (to !== undefined) filter.to = to;
  const page = await repos.runs.listPage(env.tx, filter, { limit: input.limit, cursor: cursorOf(input.cursor, "uuid") });
  return { data: page.data.map(summary), nextCursor: page.nextCursor };
}

export async function getRun(env: OperationEnv, input: { id: string }): Promise<RunDetail> {
  const notFound = `No run ${input.id} is visible to this caller.`;
  const run = isUuid(input.id) ? await repos.runs.get(env.tx, input.id) : null;
  if (run === null) {
    env.authorize({}, undefined, notFound);
    throw new OperationError("not_found", notFound);
  }
  env.authorize({ setId: run.setId }, undefined, notFound);
  const items = await repos.reviewItems.listByRun(env.tx, run.id);
  return {
    ...summary(run),
    stages: run.stages,
    checks: run.checks,
    answers: (run.answers ?? null) as RunDetail["answers"],
    decisions: (run.decisions ?? null) as RunDetail["decisions"],
    warnings: run.warnings,
    state: (run.state ?? null) as RunDetail["state"],
    reviewItems: items.map((i) => ({
      id: i.id,
      decisionId: i.decisionId,
      kind: i.kind,
      reason: i.reason,
      band: i.band,
      status: i.status,
      resolution: (i.resolution ?? null) as RunDetail["reviewItems"][number]["resolution"],
      resolvedAt: isoOrNull(i.resolvedAt),
    })),
  };
}

const ZERO: Omit<RunSetTotals, "setId"> = {
  runs: 0,
  bandHigh: 0,
  bandMedium: 0,
  bandLow: 0,
  errors: 0,
  inputTokens: 0,
  outputTokens: 0,
  systemOneCostMicroUsd: 0,
  counterfactualMicroUsd: 0,
  savingsMicroUsd: 0,
  llmCallsAvoided: 0,
};

/**
 * usage.get reads the runs table directly. The usage_daily rollup and the savings ledger land with
 * the jobs runner (Phase 2); the numbers are the same sums.
 */
export async function getUsage(env: OperationEnv, input: { from?: string | undefined; to?: string | undefined; set?: string | undefined }): Promise<UsageView> {
  env.authorize({});
  const to = date(input.to) ?? env.now;
  const from = date(input.from) ?? new Date(to.getTime() - DEFAULT_USAGE_DAYS * 86_400_000);
  if (from.getTime() > to.getTime()) throw new OperationError("invalid_request", "from is after to.");
  let setIds = allowlistOf(env.ctx);
  if (input.set !== undefined) setIds = [await visibleSetId(env, input.set)];
  const rows = await repos.runs.totalsBySet(env.tx, { from, to, ...(setIds === undefined ? {} : { setIds }) });
  const totals = { ...ZERO };
  const sets: UsageView["sets"] = [];
  for (const row of rows) {
    const set = await repos.questionSets.get(env.tx, row.setId);
    sets.push({ ...row, slug: set?.slug ?? row.setId });
    for (const k of Object.keys(ZERO) as (keyof typeof ZERO)[]) totals[k] += row[k];
  }
  return { from: iso(from), to: iso(to), sets, totals };
}
