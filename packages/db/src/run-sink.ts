// RunSink over the repositories: the run row, action review items, label items, usage events and
// the model_alias_observations update, in one withTenant transaction (ports.ts, RunSink).
//
// Usage events follow ADR-006: `run` (or `eval_run` for eval sources) for every successful run,
// `system_one_cost` in platform key mode when the run has a System One cost, `llm_cost` when the
// run paid for escalations. Every row carries the resolved model and the provider.

import {
  type Actor,
  type Decision,
  type LabelingPolicy,
  LabelingPolicy as LabelingPolicySchema,
  type LabelSelection,
  microFromUsd,
  type RunSink,
  RunSinkRecord,
  type RunSinkResult,
  type TenantContext,
} from "@bandwise/core/contracts";

import type { BandwiseDb } from "./client.js";
import type { TenantTx } from "./internal/drizzle.js";
import { platformRepositories, repos } from "./repos/index.js";

export interface LabelSelectorInput {
  setId: string;
  decisionId: string;
  decision: Decision;
  policy: LabelingPolicy;
  /** Label items already created for this set today (UTC). */
  labeledToday: number;
  rand: () => number;
}

/**
 * core/learning `selectForLabeling` (Quality / Learning lane). The sink passes its day counter and
 * an injected rand; null or `select: false` picks nothing.
 */
export type LabelSelector = (input: LabelSelectorInput) => LabelSelection | null;

export interface RunSinkDeps {
  db: BandwiseDb;
  /** Defaults to the wall clock. Tests inject a fixed time. */
  clock?: () => Date;
  /** Defaults to Math.random. Tests inject a sequence. */
  rand?: () => number;
  /** Missing until core/learning ships selectForLabeling: the sink then creates no label items. */
  selectForLabeling?: LabelSelector;
  /**
   * Runs last, in the run's own transaction, so what it writes (the hosted spend charge) commits
   * or rolls back with the run row. A throw here rolls the run back too.
   */
  onPersist?: (tx: TenantTx, ctx: TenantContext, record: RunSinkRecord) => Promise<void>;
}

/** Thrown when the run's set is not in the caller's org. Callers map it to 404. */
export class RunSinkSetNotFoundError extends Error {
  override readonly name = "RunSinkSetNotFoundError";
  readonly code = "not_found";
}

interface ActorColumns {
  actorUserId: string | null;
  actorTokenId: string | null;
  appId: string | null;
}

function actorColumns(actor: Actor): ActorColumns {
  switch (actor.type) {
    case "user":
      return { actorUserId: actor.userId, actorTokenId: null, appId: null };
    case "agent":
      return { actorUserId: actor.userId, actorTokenId: actor.tokenId, appId: null };
    case "apiKey":
      return { actorUserId: null, actorTokenId: null, appId: actor.appId };
    case "system":
      return { actorUserId: null, actorTokenId: null, appId: null };
  }
}

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function micro(usd: number | null | undefined): number | null {
  return usd === null || usd === undefined ? null : microFromUsd(usd);
}

