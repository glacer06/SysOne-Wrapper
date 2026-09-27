// RunPorts for evals: core's in-memory ports, the seed registry and price book, and a transport.
// Offline evals use the fixture transport; a live eval uses the SDK transport and a key from env.

import {
  type ModelProfile,
  type ModelRoute,
  type RunPorts,
  SEED_COMPARATOR_PRICES,
  SEED_MODEL_PROFILES,
  SEED_MODEL_ROUTES,
  SEED_SYSTEM_ONE_PRICES,
  type SystemOneProvider,
  type SystemOneTransport,
  type TenantContext,
  allowAllLimiter,
  allowAllQuota,
  createMemoryActionRegistry,
  createMemoryModelCatalog,
  createMemoryPriceBook,
  createMemoryRunSink,
  staticKeyResolver,
} from "@sysone/core";
import { FixtureTransport, loadBundledFixtures } from "@sysone/system-one-client/fixture";

/** The org id evals run under when the store has no real org ids (folder and memory stores). */
export const EVAL_ORG_ID = "00000000-0000-7000-8000-0000000e7a1f";

export function evalContext(orgId = EVAL_ORG_ID): TenantContext {
  return { orgId, actor: { type: "system" }, client: "job", plan: "internal", requestId: "eval" };
}

/** Env var that holds the platform key for each provider (CLAUDE.md, Env vars). */
export const PROVIDER_KEY_ENV = {
  typesafe: "TYPESAFE_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
} as const satisfies Record<SystemOneProvider, string>;

/**
 * The id a synthetic fixture answer reports as its model: an alias's observed target on TypeSafe,
 * or the route's dated build on OpenRouter. Recorded fixtures report their own model.
 */
export function syntheticResolvedModel(
  profiles: readonly ModelProfile[] = SEED_MODEL_PROFILES,
  routes: readonly ModelRoute[] = SEED_MODEL_ROUTES,
): (sent: string, provider: SystemOneProvider) => string {
  const aliasTarget = (id: string): string | null => profiles.find((p) => p.id === id)?.aliasTarget ?? null;
  return (sent, provider) => {
    if (provider === "typesafe") return aliasTarget(sent) ?? sent;
    const route = routes.find((r) => r.provider === provider && r.providerModelId === sent);
    if (route === undefined) return sent;
    const target = aliasTarget(route.modelId);
    return route.resolvedIds[0] ?? routes.find((r) => r.provider === provider && r.modelId === target)?.resolvedIds[0] ?? sent;
  };
}

/** The offline transport: bundled fixtures first, deterministic synthetic answers for the rest. */
export function offlineTransport(): FixtureTransport {
  return new FixtureTransport(loadBundledFixtures(), { synthesize: true, resolveModel: syntheticResolvedModel() });
}

export interface EvalPortsOptions {
  transport: SystemOneTransport;
  /** API key per provider. The fixture transport needs only a placeholder. */
  keys: Partial<Record<SystemOneProvider, string>>;
  clock: () => number;
  newId: () => string;
  profiles?: readonly ModelProfile[];
  routes?: readonly ModelRoute[];
}

export function createEvalPorts(o: EvalPortsOptions): RunPorts {
  return {
    systemOne: o.transport,
    models: createMemoryModelCatalog(o.profiles ?? SEED_MODEL_PROFILES, o.routes ?? SEED_MODEL_ROUTES),
    keys: staticKeyResolver(o.keys, "platform"),
    limiter: allowAllLimiter,
    quota: allowAllQuota,
    runs: createMemoryRunSink(o.newId),
    // No handler is enabled: an eval never dispatches an action.
    actions: createMemoryActionRegistry(),
    prices: createMemoryPriceBook([...SEED_SYSTEM_ONE_PRICES, ...SEED_COMPARATOR_PRICES]),
    clock: o.clock,
    newId: o.newId,
  };
}
