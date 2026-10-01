// The org's sets with their rollout stage, so every page that names a set also shows where it
// stands. Read through set.list like any other page read.
import "server-only";

import type { RolloutStage } from "@bandwise/core";
import Link from "next/link";

import { RolloutBadge } from "~/components/ui";
import { consoleOperation } from "~/server/console-operation";
import type { SetView } from "~/server/operations/views";

export interface SetInfo {
  id: string;
  slug: string;
  name: string;
  production: RolloutStage | null;
  staging: RolloutStage | null;
}

export type SetDirectory = Map<string, SetInfo>;

/** Sets by id. Empty when set.list fails, so a page still renders its own data. */
export async function loadSets(): Promise<SetDirectory> {
  const res = await consoleOperation("set.list", { limit: "200" });
  const out: SetDirectory = new Map();
  if (res.status !== "ok") return out;
  for (const s of (res.output as { data: SetView[] }).data) {
    const stage = (c: "production" | "staging") => s.channels.find((ch) => ch.channel === c)?.stage ?? null;
    out.set(s.id, { id: s.id, slug: s.slug, name: s.name, production: stage("production"), staging: stage("staging") });
  }
  return out;
}

/** Options for a set filter: the slug is the value people type in the CLI too. */
export function setOptions(sets: SetDirectory): { value: string; label: string }[] {
  return [...sets.values()].sort((a, b) => a.slug.localeCompare(b.slug)).map((s) => ({ value: s.slug, label: s.slug }));
}

/** A set's slug, linked to the set, with its production stage beside it. */
export function SetLabel({ sets, setId, compact = false }: { sets: SetDirectory; setId: string; compact?: boolean }) {
  const s = sets.get(setId);
  if (s === undefined) return <span className="font-mono text-xs text-ink-3">{setId.slice(0, 8)}</span>;
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Link href={`/sets/${encodeURIComponent(s.slug)}`} className="font-medium text-ink underline-offset-2 hover:underline" title={s.name}>
        {s.slug}
      </Link>
      {s.production === null ? (
        <span className="text-xs text-ink-3">Not released</span>
      ) : (
        <span className="inline-flex items-center gap-1">
          {compact ? null : <span className="text-xs text-ink-3">production</span>}
          <RolloutBadge stage={s.production} />
        </span>
      )}
    </span>
  );
}
