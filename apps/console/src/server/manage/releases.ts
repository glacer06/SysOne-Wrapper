// Handlers for publish, rollback and rollout (management-api.md, Versions and releases; Rollout).
// D2 rules: publish always moves the pointer (experiments land in Phase 3b), a channel's first
// publish creates its pointer at shadow (ADR-020: every dogfood set starts in shadow), and no
// rollout gates are checked yet (Phase 3).

import {
  classifyModelName,
  type DryRunResult,
  type ErrorDetail,
  hasLintErrors,
  interfaceHash,
  interfaceOf,
  lint,
  type PointerChannel,
  type PublishCtx,
  type PublishServedChannel,
  type QuestionSetSpec,
  type RolloutStage,
  SEED_COMPARATOR_PRICES,
  SEED_MODEL_PROFILES,
  SEED_MODEL_ROUTES,
  SEED_SYSTEM_ONE_PRICES,
} from "@bandwise/core";
import { repos, type TenantTx } from "@bandwise/db";

import type { OperationEnv } from "../operations/define";
import { OperationError } from "../operations/errors";
import { actorIds, authorizeSet, type PointerRow, type SetRow, type VersionRow } from "./common";
import { checkIfMatch, parseStoredSpec, profileFor, resolveSide } from "./sets";
import { diffSpecs, specHash } from "./spec-diff";

/** The stage a channel's first publish starts at (ADR-020, D2). */
export const FIRST_POINTER_STAGE: RolloutStage = "shadow";

const LIVE: readonly RolloutStage[] = ["controlled", "full"];

interface PublishInput {
  ref: string;
  channel: PointerChannel;
  changelog: string;
  requireEval?: boolean | undefined;
  skipExperiment?: { reason: string } | undefined;
  interfaceBump?: { reason: string } | undefined;
}

/** What publish-time lints read. Platform key mode: every registry model is reachable. */
async function publishCtx(
  tx: TenantTx,
  set: SetRow,
  spec: QuestionSetSpec,
  pointers: PointerRow[],
  channel: PointerChannel,
  newMajor: number,
): Promise<PublishCtx> {
  const served: PublishServedChannel[] = [];
  for (const p of pointers) {
    if (p.channel !== channel && !(channel === "staging" && p.channel === "production")) continue;
    const v = await repos.questionSetVersions.get(tx, p.versionId);
    if (v === null) continue;
    // Until app bindings exist, any channel that serves runs counts as having consumers.
    served.push({ channel: p.channel, interface: interfaceOf(parseStoredSpec(v)), interfaceMajor: v.interfaceMajor, hasConsumers: p.rolloutStage !== "inactive" });
  }
  const org = await repos.organizations.current(tx);
  const provider = set.systemOneProvider ?? org?.defaultSystemOneProvider ?? "typesafe";
  return {
    channel,
    rolloutStage: pointers.find((p) => p.channel === channel)?.rolloutStage ?? FIRST_POINTER_STAGE,
    served,
    newMajor,
    systemOneProvider: provider,
    reachableModels: SEED_MODEL_PROFILES.map((p) => p.id),
    modelRoutes: SEED_MODEL_ROUTES.filter((r) => r.provider === provider),
    pricedModels: [...SEED_SYSTEM_ONE_PRICES, ...SEED_COMPARATOR_PRICES].map((p) => p.model),
    allowPreviewModels: false,
    enabledHandlers: [],
    fallbackSets: await fallbackSets(tx, spec),
    hashOnly: set.storageMode === "hash_only",
  };
}

/** The setRef of every `set` fallback in a spec (spec-schema.md section 7), wherever the action sits. */
function setFallbackRefs(value: unknown, out: Set<string> = new Set()): Set<string> {
  if (Array.isArray(value)) for (const v of value) setFallbackRefs(v, out);
  else if (value !== null && typeof value === "object") {
    const o = value as Record<string, unknown>;
    const config = o["config"] as Record<string, unknown> | undefined;
    if (o["kind"] === "fallback" && config?.["kind"] === "set" && typeof config["setRef"] === "string") out.add(config["setRef"]);
    for (const v of Object.values(o)) setFallbackRefs(v, out);
  }
  return out;
}

/** Each named fallback set, and whether the version its production pointer serves uses a set fallback itself. */
async function fallbackSets(tx: TenantTx, spec: QuestionSetSpec): Promise<PublishCtx["fallbackSets"]> {
  const out: PublishCtx["fallbackSets"] = {};
  for (const ref of setFallbackRefs(spec)) {
    const target = await repos.questionSets.getBySlug(tx, ref);
    if (target === null || target.archivedAt !== null) continue;
    const pointer = await repos.releasePointers.get(tx, target.id, "production");
    const v = pointer === null ? null : await repos.questionSetVersions.get(tx, pointer.versionId);
    out[ref] = { usesSetFallback: v !== null && setFallbackRefs(v.spec).size > 0 };
  }
  return out;
}

