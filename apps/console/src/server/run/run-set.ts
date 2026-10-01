// `POST /api/v1/sets/{ref}/run` for the hosted dogfood track (ADR-020, D2b). The bearer token is
// already authenticated; this checks the gates, resolves the set in the caller's tenant
// transaction, and runs it through core's engine on server ports. Runs persist through the RunSink
// (runs, review items, usage events) in their own withTenant transaction.
//
// D2 serves only the `internal` org, in platform key mode: the System One key comes from the
// server env and never from a request. Model facts and prices come from the registry seed, and
// the limiter and quota are open, because D2 has one org and one person. Phase 2 swaps in the
// database registry, the price book and the real limits behind the same ports.

import {
  type JsonValue,
  type PointerChannel,
  type RunDryRunResult,
  type RunOptions,
  type RunPorts,
  type RunResult,
  SEED_COMPARATOR_PRICES,
  SEED_MODEL_PROFILES,
  SEED_MODEL_ROUTES,
  SEED_SYSTEM_ONE_PRICES,
  type SystemOneProvider,
  type SystemOneTransport,
  type TenantContext,
  allowAllLimiter,
  allowAllQuota,
  type MemoryPriceRow,
  createMemoryActionRegistry,
  createMemoryModelCatalog,
  createMemoryPriceBook,
  dryRunQuestionSet,
  isRunRefusedError,
  latencyBudgetMs,
  runQuestionSet,
  staticKeyResolver,
} from "@bandwise/core";
import { type BandwiseDb, createRunSink } from "@bandwise/db";

import { OperationError } from "../operations/errors";
import { resolveRun } from "./resolve";

/** The only org D2 serves (ADR-020). */
export const HOSTED_RUN_ORG_SLUG = "internal";

export interface RunSetDeps {
  db: BandwiseDb;
  transport: SystemOneTransport;
  /** Platform keys from the server env, per provider. Never from a request. */
  platformKeys: Partial<Record<SystemOneProvider, string>>;
  now?: () => number;
  newId?: () => string;
  /** Extra price rows, for tests. */
  prices?: MemoryPriceRow[];
}

export interface RunSetInput {
  ref: string;
  channel?: PointerChannel | undefined;
  state: JsonValue;
  options?: RunOptions | undefined;
}

export function serverRunPorts(deps: RunSetDeps): RunPorts {
  const newId = deps.newId ?? (() => crypto.randomUUID());
  return {
    systemOne: deps.transport,
    models: createMemoryModelCatalog(SEED_MODEL_PROFILES, SEED_MODEL_ROUTES),
    keys: staticKeyResolver(deps.platformKeys, "platform"),
    limiter: allowAllLimiter,
    quota: allowAllQuota,
    runs: createRunSink({ db: deps.db }),
    actions: createMemoryActionRegistry(),
    prices: createMemoryPriceBook([...SEED_SYSTEM_ONE_PRICES, ...SEED_COMPARATOR_PRICES, ...(deps.prices ?? [])]),
    clock: deps.now ?? Date.now,
    newId,
  };
}

/**
 * Run a set for an authenticated caller. Throws OperationError for every refusal, so the route
 * maps one type to the api.md envelope. A run that got a run id comes back as a RunResult, failed
 * or not.
 */
export async function runSetForCaller(
  ctx: TenantContext,
  orgSlug: string,
  input: RunSetInput,
  deps: RunSetDeps,
  signal: AbortSignal = new AbortController().signal,
): Promise<RunResult | RunDryRunResult> {
  if (orgSlug !== HOSTED_RUN_ORG_SLUG) {
    throw new OperationError("not_found", "Hosted runs are open only to the internal org for now.");
  }
  const actor = ctx.actor;
  if ((actor.type === "apiKey" || actor.type === "agent") && !actor.scopes.includes("run")) {
    throw new OperationError("insufficient_scope", "Running a set needs the run scope.", { requiredScope: "run" });
  }

  const resolved = await deps.db.withTenant(ctx, (tx) => resolveRun(tx, ctx, { ref: input.ref, channel: input.channel }));
  const ports = serverRunPorts(deps);
  const req = { setRef: input.ref, state: input.state, source: "api" as const, options: input.options ?? {} };
  try {
    if (req.options.dryRun === true) return await dryRunQuestionSet(ctx, req, resolved, ports);
    return await runQuestionSet(ctx, req, resolved, ports, { signal, budgetMs: latencyBudgetMs("api") });
  } catch (e) {
    if (isRunRefusedError(e)) throw new OperationError(e.code, e.message, e.details === undefined ? {} : { details: e.details });
    throw e;
  }
}
