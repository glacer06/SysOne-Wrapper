// The eval harness (testing.md, Evals): run a set version over a dataset snapshot through the same
// run engine production uses, then score it. Evals run on the staging channel in shadow, so no
// action is ever dispatched; coverage reads the policy action, which the rollout stage never
// changes.

import {
  type LintResult,
  type QuestionSetSpec,
  type ResolvedRun,
  type RunPorts,
  type RunResult,
  SEED_MODEL_PROFILES,
  type SystemOneProvider,
  type TenantContext,
  hashJson,
  isRunRefusedError,
  latencyBudgetMs,
  lint,
  microFromUsd,
  runQuestionSet,
} from "@sysone/core";
import { type Dataset, type DatasetSnapshot, type EvalCase, casesForSnapshot, takeSnapshot } from "./dataset.js";
import { type CaseOutcome, type EvalMetrics, computeMetrics } from "./metrics.js";
import type { EvalRunRecord, EvalStore, StoredVersion } from "./store.js";

/** Share of cases the stability pass repeats (testing.md). */
export const STABILITY_SAMPLE = 0.1;

export interface EvalRequest {
  org: string;
  set: string;
  version: number;
  dataset: string;
  snapshotId?: string;
  /** Evaluate the version's spec under another model without publishing. */
  model?: string;
  /** Turns on the stability pass; k runs per sampled case. */
  repeats?: number;
  provider: SystemOneProvider;
}

export interface EvalDeps {
  store: EvalStore;
  ports: RunPorts;
  ctx: TenantContext;
  transportKind: "fixture" | "sdk";
  /** Epoch ms, for record timestamps. */
  now: () => number;
  newId: () => string;
  /** Runs in flight at once. Default 4. */
  concurrency?: number;
  /** Stop the repeat pass once the eval has spent this much. Default: no cap. */
  costCapMicroUsd?: number;
}

export interface EvalReport {
  record: EvalRunRecord;
  snapshot: DatasetSnapshot;
  lint: LintResult[];
  metrics: EvalMetrics;
}

export class EvalInputError extends Error {
  override readonly name = "EvalInputError";
}

async function pool<T, R>(items: readonly T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i] as T, i);
    }
  });
  await Promise.all(workers);
  return out;
}

function resolvedFor(v: StoredVersion, spec: QuestionSetSpec, provider: SystemOneProvider): ResolvedRun {
  return {
    spec,
    setId: v.setId,
    version: v.version,
    versionId: v.versionId,
    interfaceMajor: v.interfaceMajor,
    interfaceHash: v.interfaceHash,
    channel: "staging",
    rollout: "shadow",
    settings: {
      dispatchActionsOnStaging: false,
      storageMode: "full",
      piiMode: "off",
      defaultComparatorModel: "claude-haiku-4-5",
      avgEscalationCostMicroUsd: null,
      systemOneProvider: provider,
    },
  };
}

async function runCase(deps: EvalDeps, resolved: ResolvedRun, state: unknown): Promise<{ result: RunResult | null; error: string | null }> {
  try {
    const result = await runQuestionSet(
      deps.ctx,
      { setRef: resolved.setId, state, source: "eval", options: {} },
      resolved,
      deps.ports,
      { signal: new AbortController().signal, budgetMs: latencyBudgetMs("eval") },
    );
    return { result, error: result.status === "ok" ? null : (result.error?.code ?? result.status) };
  } catch (e) {
    if (isRunRefusedError(e)) return { result: null, error: e.code };
    throw e;
  }
}

/** A deterministic sample of about `fraction` of the cases, at least one. */
export function stabilitySample(cases: readonly EvalCase[], fraction = STABILITY_SAMPLE): EvalCase[] {
  if (cases.length === 0) return [];
  const n = Math.max(1, Math.ceil(cases.length * fraction));
  return [...cases].sort((a, b) => (hashJson(a.id) < hashJson(b.id) ? -1 : 1)).slice(0, n);
}

/** The case's state with a throwaway `uid`, as TypeSafe's consistency cookbooks do. */
export function withUid(state: unknown, uid: string): unknown {
  if (state !== null && typeof state === "object" && !Array.isArray(state)) return { ...(state as Record<string, unknown>), uid };
  return null;
}

