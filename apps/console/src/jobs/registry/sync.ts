// Registry sync (system-one-models.md section 6, Listing; architecture.md, Background jobs).
// Nightly per org key and provider, and when a key is saved or rotated.
//
// - TypeSafe keys: GET /v1/models through the SDK (system-one-client's listModels).
// - OpenRouter keys: OpenRouter's Models API for typesafe/* and ~typesafe/* entries, mapped to
//   registry ids through the route rows. The SDK's models.list() fails there.
// Unseen TypeSafe names are inserted as unreviewed. An OpenRouter id with no route row alerts the
// platform admin. The key's reachable registry ids go into org_system_one_keys.models: every listed
// id, plus the observed target of each listed alias (section 3, Reachability).

import { type SystemOneProvider, registryIdForResolved } from "@sysone/core";
import { listModels } from "@sysone/system-one-client";
import { type ObserveDeps, insertUnseen, observeAlias } from "./observe";
import { aliasBuild, fetchOpenRouterSystemOneModels } from "./openrouter-models";
import { type HttpFetch, type JobSteps, inlineSteps } from "./ports";

export interface RegistrySyncDeps extends ObserveDeps {
  /** HTTP for both listings. Tests pass a replayer of recorded responses. */
  fetch: HttpFetch;
  steps?: JobSteps;
}

export interface RegistrySyncInput {
  orgId: string;
  provider: SystemOneProvider;
  apiKey: string;
  now: Date;
}

export interface RegistrySyncResult {
  ok: boolean;
  /** Names or ids as the provider listed them. */
  listed: string[];
  /** Registry ids written to org_system_one_keys.models. */
  reachable: string[];
  insertedUnreviewed: string[];
  /** OpenRouter ids with no route row. */
  unmapped: string[];
  error?: string;
}

async function listTypesafe(deps: RegistrySyncDeps, input: RegistrySyncInput): Promise<Array<{ id: string; releaseDate: string | null }>> {
  const cards = await listModels("typesafe", input.apiKey, {
    fetch: deps.fetch as unknown as NonNullable<Parameters<typeof listModels>[2]>["fetch"],
    timeoutMs: 15_000,
  });
  return cards.map((c) => ({ id: c.name, releaseDate: c.release_date }));
}

export async function registrySync(deps: RegistrySyncDeps, input: RegistrySyncInput): Promise<RegistrySyncResult> {
  const steps = deps.steps ?? inlineSteps;
  const result: RegistrySyncResult = { ok: true, listed: [], reachable: [], insertedUnreviewed: [], unmapped: [] };
  const listedIds = new Set<string>();

  try {
    if (input.provider === "typesafe") {
      const cards = await steps.run("list", () => listTypesafe(deps, input));
      const known = new Set((await deps.store.profiles()).map((p) => p.id));
      for (const c of cards) {
        result.listed.push(c.id);
        listedIds.add(c.id);
        if (!known.has(c.id) && (await insertUnseen(deps, c.id, input.now, "list", c.releaseDate))) result.insertedUnreviewed.push(c.id);
      }
    } else {
      const entries = await steps.run("list", () => fetchOpenRouterSystemOneModels(deps.fetch));
      const routes = await deps.store.routes(input.provider);
      for (const e of entries) {
        result.listed.push(e.id);
        const id = registryIdForResolved(input.provider, e.id, routes) ?? (e.canonicalSlug === null ? null : registryIdForResolved(input.provider, e.canonicalSlug, routes));
        if (id === null) {
          result.unmapped.push(e.id);
          await deps.alerts.alert("route_missing", `OpenRouter lists ${e.id}, but no ${input.provider} route row maps it to a registry model. Add one after review.`, {
            provider: input.provider,
            providerModelId: e.id,
            canonicalSlug: e.canonicalSlug,
            contextLength: e.contextLength,
          });
          continue;
        }
        listedIds.add(id);
        // OpenRouter shows each alias's current target, so a move is seen even with no traffic.
        const build = aliasBuild(e, entries);
        if (build !== null) await steps.run(`observe:${id}`, () => observeAlias(deps, { provider: input.provider, alias: id, resolved: build, at: input.now }));
      }
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await deps.alerts.alert("listing_failed", `Model listing for ${input.provider} failed: ${message}`, { orgId: input.orgId, provider: input.provider });
    return { ...result, ok: false, error: message };
  }

  const profiles = await deps.store.profiles();
  const reachable = new Set(listedIds);
  for (const id of listedIds) {
    const row = profiles.find((p) => p.id === id);
    if (row?.kind === "alias" && row.aliasTarget !== null) reachable.add(row.aliasTarget);
  }
  result.reachable = [...reachable].sort();
  await steps.run("store", () => deps.store.setKeyModels(input.orgId, input.provider, result.reachable));

  for (const p of profiles) {
    if (p.status === "stable" && p.kind === "versioned" && !(await deps.store.hasPrice(p.id, input.provider))) {
      await deps.alerts.alert("stable_model_unpriced", `Stable model ${p.id} has no price row. Runs on a platform key are refused until it has one.`, { modelId: p.id });
    }
  }
  return result;
}
