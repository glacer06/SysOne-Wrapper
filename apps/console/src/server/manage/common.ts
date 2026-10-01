// Shared steps of the set, release and run handlers: resolve a {ref} in the caller's org, build the
// resource can() and the approval gate read, and map rows to the response views.

import { parseSetRef, type PointerChannel, type RiskResource, type RolloutStage, type TenantContext } from "@bandwise/core";
import { repos, type TenantTx } from "@bandwise/db";

import type { OperationEnv } from "../operations/define";
import { OperationError } from "../operations/errors";
import type { ChannelView, SetView, VersionSummary } from "../operations/views";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isUuid = (v: string): boolean => UUID.test(v);

type SetRow = NonNullable<Awaited<ReturnType<typeof repos.questionSets.get>>>;
type VersionRow = NonNullable<Awaited<ReturnType<typeof repos.questionSetVersions.get>>>;
type PointerRow = Awaited<ReturnType<typeof repos.releasePointers.listBySet>>[number];

export type { PointerRow, SetRow, VersionRow };

/** The same message for a set that does not exist and one outside the caller's allowlist. */
export const setNotFound = (ref: string) => `No set ${ref} is visible to this caller.`;

/** The set a management {ref} names (an id or a slug), or 404. Archived sets are not found. */
export async function findSet(tx: TenantTx, ref: string): Promise<SetRow> {
  const parsed = parseSetRef(ref);
  if (parsed === null) throw new OperationError("invalid_request", `${ref} is not a set ref. Use the set's id or slug.`);
  if (parsed.selector.kind !== "channel") {
    throw new OperationError("invalid_request", `${ref} names a version. This route takes the set's id or slug.`);
  }
  const set = isUuid(parsed.set) ? await repos.questionSets.get(tx, parsed.set) : await repos.questionSets.getBySlug(tx, parsed.set);
  if (set === null || set.archivedAt !== null) throw new OperationError("not_found", setNotFound(ref));
  return set;
}

/** True when a token's set allowlist admits the set. Sessions and system actors see every set. */
export function inAllowlist(ctx: TenantContext, setId: string): boolean {
  const a = ctx.actor;
  return !((a.type === "apiKey" || a.type === "agent") && a.setIds !== null && !a.setIds.includes(setId));
}

/** The allowlist as a filter: undefined when the caller sees every set. */
export function allowlistOf(ctx: TenantContext): readonly string[] | undefined {
  const a = ctx.actor;
  return (a.type === "apiKey" || a.type === "agent") && a.setIds !== null ? a.setIds : undefined;
}

export function riskOf(set: SetRow, pointers: readonly PointerRow[]): RiskResource {
  const stage = (c: PointerChannel) => pointers.find((p) => p.channel === c)?.rolloutStage ?? null;
  return { protected: set.protected, stages: { production: stage("production"), staging: stage("staging") }, storageMode: set.storageMode };
}

/** Resolve the set and run can() (and the gate, with `risk`) on it. */
export async function authorizeSet(
  env: OperationEnv,
  ref: string,
  extra: { channel?: PointerChannel; rolloutTo?: RolloutStage; skipExperiment?: boolean } = {},
  risk?: (set: SetRow, pointers: PointerRow[]) => RiskResource,
): Promise<{ set: SetRow; pointers: PointerRow[]; gated: boolean }> {
  const set = await findSet(env.tx, ref);
  const pointers = await repos.releasePointers.listBySet(env.tx, set.id);
  const current = extra.channel === undefined ? undefined : pointers.find((p) => p.channel === extra.channel);
  const gated = env.authorize(
    {
      setId: set.id,
      protected: set.protected,
      ...(extra.channel === undefined ? {} : { channel: extra.channel }),
      ...(extra.rolloutTo === undefined ? {} : { rolloutFrom: current?.rolloutStage ?? null, rolloutTo: extra.rolloutTo }),
      ...(extra.skipExperiment === true ? { skipExperiment: true } : {}),
    },
    risk === undefined ? riskOf(set, pointers) : risk(set, pointers),
    setNotFound(ref),
  );
  return { set, pointers, gated };
}

export const iso = (d: Date): string => d.toISOString();
export const isoOrNull = (d: Date | null): string | null => (d === null ? null : d.toISOString());

export function versionSummary(v: VersionRow): VersionSummary {
  return {
    id: v.id,
    version: v.version,
    status: v.status,
    specHash: v.specHash,
    interfaceMajor: v.interfaceMajor,
    interfaceHash: v.interfaceHash,
    model: v.model,
    changelog: v.changelog,
    source: v.source,
    publishedAt: isoOrNull(v.publishedAt),
    publishedBy: { userId: v.publishedByUserId, tokenId: v.publishedByTokenId },
    createdAt: iso(v.createdAt),
  };
}

/** The set view: the row, its draft and each pointer with the version it serves. */
export async function setView(tx: TenantTx, set: SetRow, pointers?: PointerRow[]): Promise<SetView> {
  const rows = pointers ?? (await repos.releasePointers.listBySet(tx, set.id));
  const channels: ChannelView[] = [];
  for (const p of rows) {
    const v = await repos.questionSetVersions.get(tx, p.versionId);
    if (v === null) continue;
    channels.push({ channel: p.channel, version: v.version, versionId: v.id, stage: p.rolloutStage, interfaceMajor: v.interfaceMajor, updatedAt: iso(p.updatedAt) });
  }
  const draft = set.draftVersionId === null ? null : await repos.questionSetVersions.get(tx, set.draftVersionId);
  return {
    id: set.id,
    slug: set.slug,
    name: set.name,
    description: set.description,
    projectId: set.projectId,
    goalId: set.goalId,
    protected: set.protected,
    storageMode: set.storageMode,
    createdAt: iso(set.createdAt),
    draft: draft === null ? null : { version: draft.version, versionId: draft.id, etag: draft.specHash },
    channels,
  };
}

/** The actor columns a version or release row records. */
export function actorIds(ctx: TenantContext): { userId: string | null; tokenId: string | null } {
  const a = ctx.actor;
  if (a.type === "user") return { userId: a.userId, tokenId: null };
  if (a.type === "agent") return { userId: a.userId, tokenId: a.tokenId };
  if (a.type === "apiKey") return { userId: null, tokenId: a.keyId };
  return { userId: null, tokenId: null };
}

/** question_set_versions.source for a new version, from the request surface. */
export function versionSource(ctx: TenantContext): "console" | "api" | "cli" | "mcp" {
  return ctx.client === "cli" || ctx.client === "mcp" || ctx.client === "console" ? ctx.client : "api";
}