interface PublishPlan {
  set: SetRow;
  pointers: PointerRow[];
  gated: boolean;
  draft: VersionRow;
  spec: QuestionSetSpec;
  hash: string;
  current: VersionRow | null;
  newMajor: number;
  lints: ErrorDetail[];
}

async function planPublish(env: OperationEnv, input: PublishInput): Promise<PublishPlan> {
  const skip = input.skipExperiment !== undefined;
  const { set, pointers, gated } = await authorizeSet(env, input.ref, { channel: input.channel, skipExperiment: skip });
  if (skip) throw new OperationError("invalid_request", "skipExperiment lands with experiments in Phase 3b. Until then a publish always moves the pointer.");
  if (input.requireEval === true) throw new OperationError("invalid_request", "requireEval lands with the eval gate in Phase 3.");
  const tx = env.tx;
  const draft = set.draftVersionId === null ? null : await repos.questionSetVersions.get(tx, set.draftVersionId);
  if (draft === null) throw new OperationError("not_found", `${set.slug} has no draft.`);
  checkIfMatch(env, draft.specHash);
  const spec = parseStoredSpec(draft);
  const pointer = pointers.find((p) => p.channel === input.channel);
  const current = pointer === undefined ? null : await repos.questionSetVersions.get(tx, pointer.versionId);
  const maxMajor = await repos.questionSetVersions.maxInterfaceMajor(tx, set.id);
  const newMajor = input.interfaceBump !== undefined ? maxMajor + 1 : Math.max(maxMajor, 1);
  const ctx = await publishCtx(tx, set, spec, pointers, input.channel, newMajor);
  const lints = lint(spec, profileFor(spec.model), ctx).map((r) => ({ path: r.path, rule: r.rule, severity: r.severity, message: r.message }));
  return { set, pointers, gated, draft, spec, hash: specHash(spec), current, newMajor, lints };
}

export async function publish(env: OperationEnv, input: PublishInput): Promise<{ version: number; versionId: string }> {
  const plan = await planPublish(env, input);
  const { set, draft, spec, hash, current, newMajor } = plan;
  // Publishing the spec the channel already serves creates nothing (management-api.md, Draft concurrency).
  if (current !== null && current.specHash === hash && input.interfaceBump === undefined) {
    env.unchanged();
    return { version: current.version, versionId: current.id };
  }
  if (hasLintErrors(plan.lints)) {
    throw new OperationError("spec_invalid", "The draft has lint errors. Fix them, then publish.", { details: plan.lints });
  }

  const tx = env.tx;
  const by = actorIds(env.ctx);
  const iface = interfaceHash(interfaceOf(spec));
  await repos.questionSetVersions.update(tx, draft.id, {
    status: "published",
    specHash: hash,
    interfaceHash: iface,
    interfaceMajor: newMajor,
    model: spec.model,
    changelog: input.changelog,
    publishedByUserId: by.userId,
    publishedByTokenId: by.tokenId,
    publishedAt: env.now,
  });
  const next = await repos.questionSetVersions.insert(tx, {
    setId: set.id,
    version: draft.version + 1,
    spec,
    specHash: hash,
    interfaceHash: iface,
    interfaceMajor: newMajor,
    model: spec.model,
    source: draft.source,
    createdByUserId: by.userId,
    createdByTokenId: by.tokenId,
  });
  await repos.questionSets.update(tx, set.id, { draftVersionId: next.id });

  const pointer = plan.pointers.find((p) => p.channel === input.channel);
  const stage = pointer?.rolloutStage ?? FIRST_POINTER_STAGE;
  if (pointer === undefined) {
    await repos.releasePointers.insert(tx, { setId: set.id, channel: input.channel, versionId: draft.id, rolloutStage: stage });
  } else {
    await repos.releasePointers.update(tx, set.id, input.channel, { versionId: draft.id });
  }
  await repos.releaseEvents.insert(tx, {
    setId: set.id,
    channel: input.channel,
    fromVersionId: current?.id ?? null,
    toVersionId: draft.id,
    kind: "publish",
    fromStage: pointer?.rolloutStage ?? null,
    toStage: stage,
    reason: input.changelog,
    actorUserId: by.userId,
    actorTokenId: by.tokenId,
    approvalId: env.approvalId,
  });
  env.audit({
    targetType: "question_set_version",
    targetId: draft.id,
    diff: {
      setId: set.id,
      slug: set.slug,
      channel: input.channel,
      version: draft.version,
      fromVersion: current?.version ?? null,
      stage,
      interfaceMajor: newMajor,
      changelog: input.changelog,
      interfaceBump: input.interfaceBump?.reason ?? null,
    },
  });
  return { version: draft.version, versionId: draft.id };
}

