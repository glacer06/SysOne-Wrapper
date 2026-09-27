// What the registry jobs read and write (system-one-models.md section 6, Detection; ADR-005).
//
// Each job is a plain async function over these ports, so it runs in unit tests with in-memory
// stores and recorded HTTP, and the runner (Inngest, Phase 2) only wraps it. The Postgres adapter
// maps them onto system_one_models, system_one_model_routes, model_alias_observations,
// org_system_one_keys.models and price_books as the sysone_platform role; it lands with the runner.

import type { EventData, ModelProfile, ModelRoute, SystemOneProvider } from "@sysone/core";

/** A fetch the jobs call for HTTP that is not a System One request. Tests pass a replayer. */
export type HttpFetch = (url: string, init?: { method?: string; headers?: Record<string, string>; signal?: AbortSignal }) => Promise<Response>;

/** One row of model_alias_observations. */
export interface AliasObservationRow {
  provider: SystemOneProvider;
  alias: string;
  resolvedId: string;
  firstSeen: Date;
  lastSeen: Date;
}

export interface RegistryStore {
  profiles(): Promise<ModelProfile[]>;
  routes(provider: SystemOneProvider): Promise<ModelRoute[]>;
  /** Insert a row the registry has never seen. A no-op when the id already exists. */
  insertUnreviewed(profile: ModelProfile): Promise<boolean>;
  /** Set a TypeSafe alias row's last observed versioned id. */
  setAliasTarget(id: string, target: string): Promise<void>;
  /** The newest observation for an alias on a provider, by lastSeen. */
  latestObservation(provider: SystemOneProvider, alias: string): Promise<AliasObservationRow | null>;
  /** Upsert (provider, alias, resolvedId) and bump lastSeen. True when the row is new. */
  recordObservation(provider: SystemOneProvider, alias: string, resolvedId: string, at: Date): Promise<boolean>;
  /** org_system_one_keys.models for one org and provider. */
  setKeyModels(orgId: string, provider: SystemOneProvider, models: string[]): Promise<void>;
  /** Whether a platform price row exists for an exact model id. */
  hasPrice(modelId: string, provider: SystemOneProvider): Promise<boolean>;
  /** Live sets whose spec model is this name, grouped by org, for model.alias_moved. */
  setsUsingModel(model: string, provider: SystemOneProvider): Promise<Array<{ orgId: string; setIds: string[] }>>;
}

/** The events these jobs emit. model.alias_moved is a tenant event; the other two are platform-only. */
export type RegistryEvent =
  | { type: "model.alias_moved"; orgId: string; subject: { type: "model"; id: string }; data: EventData<"model.alias_moved"> }
  | { type: "model.unreviewed"; orgId: null; subject: { type: "model"; id: string }; data: EventData<"model.unreviewed"> }
  | { type: "contract.changed"; orgId: null; subject: { type: "contract"; id: string }; data: EventData<"contract.changed"> };

/** Writes events to the feed (events.md). The adapter adds id, occurredAt and the system actor. */
export interface EventSink {
  emit(event: RegistryEvent): Promise<void>;
}

export type AlertKind =
  | "model_unreviewed"
  | "route_missing"
  | "stable_model_unpriced"
  | "alias_resolved_unmapped"
  | "listing_failed"
  | "probe_failed"
  | "contract_changed"
  | "contract_fetch_failed";

/** Platform admin alerts. */
export interface AlertSink {
  alert(kind: AlertKind, message: string, details?: Record<string, unknown>): Promise<void>;
}

/** Opens a tracking issue (contract watch). The adapter files it in the repo. */
export interface IssueSink {
  open(issue: { title: string; body: string }): Promise<void>;
}

/** ADR-005's small steps interface: a named, retryable unit. In memory it just runs the function. */
export interface JobSteps {
  run<T>(name: string, fn: () => Promise<T>): Promise<T>;
}

export const inlineSteps: JobSteps = {
  run: (_name, fn) => fn(),
};
