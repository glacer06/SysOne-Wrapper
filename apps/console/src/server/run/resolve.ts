// Resolve `POST /api/v1/sets/{ref}/run` to the ResolvedRun the run engine takes (api.md, Run
// surface): the set, the channel, the version and the run settings, all read in the caller's
// tenant transaction. A set outside the token's allowlist is a 404, the same as a set that does not
// exist, so the response never says which.

import {
  type PointerChannel,
  QuestionSetSpec,
  type ResolvedRun,
  type RunSettings,
  type TenantContext,
  parseSetRef,
  roleAtLeast,
} from "@bandwise/core";
import { repos, type TenantTx } from "@bandwise/db";

import { OperationError } from "../operations/errors";

/** The comparator when neither the spec nor the org names one (savings-model.md). */
export const DEFAULT_COMPARATOR_MODEL = "claude-haiku-4-5";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface RunTarget {
  ref: string;
  /** From `?channel=`. Sessions and agent tokens only; app tokens use their bound channel. */
  channel?: PointerChannel | undefined;
}

const notFound = (ref: string) => new OperationError("not_found", `No set ${ref} is visible to this token.`);

/**
 * May this caller run a set's mutable draft (`slug@draft`)? api.md: sk_test_ and agents with
 * sets:write. A person needs the editor role: a console preview in sdk mode is a real call on the
 * platform key, so viewers do not spend it (Nick, 2026-10-01).
 */
function canRunDraft(ctx: TenantContext): boolean {
  const a = ctx.actor;
  if (a.type === "apiKey") return a.mode === "test";
  if (a.type === "agent") return a.scopes.includes("sets:write");
  return a.type === "user" && roleAtLeast(a.role, "editor");
}

export async function resolveRun(tx: TenantTx, ctx: TenantContext, target: RunTarget): Promise<ResolvedRun> {
  const parsed = parseSetRef(target.ref);
  if (parsed === null) throw new OperationError("invalid_request", `${target.ref} is not a set ref. Use an id, a slug, slug@7 or slug@draft.`);

  const set = UUID.test(parsed.set) ? await repos.questionSets.get(tx, parsed.set) : await repos.questionSets.getBySlug(tx, parsed.set);
  if (set === null || set.archivedAt !== null) throw notFound(target.ref);
  const actor = ctx.actor;
  if ((actor.type === "apiKey" || actor.type === "agent") && actor.setIds !== null && !actor.setIds.includes(set.id)) throw notFound(target.ref);

  let channel: PointerChannel;
  if (actor.type === "apiKey") {
    if (target.channel !== undefined && target.channel !== actor.channel) {
      throw new OperationError("invalid_request", `This token runs on ${actor.channel} only; it cannot ask for ${target.channel}.`);
    }
    channel = actor.channel;
  } else {
    channel = target.channel ?? "production";
  }

  const org = await repos.organizations.current(tx);
  if (org === null) throw notFound(target.ref);

  let versionRow;
  let rollout: ResolvedRun["rollout"];
  if (parsed.selector.kind === "draft") {
    if (!canRunDraft(ctx)) throw new OperationError("insufficient_scope", "slug@draft needs an sk_test_ token or an agent token with sets:write.", { requiredScope: "sets:write" });
    versionRow = set.draftVersionId === null ? null : await repos.questionSetVersions.get(tx, set.draftVersionId);
    // A draft always runs as shadow: it logs and never acts.
    rollout = "shadow";
  } else {
    const pointer = await repos.releasePointers.get(tx, set.id, channel);
    if (pointer === null || pointer.rolloutStage === "inactive") {
      throw new OperationError("set_not_live", `${set.slug} is not live on ${channel}.`);
    }
    rollout = pointer.rolloutStage;
    versionRow =
      parsed.selector.kind === "version"
        ? await repos.questionSetVersions.getByNumber(tx, set.id, parsed.selector.version)
        : await repos.questionSetVersions.get(tx, pointer.versionId);
    // A pinned number must be a published version; drafts run only through @draft.
    if (versionRow !== null && versionRow.status !== "published") versionRow = null;
  }
  if (versionRow === null) throw notFound(target.ref);

  const spec = QuestionSetSpec.safeParse(versionRow.spec);
  if (!spec.success) throw new OperationError("spec_invalid", `Version ${versionRow.version} of ${set.slug} does not validate.`);

  const orgSettings = org.settings as { defaultComparatorModel?: unknown; avgEscalationCostMicroUsd?: unknown };
  const settings: RunSettings = {
    dispatchActionsOnStaging: set.dispatchActionsOnStaging,
    storageMode: set.storageMode,
    piiMode: org.piiMode,
    defaultComparatorModel: typeof orgSettings.defaultComparatorModel === "string" ? orgSettings.defaultComparatorModel : DEFAULT_COMPARATOR_MODEL,
    avgEscalationCostMicroUsd: typeof orgSettings.avgEscalationCostMicroUsd === "number" ? orgSettings.avgEscalationCostMicroUsd : null,
    systemOneProvider: set.systemOneProvider ?? org.defaultSystemOneProvider,
  };

  // The channel a run is logged under (the Channel contract): a draft run is "draft", and a pinned
  // production run is "pinned", so the Runs page tells previews and pins apart from live traffic.
  // A pinned staging run stays "staging", which keeps its savings suppressed.
  const ranOn: ResolvedRun["channel"] =
    parsed.selector.kind === "draft" ? "draft" : parsed.selector.kind === "version" && channel === "production" ? "pinned" : channel;

  return {
    spec: spec.data,
    setId: set.id,
    version: versionRow.version,
    versionId: versionRow.id,
    interfaceMajor: versionRow.interfaceMajor,
    interfaceHash: versionRow.interfaceHash,
    channel: ranOn,
    rollout,
    settings,
  };
}