export async function previewPublish(env: OperationEnv, input: PublishInput): Promise<DryRunResult> {
  const plan = await planPublish(env, input);
  const label = `${plan.set.slug}@draft`;
  const diff = diffSpecs(
    { label: plan.current === null ? `${plan.set.slug}@none` : `${plan.set.slug}@${plan.current.version}`, spec: plan.current === null ? null : parseStoredSpec(plan.current) },
    { label, spec: plan.spec },
  );
  return {
    diff,
    lints: plan.lints,
    gates: [],
    approvalRequired: plan.gated,
    interfaceChange: { ...diff.interface, majorFrom: plan.current?.interfaceMajor ?? 0, majorTo: plan.newMajor },
  };
}

// ---------------------------------------------------------------------------
// Rollback

interface RollbackInput {
  ref: string;
  channel: PointerChannel;
  toVersion?: number | undefined;
}

/**
 * The version the channel served before the current one: the `from` of the newest publish or
 * promote that put the current version there. Rollbacks are skipped, so rolling back twice walks
 * further back instead of toggling. With no such event, the highest earlier published version.
 */
async function previousVersion(tx: TenantTx, set: SetRow, channel: PointerChannel, current: VersionRow): Promise<VersionRow | null> {
  const events = await repos.releaseEvents.listByChannel(tx, set.id, channel, 200);
  const brought = events.find((e) => e.toVersionId === current.id && e.kind !== "rollback" && e.kind !== "rollout_change" && e.kind !== "auto_demote");
  if (brought !== undefined) {
    if (brought.fromVersionId === null) return null;
    return repos.questionSetVersions.get(tx, brought.fromVersionId);
  }
  const page = await repos.questionSetVersions.listPublished(tx, set.id, { limit: 1, cursor: String(current.version) });
  return page.data[0] ?? null;
}

async function planRollback(env: OperationEnv, input: RollbackInput) {
  const { set, pointers } = await authorizeSet(env, input.ref, { channel: input.channel });
  const tx = env.tx;
  const pointer = pointers.find((p) => p.channel === input.channel);
  const current = pointer === undefined ? null : await repos.questionSetVersions.get(tx, pointer.versionId);
  if (pointer === undefined || current === null) throw new OperationError("set_not_live", `${set.slug} has no ${input.channel} version to roll back.`);
  let target: VersionRow | null;
  if (input.toVersion !== undefined) {
    target = await repos.questionSetVersions.getByNumber(tx, set.id, input.toVersion);
    if (target === null || target.status === "draft") throw new OperationError("not_found", `${set.slug} has no published version ${input.toVersion}.`);
  } else {
    target = await previousVersion(tx, set, input.channel, current);
    if (target === null) throw new OperationError("invalid_request", `${set.slug} has no earlier version on ${input.channel} to roll back to.`);
  }
  if (target.id === current.id) throw new OperationError("invalid_request", `${input.channel} already serves version ${current.version}.`);
  return { set, pointer, current, target };
}

export async function rollback(env: OperationEnv, input: RollbackInput) {
  const { set, pointer, current, target } = await planRollback(env, input);
  const by = actorIds(env.ctx);
  await repos.releasePointers.update(env.tx, set.id, input.channel, { versionId: target.id });
  await repos.releaseEvents.insert(env.tx, {
    setId: set.id,
    channel: input.channel,
    fromVersionId: current.id,
    toVersionId: target.id,
    kind: "rollback",
    fromStage: pointer.rolloutStage,
    toStage: pointer.rolloutStage,
    reason: null,
    actorUserId: by.userId,
    actorTokenId: by.tokenId,
    approvalId: env.approvalId,
  });
  env.audit({
    targetType: "question_set",
    targetId: set.id,
    diff: { slug: set.slug, channel: input.channel, fromVersion: current.version, toVersion: target.version, stage: pointer.rolloutStage },
  });
  return { channel: input.channel, fromVersion: current.version, toVersion: target.version, stage: pointer.rolloutStage };
}

