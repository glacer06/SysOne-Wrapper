// OpenRouter's Models API, read for System One entries (ADR-011; system-one-models.md section 15).
//
// The plain listing (GET /api/v1/models) leaves System One models out: it returns chat models only.
// System One entries have output modality "decisions", so the sync asks for them explicitly.
// Recorded on 2026-09-27: `?output_modalities=decisions` returns typesafe/jev-1.13 (canonical slug
// typesafe/jev-1.13-20260917) and ~typesafe/jev-latest (alias_target.slug typesafe/jev-1.13).

import { z } from "zod";
import type { HttpFetch } from "./ports";

export const OPENROUTER_SYSTEM_ONE_MODELS_URL = "https://openrouter.ai/api/v1/models?output_modalities=decisions";

const Entry = z.looseObject({
  id: z.string().min(1),
  canonical_slug: z.string().min(1).nullish(),
  context_length: z.number().nullish(),
  alias_target: z.looseObject({ slug: z.string().min(1) }).nullish(),
});

const Listing = z.looseObject({ data: z.array(z.unknown()) });

export interface OpenRouterSystemOneEntry {
  id: string;
  /** The dated build behind the id, for example typesafe/jev-1.13-20260917. */
  canonicalSlug: string | null;
  contextLength: number | null;
  /** For an alias such as ~typesafe/jev-latest: the id it points at today. */
  aliasTargetSlug: string | null;
}

export function isOpenRouterSystemOneId(id: string): boolean {
  return id.startsWith("typesafe/") || id.startsWith("~typesafe/");
}

/** The System One entries of a Models API body. Entries of other authors and bad rows are skipped. */
export function parseOpenRouterListing(body: unknown): OpenRouterSystemOneEntry[] {
  const listing = Listing.safeParse(body);
  if (!listing.success) throw new Error("OpenRouter's Models API returned a body without a data array");
  const out: OpenRouterSystemOneEntry[] = [];
  for (const raw of listing.data.data) {
    const e = Entry.safeParse(raw);
    if (!e.success || !isOpenRouterSystemOneId(e.data.id)) continue;
    out.push({
      id: e.data.id,
      canonicalSlug: e.data.canonical_slug ?? null,
      contextLength: e.data.context_length ?? null,
      aliasTargetSlug: e.data.alias_target?.slug ?? null,
    });
  }
  return out;
}

export async function fetchOpenRouterSystemOneModels(fetch: HttpFetch, signal?: AbortSignal): Promise<OpenRouterSystemOneEntry[]> {
  const res = await fetch(OPENROUTER_SYSTEM_ONE_MODELS_URL, { method: "GET", headers: { accept: "application/json" }, ...(signal !== undefined ? { signal } : {}) });
  if (!res.ok) throw new Error(`GET ${OPENROUTER_SYSTEM_ONE_MODELS_URL} returned ${res.status}`);
  return parseOpenRouterListing(await res.json());
}

/**
 * The build an alias entry answers with: the canonical slug of the entry it targets (a dated id,
 * the same value runs report as `model`), else the target slug itself.
 */
export function aliasBuild(alias: OpenRouterSystemOneEntry, entries: readonly OpenRouterSystemOneEntry[]): string | null {
  if (alias.aliasTargetSlug === null) return null;
  const target = entries.find((e) => e.id === alias.aliasTargetSlug);
  return target?.canonicalSlug ?? alias.aliasTargetSlug;
}