function fingerprint(r: RunResult): string {
  return JSON.stringify(
    Object.entries(r.decisions)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([id, d]) => [id, d.value, d.band]),
  );
}

function costOf(r: RunResult | null): number {
  return r?.cost.systemOneCostUsd == null ? 0 : microFromUsd(r.cost.systemOneCostUsd);
}

/** Load, snapshot, run, score and record one eval. */
export async function runEval(req: EvalRequest, deps: EvalDeps): Promise<EvalReport> {
  const startedAt = new Date(deps.now()).toISOString();
  const version = await deps.store.getVersion(req.org, req.set, req.version);
  if (version === null) throw new EvalInputError(`no version ${req.version} of set ${req.set} in org ${req.org}`);
  const dataset: Dataset | null = await deps.store.getDataset(req.org, req.dataset);
  if (dataset === null) throw new EvalInputError(`no dataset ${req.dataset} in org ${req.org}`);
  if (req.repeats !== undefined && (!Number.isInteger(req.repeats) || req.repeats < 2)) {
    throw new EvalInputError("--repeats needs a whole number of at least 2 (use 3)");
  }

  let snapshot: DatasetSnapshot;
  if (req.snapshotId !== undefined) {
    const found = await deps.store.getSnapshot(req.org, req.snapshotId);
    if (found === null) throw new EvalInputError(`no snapshot ${req.snapshotId} in org ${req.org}`);
    snapshot = found;
  } else {
    snapshot = takeSnapshot(dataset, deps.newId(), startedAt);
    await deps.store.saveSnapshot(req.org, snapshot);
  }
  let cases: EvalCase[];
  try {
    cases = casesForSnapshot(dataset, snapshot);
  } catch (e) {
    throw new EvalInputError((e as Error).message);
  }

  const spec: QuestionSetSpec = req.model === undefined ? version.spec : { ...version.spec, model: req.model };
  const profile = (await deps.ports.models.get(spec.model)) ?? SEED_MODEL_PROFILES.find((p) => p.id === spec.model) ?? null;
  const lints = lint(spec, profile);
  const resolved = resolvedFor(version, spec, req.provider);
  const concurrency = deps.concurrency ?? 4;

  const outcomes: CaseOutcome[] = await pool(cases, concurrency, async (c) => {
    const { result, error } = await runCase(deps, resolved, c.state);
    return { caseId: c.id, expected: c.expected, result, error };
  });
  let spent = outcomes.reduce((n, o) => n + costOf(o.result), 0);

  let stability: number | null = null;
  if (req.repeats !== undefined) {
    const sample = stabilitySample(cases);
    let stable = 0;
    let measured = 0;
    for (const c of sample) {
      if (deps.costCapMicroUsd !== undefined && spent >= deps.costCapMicroUsd) break;
      const prints: string[] = [];
      for (let i = 0; i < req.repeats; i++) {
        const state = withUid(c.state, `${c.id}-${i + 1}`);
        if (state === null) break;
        const { result } = await runCase(deps, resolved, state);
        spent += costOf(result);
        prints.push(result === null || result.status !== "ok" ? `error:${i}` : fingerprint(result));
      }
      if (prints.length !== req.repeats) continue;
      measured += 1;
      if (prints.every((p) => p === prints[0])) stable += 1;
    }
    stability = measured === 0 ? null : stable / measured;
  }

  const metrics = computeMetrics(spec, outcomes, stability);
  const record: EvalRunRecord = {
    id: deps.newId(),
    org: req.org,
    setSlug: req.set,
    setId: version.setId,
    version: version.version,
    versionId: version.versionId,
    dataset: dataset.name,
    snapshotId: snapshot.id,
    model: spec.model,
    modelOverride: req.model !== undefined && req.model !== version.spec.model,
    provider: req.provider,
    repeats: req.repeats ?? null,
    transport: deps.transportKind,
    status: metrics.okRuns > 0 || cases.length === 0 ? "succeeded" : "failed",
    metrics,
    costMicroUsd: spent,
    startedAt,
    finishedAt: new Date(deps.now()).toISOString(),
  };
  await deps.store.saveEvalRun(record);
  return { record, snapshot, lint: lints, metrics };
}