export async function previewRollback(env: OperationEnv, input: RollbackInput): Promise<DryRunResult> {
  const { set, current, target } = await planRollback(env, input);
  const diff = diffSpecs({ label: `${set.slug}@${current.version}`, spec: parseStoredSpec(current) }, { label: `${set.slug}@${target.version}`, spec: parseStoredSpec(target) });
  return { diff, lints: [], gates: [], approvalRequired: false, interfaceChange: { ...diff.interface, majorFrom: current.interfaceMajor, majorTo: target.interfaceMajor } };
}

// ---------------------------------------------------------------------------
// Rollout

const NO_GATES_WARNING = "No rollout gates are checked yet. They land with the effectiveness loop (Phase 3).";

export async function getRollout(env: OperationEnv, input: { ref: string; channel: PointerChannel }) {
  const { set, pointers } = await authorizeSet(env, input.ref, { channel: input.channel });
  const pointer = pointers.find((p) => p.channel === input.channel);
  const v = pointer === undefined ? null : await repos.questionSetVersions.get(env.tx, pointer.versionId);
  if (pointer === undefined || v === null) throw new OperationError("set_not_live", `${set.slug} has no ${input.channel} version yet.`);
  const warnings = [NO_GATES_WARNING];
  if (classifyModelName(v.model, SEED_MODEL_PROFILES) !== "pinned") {
    warnings.push(`Version ${v.version} uses the moving model "${v.model}". Pin a versioned model before controlled.`);
  }
  return { channel: input.channel, stage: pointer.rolloutStage, version: v.version, versionId: v.id, gates: [], warnings };
}

interface RolloutInput {
  ref: string;
  channel: PointerChannel;
  stage: RolloutStage;
  reason: string;
}

async function planRollout(env: OperationEnv, input: RolloutInput) {
  const { set, pointers, gated } = await authorizeSet(env, input.ref, { channel: input.channel, rolloutTo: input.stage });
  const pointer = pointers.find((p) => p.channel === input.channel);
  if (pointer === undefined) throw new OperationError("set_not_live", `${set.slug} has no ${input.channel} version yet. Publish first.`);
  // The auto-demote job never pauses and never lifts a pause: only people and approved agents do.
  if (env.ctx.actor.type === "system" && (input.stage === "paused" || pointer.rolloutStage === "paused")) {
    throw new OperationError("insufficient_scope", "Only a person or an approved agent pauses a channel or lifts a pause.");
  }
  const v = await repos.questionSetVersions.get(env.tx, pointer.versionId);
  if (v === null) throw new OperationError("set_not_live", `${set.slug} has no ${input.channel} version yet.`);
  const lints: ErrorDetail[] = [];
  if (LIVE.includes(input.stage) && classifyModelName(v.model, SEED_MODEL_PROFILES) !== "pinned") {
    lints.push({
      path: "/model",
      rule: "model.alias_past_shadow",
      severity: "error",
      message: `"${v.model}" is a moving model; pin a versioned model before a channel is ${input.stage}`,
    });
  }
  return { set, pointer, version: v, gated, lints };
}

export async function changeRollout(env: OperationEnv, input: RolloutInput) {
  const { set, pointer, version, lints } = await planRollout(env, input);
  const from = pointer.rolloutStage;
  if (from === input.stage) {
    env.unchanged();
    return { channel: input.channel, from, to: from, version: version.version };
  }
  if (lints.length > 0) throw new OperationError("spec_invalid", `Version ${version.version} cannot enter ${input.stage}.`, { details: lints });
  const by = actorIds(env.ctx);
  await repos.releasePointers.update(env.tx, set.id, input.channel, { rolloutStage: input.stage });
  await repos.releaseEvents.insert(env.tx, {
    setId: set.id,
    channel: input.channel,
    fromVersionId: version.id,
    toVersionId: version.id,
    kind: env.ctx.actor.type === "system" ? "auto_demote" : "rollout_change",
    fromStage: from,
    toStage: input.stage,
    reason: input.reason,
    actorUserId: by.userId,
    actorTokenId: by.tokenId,
    approvalId: env.approvalId,
  });
  env.audit({
    targetType: "question_set",
    targetId: set.id,
    diff: { slug: set.slug, channel: input.channel, version: version.version, from, to: input.stage, reason: input.reason },
  });
  return { channel: input.channel, from, to: input.stage, version: version.version };
}

export async function previewRollout(env: OperationEnv, input: RolloutInput): Promise<DryRunResult> {
  const { set, version, gated, lints } = await planRollout(env, input);
  const side = await resolveSide(env.tx, set, version.version);
  return { diff: diffSpecs(side, side), lints, gates: [], approvalRequired: gated, interfaceChange: null };
}
