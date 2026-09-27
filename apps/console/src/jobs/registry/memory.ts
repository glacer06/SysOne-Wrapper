// In-memory registry ports for tests and local runs of the registry jobs.

import type { ModelProfile, ModelRoute, SystemOneProvider } from "@sysone/core";
import type { AlertKind, AlertSink, AliasObservationRow, EventSink, IssueSink, RegistryEvent, RegistryStore } from "./ports";

export interface MemoryRegistryStore extends RegistryStore {
  readonly rows: Map<string, ModelProfile>;
  readonly observations: AliasObservationRow[];
  readonly keyModels: Map<string, string[]>;
}

export function createMemoryRegistryStore(seed: {
  profiles: readonly ModelProfile[];
  routes?: readonly ModelRoute[];
  prices?: ReadonlyArray<{ model: string; provider?: SystemOneProvider }>;
  sets?: ReadonlyArray<{ orgId: string; setId: string; model: string; provider?: SystemOneProvider }>;
  observations?: readonly AliasObservationRow[];
}): MemoryRegistryStore {
  const rows = new Map(seed.profiles.map((p) => [p.id, structuredClone(p)]));
  const observations: AliasObservationRow[] = (seed.observations ?? []).map((o) => ({ ...o }));
  const keyModels = new Map<string, string[]>();
  return {
    rows,
    observations,
    keyModels,
    async profiles() {
      return [...rows.values()];
    },
    async routes(provider) {
      return (seed.routes ?? []).filter((r) => r.provider === provider);
    },
    async insertUnreviewed(profile) {
      if (rows.has(profile.id)) return false;
      rows.set(profile.id, profile);
      return true;
    },
    async setAliasTarget(id, target) {
      const row = rows.get(id);
      if (row !== undefined && row.kind === "alias") rows.set(id, { ...row, aliasTarget: target });
    },
    async latestObservation(provider, alias) {
      const mine = observations.filter((o) => o.provider === provider && o.alias === alias);
      return mine.sort((a, b) => b.lastSeen.getTime() - a.lastSeen.getTime())[0] ?? null;
    },
    async recordObservation(provider, alias, resolvedId, at) {
      const row = observations.find((o) => o.provider === provider && o.alias === alias && o.resolvedId === resolvedId);
      if (row !== undefined) {
        if (at > row.lastSeen) row.lastSeen = at;
        return false;
      }
      observations.push({ provider, alias, resolvedId, firstSeen: at, lastSeen: at });
      return true;
    },
    async setKeyModels(orgId, provider, models) {
      keyModels.set(`${orgId}:${provider}`, [...models]);
    },
    async hasPrice(modelId, provider) {
      return (seed.prices ?? []).some((p) => p.model === modelId && (p.provider === undefined || p.provider === provider));
    },
    async setsUsingModel(model, provider) {
      const byOrg = new Map<string, string[]>();
      for (const s of seed.sets ?? []) {
        if (s.model !== model || (s.provider ?? "typesafe") !== provider) continue;
        byOrg.set(s.orgId, [...(byOrg.get(s.orgId) ?? []), s.setId]);
      }
      return [...byOrg].map(([orgId, setIds]) => ({ orgId, setIds }));
    },
  };
}

export interface Recorder extends EventSink, AlertSink, IssueSink {
  readonly events: RegistryEvent[];
  readonly alerts: Array<{ kind: AlertKind; message: string; details?: Record<string, unknown> }>;
  readonly issues: Array<{ title: string; body: string }>;
}

/** Events, alerts and issues kept in arrays. */
export function createRecorder(): Recorder {
  const events: RegistryEvent[] = [];
  const alerts: Recorder["alerts"] = [];
  const issues: Recorder["issues"] = [];
  return {
    events,
    alerts,
    issues,
    async emit(e) {
      events.push(e);
    },
    async alert(kind, message, details) {
      alerts.push(details === undefined ? { kind, message } : { kind, message, details });
    },
    async open(issue) {
      issues.push(issue);
    },
  };
}
