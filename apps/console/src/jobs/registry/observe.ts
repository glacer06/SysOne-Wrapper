// Alias observation (system-one-models.md section 6): a moving name answered by a concrete build.
// Runs, the nightly probe and the OpenRouter listing all report here.
//
// - Records (provider, alias, resolved) in model_alias_observations.
// - When the build differs from the last one seen (or it is the first), emits model.alias_moved
//   once per org with live sets on that alias, and on TypeSafe updates the alias row's aliasTarget.
// - A TypeSafe build the registry has never seen is inserted as unreviewed.
// - An OpenRouter build no route row knows alerts the platform admin to add it to resolvedIds.
// OpenRouter's aliases are tracked apart from TypeSafe's, so their aliasTarget is never written
// to the profile.

import { ModelProfile, type SystemOneProvider, registryIdForResolved } from "@sysone/core";
import type { AlertSink, EventSink, RegistryStore } from "./ports";

export interface ObserveDeps {
  store: RegistryStore;
  events: EventSink;
  alerts: AlertSink;
}

export interface AliasObservationInput {
  provider: SystemOneProvider;
  /** The registry name that was requested, for example "jev-latest". */
  alias: string;
  /** The response `model` as sent: "jev-1.13.0", or "typesafe/jev-1.13-20260917" on OpenRouter. */
  resolved: string;
  at: Date;
}

export interface AliasObservationOutcome {
  /** False when the name is not an alias row; nothing is recorded. */
  recorded: boolean;
  moved: boolean;
  fromResolvedId: string | null;
  insertedUnreviewed: boolean;
}

const MODELS_DOCS = "https://docs.typesafe.ai/models.md";

/** The row the registry sync or an observation inserts for an unseen name (section 4). */
export function unreviewedProfile(id: string, at: Date, releaseDate: string | null = null): ModelProfile {
  return ModelProfile.parse({
    id,
    family: id.split(/[-/]/)[0] || id,
    // Unseen names are moving until the platform admin reviews them.
    kind: "alias",
    aliasTarget: null,
    status: "unreviewed",
    releaseDate: releaseDate !== null && /^\d{4}-\d{2}-\d{2}$/.test(releaseDate) ? releaseDate : null,
    retireAt: null,
    questionTypes: [],
    limits: null,
    inputModalities: [],
    weaknesses: [],
    supersedes: [],
    docsUrl: MODELS_DOCS,
    jaggednessUrl: null,
    lastReviewed: at.toISOString().slice(0, 10),
  });
}

/** Insert an unseen TypeSafe name as unreviewed, emit model.unreviewed and alert. */
export async function insertUnseen(
  deps: ObserveDeps,
  id: string,
  at: Date,
  seenVia: "list" | "observation",
  releaseDate: string | null = null,
): Promise<boolean> {
  const inserted = await deps.store.insertUnreviewed(unreviewedProfile(id, at, releaseDate));
  if (!inserted) return false;
  await deps.events.emit({ type: "model.unreviewed", orgId: null, subject: { type: "model", id }, data: { modelId: id, seenVia } });
  await deps.alerts.alert("model_unreviewed", `New System One model ${id} was inserted as unreviewed. Review it on the platform Models page.`, { modelId: id, seenVia });
  return true;
}

export async function observeAlias(deps: ObserveDeps, o: AliasObservationInput): Promise<AliasObservationOutcome> {
  const profiles = await deps.store.profiles();
  const row = profiles.find((p) => p.id === o.alias);
  if (row === undefined || row.kind !== "alias") {
    return { recorded: false, moved: false, fromResolvedId: null, insertedUnreviewed: false };
  }

  const previous = await deps.store.latestObservation(o.provider, o.alias);
  await deps.store.recordObservation(o.provider, o.alias, o.resolved, o.at);
  const moved = previous === null || previous.resolvedId !== o.resolved;
  const fromResolvedId = moved ? (previous?.resolvedId ?? null) : null;

  let insertedUnreviewed = false;
  if (o.provider === "typesafe") {
    if (!profiles.some((p) => p.id === o.resolved)) insertedUnreviewed = await insertUnseen(deps, o.resolved, o.at, "observation");
    if (row.aliasTarget !== o.resolved) await deps.store.setAliasTarget(o.alias, o.resolved);
  } else if (registryIdForResolved(o.provider, o.resolved, await deps.store.routes(o.provider)) === null) {
    await deps.alerts.alert(
      "alias_resolved_unmapped",
      `${o.provider} answered ${o.alias} with ${o.resolved}, which no route row lists. Add it to the route's resolvedIds after review.`,
      { provider: o.provider, alias: o.alias, resolved: o.resolved },
    );
  }

  if (moved) {
    for (const { orgId, setIds } of await deps.store.setsUsingModel(o.alias, o.provider)) {
      await deps.events.emit({
        type: "model.alias_moved",
        orgId,
        subject: { type: "model", id: o.alias },
        data: { provider: o.provider, alias: o.alias, fromResolvedId, toResolvedId: o.resolved, affectedSetIds: setIds },
      });
    }
  }
  return { recorded: true, moved, fromResolvedId, insertedUnreviewed };
}
