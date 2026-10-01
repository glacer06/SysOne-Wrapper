// `POST /api/v1/sets/{ref}/run` for the hosted dogfood track (ADR-020, D2b). The bearer token is
// already authenticated; this checks the gates, resolves the set in the caller's tenant
// transaction, and runs it through core's engine on server ports. Runs persist through the RunSink
// (runs, review items, usage events) in their own withTenant transaction.
//
// D2 serves only the `internal` org, in platform key mode: the System One key comes from the
// server env and never from a request. Model facts and prices come from the registry seed. The
// limiter and quota are per caller (limits.ts): a run rate and a daily spend cap per token, key or
// console user, shared through the database. Phase 2 swaps in the database registry, the price
// book and the plan limits behind the same ports.

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
import { chargeRunSpend, createDbRunLimiter, createDbSpendQuota, HOSTED_RUN_LIMITS, type HostedRunLimits } from "./limits";
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
  /** The per-caller run rate and daily spend cap. Default HOSTED_RUN_LIMITS; tests lower them. */
  limits?: HostedRunLimits;
}

export interface RunSetInput {
  ref: string;
  channel?: PointerChannel | undefined;
  state: JsonValue;
  options?: RunOptions | undefined;
  /** Set by the surface, never from a request body. Default "api". */
  source?: "api" | "console" | undefined;
}

export function serverRunPorts(deps: RunSetDeps): RunPorts {
  const newId = deps.newId ?? (() => crypto.randomUUID());
  const clock = deps.now ?? Date.now;
  const limits = deps.limits ?? HOSTED_RUN_LIMITS;
  return {
    systemOne: deps.transport,
    models: createMemoryModelCatalog(SEED_MODEL_PROFILES, SEED_MODEL_ROUTES),
    keys: staticKeyResolver(deps.platformKeys, "platform"),
    limiter: createDbRunLimiter(deps.db, limits, clock),
    quota: createDbSpendQuota(deps.db, limits, clock),
    runs: chargeRunSpend(createRunSink({ db: deps.db }), deps.db, clock),
    actions: createMemoryActionRegistry(),
    prices: createMemoryPriceBook([...SEED_SYSTEM_ONE_PRICES, ...SEED_COMPARATOR_PRICES, ...(deps.prices ?? [])]),
    clock,
    newId,
  };
}

/**
 * The caller gates, before anything about the request is read: the internal org only (any other
 * org gets the same 404 as a missing set), and the run scope for tokens.
 */
export function assertRunCaller(ctx: TenantContext, orgSlug: string): void {
  if (orgSlug !== HOSTED_RUN_ORG_SLUG) {
    throw new OperationError("not_found", "Hosted runs are open only to the internal org for now.");
  }
  const actor = ctx.actor;
  if ((actor.type === "apiKey" || actor.type === "agent") && !actor.scopes.includes("run")) {
    throw new OperationError("insufficient_scope", "Running a set needs the run scope.", { requiredScope: "run" });
  }
}

/** Run statuses that are a limit refusal: the api.md error envelope (429 or 402), not a 200. */
const LIMIT_STATUSES: ReadonlySet<RunResult["status"]> = new Set(["rate_limited", "quota_exceeded"]);

/**
 * Run a set for an authenticated caller. Throws OperationError for every refusal, so the route
 * maps one type to the api.md envelope. A run refused by the rate limit or the spend cap is
 * stored, then answered as rate_limited (429) or token_budget_exceeded (402) with its run id.
 * Any other run that got a run id comes back as a RunResult, failed or not.
 */
export async function runSetForCaller(
  ctx: TenantContext,
  orgSlug: string,
  input: RunSetInput,
  deps: RunSetDeps,
  signal: AbortSignal = new AbortController().signal,
): Promise<RunResult | RunDryRunResult> {
  // Checked again here so no other caller of this function can skip the gates.
  assertRunCaller(ctx, orgSlug);

  const resolved = await deps.db.withTenant(ctx, (tx) => resolveRun(tx, ctx, { ref: input.ref, channel: input.channel }));
  const ports = serverRunPorts(deps);
  const req = { setRef: input.ref, state: input.state, source: input.source ?? "api", options: input.options ?? {} };
  try {
    if (req.options.dryRun === true) return await dryRunQuestionSet(ctx, req, resolved, ports);
    const result = await runQuestionSet(ctx, req, resolved, ports, { signal, budgetMs: latencyBudgetMs("api") });
    if (LIMIT_STATUSES.has(result.status) && result.error !== undefined) {
      throw new OperationError(result.error.code, result.error.message, { runId: result.runId });
    }
    return result;
  } catch (e) {
    if (isRunRefusedError(e)) throw new OperationError(e.code, e.message, e.details === undefined ? {} : { details: e.details });
    throw e;
  }
}