export function createRunSink(deps: RunSinkDeps): RunSink {
  const clock = deps.clock ?? (() => new Date());
  const rand = deps.rand ?? Math.random;

  async function persistIn(tx: TenantTx, ctx: TenantContext, record: RunSinkRecord): Promise<RunSinkResult> {
    const { result } = record;
    const now = clock();
    const set = await repos.questionSets.get(tx, result.setId);
    if (set === null) throw new RunSinkSetNotFoundError(`set ${result.setId} not found`);

    const cost = result.cost;
    const systemOneCostMicroUsd = micro(cost.systemOneCostUsd);
    const escalationCostMicroUsd = microFromUsd(cost.escalationCostUsd);
    const calls = result.stages.flatMap((st) => st.calls);

    await repos.runs.insert(tx, {
      id: result.runId,
      projectId: set.projectId,
      setId: result.setId,
      versionId: result.versionId,
      channel: result.channel,
      rollout: result.rollout,
      experimentId: result.experiment?.id ?? null,
      arm: result.experiment?.arm ?? null,
      source: record.request.source,
      ...actorColumns(ctx.actor),
      keyMode: record.keyMode,
      systemOneProvider: record.provider,
      parentRunId: record.parentRunId,
      modelRequested: result.modelRequested,
      modelResolved: result.modelResolved,
      typesafeRequestId: result.typesafeRequestId,
      interfaceMajor: result.interfaceMajor,
      externalRef: record.request.options.externalRef ?? null,
      state: record.state === null ? null : (record.state as never),
      stateHash: record.stateHash,
      stages: result.stages,
      checks: result.checks,
      answers: result.answers,
      decisions: result.decisions,
      runBand: result.runBand,
      overallAction: result.overallAction,
      route: result.route,
      warnings: result.warnings,
      inputTokens: cost.systemOneInputTokens,
      outputTokens: cost.systemOneOutputTokens,
      systemOneCostMicroUsd,
      systemOneCalls: calls.length,
      cfInputTokens: cost.counterfactualInputTokens,
      cfOutputTokens: cost.counterfactualOutputTokens,
      counterfactualMicroUsd: microFromUsd(cost.counterfactualLlmCostUsd),
      counterfactualMode: cost.counterfactualMode,
      comparatorModel: cost.comparatorModel,
      savingsMicroUsd: microFromUsd(cost.savingsUsd),
      savingsKind: cost.savingsKind,
      savingsSuppressed: cost.savingsSuppressed,
      escalationCostMicroUsd,
      llmCallsMade: cost.llmCallsMade,
      llmCallsAvoided: cost.llmCallsAvoided,
      contextTokensPruned: cost.contextTokensPruned ?? null,
      latencyMs: cost.latencyMs,
      status: result.status,
      errorCode: result.error?.code ?? null,
      createdAt: now,
    });

    // Action items: exactly the relevant decisions whose effectiveAction is review.
    const actionItems = new Map<string, string>();
    for (const [decisionId, d] of Object.entries(result.decisions)) {
      if (!d.relevant || d.effectiveAction !== "review") continue;
      const item = await repos.reviewItems.insert(tx, {
        runId: result.runId,
        setId: result.setId,
        decisionId,
        kind: "action",
        reason: "action",
        band: d.band,
        suggested: { value: d.value },
      });
      actionItems.set(decisionId, item.id);
    }

    // Label items: the labeling policy runs on the production channel only.
    const labelItemIds: string[] = [];
    const selector = deps.selectForLabeling;
    if (selector !== undefined && result.channel === "production" && result.status === "ok") {
      const policy = LabelingPolicySchema.parse(set.labeling);
      let labeledToday = await repos.reviewItems.countLabelItemsSince(tx, result.setId, startOfUtcDay(now));
      for (const [decisionId, d] of Object.entries(result.decisions)) {
        if (!d.relevant) continue;
        const pick = selector({ setId: result.setId, decisionId, decision: d, policy, labeledToday, rand });
        if (pick === null || !pick.select) continue;
        labeledToday += 1;
        const reused = actionItems.get(decisionId);
        if (reused !== undefined) {
          // The audit reuses the action item and records its rate; targeted picks add nothing.
          if (pick.sampleRate !== null) await repos.reviewItems.update(tx, reused, { sampleRate: pick.sampleRate });
          continue;
        }
        const item = await repos.reviewItems.insert(tx, {
          runId: result.runId,
          setId: result.setId,
          decisionId,
          kind: "label",
          reason: pick.reason,
          sampleRate: pick.sampleRate,
          band: d.band,
          suggested: { value: d.value },
        });
        labelItemIds.push(item.id);
      }
    }

    // Usage events (ADR-006).
    const model = result.modelResolved ?? result.modelRequested;
    const usage = [];
    if (result.status === "ok") {
      usage.push({ kind: record.request.source === "eval" ? ("eval_run" as const) : ("run" as const), quantity: 1, model });
    }
    if (record.keyMode === "platform" && systemOneCostMicroUsd !== null && systemOneCostMicroUsd > 0) {
      usage.push({ kind: "system_one_cost" as const, quantity: systemOneCostMicroUsd, model });
    }
    if (escalationCostMicroUsd > 0) {
      const escalationModel =
        Object.values(result.decisions).find((d) => d.escalation !== undefined)?.escalation?.model ??
        cost.comparatorModel;
      usage.push({ kind: "llm_cost" as const, quantity: escalationCostMicroUsd, model: escalationModel });
    }
    await repos.usageEvents.insertMany(
      tx,
      usage.map((u) => ({
        runId: result.runId,
        kind: u.kind,
        model: u.model,
        provider: record.provider,
        quantity: u.quantity,
        keyMode: record.keyMode,
        createdAt: now,
      })),
    );

    // Alias observations: a moving name answered by a concrete build.
    const requested = await platformRepositories.systemOneModels.get(tx, result.modelRequested);
    if (requested !== null && requested.kind === "alias") {
      const resolved = new Set(calls.map((c) => c.modelResolved));
      for (const id of resolved) {
        await platformRepositories.modelAliasObservations.record(tx, record.provider, result.modelRequested, id, now);
      }
    }

    if (deps.onPersist !== undefined) await deps.onPersist(tx, ctx, record);
    return { reviewItemIds: [...actionItems.values()], labelItemIds };
  }

  return {
    async persist(ctx, record) {
      const parsed = RunSinkRecord.parse(record);
      return deps.db.withTenant(ctx, (tx) => persistIn(tx, ctx, parsed));
    },
  };
}
