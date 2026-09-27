// Alias probe (system-one-models.md section 6, Active probe). Nightly: each alias with no
// observation that UTC day gets a one-noul request with a tiny state, and the response `model` is
// recorded like a run. Off TypeSafe, only aliases with a route row are probed, sent as the route id.

import { type SystemOneProvider, type SystemOneTransport, isTransportError, resolveRoute } from "@bandwise/core";
import { probeAlias } from "@bandwise/system-one-client";
import { type AliasObservationOutcome, type ObserveDeps, observeAlias } from "./observe";
import { type JobSteps, inlineSteps } from "./ports";

export interface AliasProbeDeps extends ObserveDeps {
  transport: SystemOneTransport;
  steps?: JobSteps;
}

export interface AliasProbeInput {
  provider: SystemOneProvider;
  apiKey: string;
  now: Date;
}

export interface AliasProbeResult {
  probed: Array<{ alias: string; resolved: string; outcome: AliasObservationOutcome }>;
  /** Aliases seen today already, or with no route on this provider. */
  skipped: Array<{ alias: string; reason: "seen_today" | "no_route" | "retired" }>;
  failed: Array<{ alias: string; code: string }>;
}

const utcDay = (d: Date): string => d.toISOString().slice(0, 10);

export async function probeIdleAliases(deps: AliasProbeDeps, input: AliasProbeInput): Promise<AliasProbeResult> {
  const steps = deps.steps ?? inlineSteps;
  const result: AliasProbeResult = { probed: [], skipped: [], failed: [] };
  const profiles = await deps.store.profiles();
  const routes = await deps.store.routes(input.provider);

  for (const p of profiles.filter((x) => x.kind === "alias").sort((a, b) => (a.id < b.id ? -1 : 1))) {
    if (p.status === "retired") {
      result.skipped.push({ alias: p.id, reason: "retired" });
      continue;
    }
    const route = resolveRoute(p, input.provider, routes);
    if (route === null) {
      result.skipped.push({ alias: p.id, reason: "no_route" });
      continue;
    }
    const last = await deps.store.latestObservation(input.provider, p.id);
    if (last !== null && utcDay(last.lastSeen) === utcDay(input.now)) {
      result.skipped.push({ alias: p.id, reason: "seen_today" });
      continue;
    }
    try {
      const obs = await steps.run(`probe:${p.id}`, () =>
        probeAlias(deps.transport, {
          alias: p.id,
          sendAs: route.providerModelId,
          provider: input.provider,
          apiKey: input.apiKey,
          signal: AbortSignal.timeout(15_000),
        }),
      );
      const outcome = await steps.run(`observe:${p.id}`, () => observeAlias(deps, { provider: input.provider, alias: p.id, resolved: obs.resolved, at: input.now }));
      result.probed.push({ alias: p.id, resolved: obs.resolved, outcome });
    } catch (e) {
      const code = isTransportError(e) ? e.code : "unknown";
      result.failed.push({ alias: p.id, code });
      await deps.alerts.alert("probe_failed", `Probe of ${p.id} on ${input.provider} failed with ${code}.`, { alias: p.id, provider: input.provider, code });
    }
  }
  return result;
}
