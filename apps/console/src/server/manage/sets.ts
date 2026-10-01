// Handlers for sets, drafts, versions and the manifest (management-api.md, Sets and drafts;
// Versions and releases). Each runs inside runOperation's tenant transaction.

import {
  Action,
  DEFAULT_LABELING_POLICY,
  type ErrorDetail,
  interfaceHash,
  interfaceOf,
  lint,
  type Manifest,
  moduleFor,
  parseSetRef,
  parseSpec,
  type PointerChannel,
  QuestionSetSpec,
  SEED_MODEL_PROFILES,
  SEED_PLATFORM_DEFAULT_MODEL,
  type SpecDiff,
  specQuestions,
} from "@bandwise/core";
import { repos, type TenantTx } from "@bandwise/db";

import type { OperationEnv } from "../operations/define";
import { OperationError } from "../operations/errors";
import type { SetView, VersionDetail, VersionSummary } from "../operations/views";
import {
  actorIds,
  authorizeSet,
  inAllowlist,
  isUuid,
  setNotFound,
  setView,
  type SetRow,
  versionSource,
  versionSummary,
  type VersionRow,
} from "./common";
import { diffSpecs, specHash } from "./spec-diff";

/** A set slug: lower case letters, digits, dashes and underscores. A uuid-shaped slug would shadow ids. */
const SLUG = /^[a-z0-9][a-z0-9_-]{0,63}$/;

/** The draft of a set created without a template or a version: one placeholder question to replace. */
export const STARTER_SPEC: QuestionSetSpec = QuestionSetSpec.parse({
  schemaVersion: 1,
  model: SEED_PLATFORM_DEFAULT_MODEL,
  input: { schema: { type: "object", required: ["text"], properties: { text: { type: "string" } } } },
  stages: [
    {
      id: "main",
      questions: {
        replace_me: {
          type: "noul",
          instructions: "Replace this question. Does `text` ask for something that needs a reply?",
          criteria: { true: "It asks for a reply or an action.", false: "It needs no reply or action." },
          meta: { label: "Replace me" },
        },
      },
    },
  ],
  policies: {
    replace_me: {
      type: "noul",
      gating: true,
      noul: { trueAt: 0.85, falseAt: 0.15, reviewMargin: 0.1 },
      actions: { high: { kind: "auto" }, medium: { kind: "review" }, low: { kind: "review" } },
    },
  },
});

/** The registry profile for a spec's model, from the seed until Phase 2 reads the table. */
export function profileFor(model: string) {
  return SEED_MODEL_PROFILES.find((p) => p.id === model) ?? null;
}

export function parseStoredSpec(v: VersionRow): QuestionSetSpec {
  const parsed = QuestionSetSpec.safeParse(v.spec);
  if (!parsed.success) throw new OperationError("spec_invalid", `Version ${v.version} does not validate against the current spec schema.`);
  return parsed.data;
}

export function checkIfMatch(env: OperationEnv, current: string): void {
  if (env.ifMatch === undefined || env.ifMatch !== current) {
    throw new OperationError("precondition_failed", "The draft changed since you read it. Read it again and retry.", { currentEtag: current });
  }
}

async function draftOf(tx: TenantTx, set: SetRow): Promise<VersionRow> {
  const draft = set.draftVersionId === null ? null : await repos.questionSetVersions.get(tx, set.draftVersionId);
  if (draft === null) throw new OperationError("not_found", `${set.slug} has no draft.`);
  return draft;
}

export function cursorOf(cursor: string | undefined, kind: "uuid" | "number"): string | null {
  if (cursor === undefined) return null;
  const ok = kind === "uuid" ? isUuid(cursor) : /^[1-9][0-9]{0,8}$/.test(cursor);
  if (!ok) throw new OperationError("invalid_request", "The cursor is not one this list returned.");
  return cursor;
}

// ---------------------------------------------------------------------------
// Sets

export async function listSets(env: OperationEnv, input: { limit: number; cursor?: string | undefined }) {
  env.authorize({});
  const page = await repos.questionSets.list(env.tx, { limit: input.limit, cursor: cursorOf(input.cursor, "uuid") });
  const data: SetView[] = [];
  for (const set of page.data) {
    if (set.archivedAt === null && inAllowlist(env.ctx, set.id)) data.push(await setView(env.tx, set));
  }
  return { data, nextCursor: page.nextCursor };
}

export async function getSet(env: OperationEnv, input: { ref: string }): Promise<SetView> {
  const { set, pointers } = await authorizeSet(env, input.ref);
  return setView(env.tx, set, pointers);
}

export async function createSet(
  env: OperationEnv,
  input: { slug: string; name: string; goalId: string; fromTemplate?: string | undefined; fromVersion?: string | undefined },
): Promise<SetView> {
  env.authorize({});
  if (!SLUG.test(input.slug)) {
    throw new OperationError("invalid_request", "A slug is 1 to 64 lower case letters, digits, dashes or underscores.", {
      details: [{ path: "/slug", rule: "request.invalid", severity: "error", message: "invalid slug" }],
    });
  }
  if (input.fromTemplate !== undefined) {
    throw new OperationError("invalid_request", "fromTemplate lands with the template library. Create the set, then PUT its draft.");
  }
  const tx = env.tx;
  const goal = await repos.goals.get(tx, input.goalId);
  if (goal === null || goal.archivedAt !== null) throw new OperationError("not_found", `No goal ${input.goalId} in this org.`);
  if ((await repos.questionSets.getBySlug(tx, input.slug)) !== null) {
    throw new OperationError("already_exists", `A set with slug ${input.slug} already exists.`);
  }

  let spec = STARTER_SPEC;
  if (input.fromVersion !== undefined) {
    const ref = parseSetRef(input.fromVersion);
    if (ref === null || ref.selector.kind !== "version") throw new OperationError("invalid_request", "fromVersion is slug@n.");
    const source = isUuid(ref.set) ? await repos.questionSets.get(tx, ref.set) : await repos.questionSets.getBySlug(tx, ref.set);
    const v = source === null || !inAllowlist(env.ctx, source.id) ? null : await repos.questionSetVersions.getByNumber(tx, source.id, ref.selector.version);
    if (v === null || v.status === "draft") throw new OperationError("not_found", `No published version ${input.fromVersion} is visible to this caller.`);
    spec = parseStoredSpec(v);
  }

  const by = actorIds(env.ctx);
  const set = await repos.questionSets.insert(tx, {
    projectId: goal.projectId,
    goalId: goal.id,
    slug: input.slug,
    name: input.name,
    labeling: DEFAULT_LABELING_POLICY,
    createdByUserId: by.userId,
    createdByTokenId: by.tokenId,
  });
  const draft = await repos.questionSetVersions.insert(tx, {
    setId: set.id,
    version: 1,
    spec,
    specHash: specHash(spec),
    interfaceHash: interfaceHash(interfaceOf(spec)),
    interfaceMajor: 1,
    model: spec.model,
    source: versionSource(env.ctx),
    createdByUserId: by.userId,
    createdByTokenId: by.tokenId,
  });
  const updated = await repos.questionSets.update(tx, set.id, { draftVersionId: draft.id });
  env.audit({
    targetType: "question_set",
    targetId: set.id,
    diff: { slug: input.slug, name: input.name, goalId: goal.id, fromVersion: input.fromVersion ?? null },
  });
  return setView(tx, updated ?? set, []);
}

// ---------------------------------------------------------------------------
// Drafts

export async function getDraft(env: OperationEnv, input: { ref: string }): Promise<QuestionSetSpec> {
  const { set } = await authorizeSet(env, input.ref);
  const draft = await draftOf(env.tx, set);
  env.etag(draft.specHash);
  return parseStoredSpec(draft);
}

export async function updateDraft(env: OperationEnv, input: { ref: string; spec: QuestionSetSpec }): Promise<{ etag: string }> {
  const { set } = await authorizeSet(env, input.ref);
  const draft = await draftOf(env.tx, set);
  checkIfMatch(env, draft.specHash);
  const next = specHash(input.spec);
  env.etag(next);
  if (next === draft.specHash) {
    env.unchanged();
    return { etag: next };
  }
  const before = QuestionSetSpec.safeParse(draft.spec);
  await repos.questionSetVersions.update(env.tx, draft.id, {
    spec: input.spec,
    specHash: next,
    interfaceHash: interfaceHash(interfaceOf(input.spec)),
    model: input.spec.model,
  });
  // The changed paths, not the spec itself, keep the audit row small.
  const paths = before.success ? diffSpecs({ label: "before", spec: before.data }, { label: "after", spec: input.spec }).changes.map((c) => c.path) : null;
  env.audit({ targetType: "question_set_version", targetId: draft.id, diff: { setId: set.id, slug: set.slug, from: draft.specHash, to: next, paths } });
  return { etag: next };
}

/** Lint findings as error.details items (the same shape). */
function toDetails(results: ReturnType<typeof lint>): ErrorDetail[] {
  return results.map((r) => ({ path: r.path, rule: r.rule, severity: r.severity, message: r.message }));
}

export async function validateDraft(env: OperationEnv, input: { ref: string; spec?: Record<string, unknown> | undefined }) {
  const { set } = await authorizeSet(env, input.ref);
  const raw: unknown = input.spec ?? (await draftOf(env.tx, set)).spec;
  const parsed = parseSpec(raw);
  if (!parsed.ok) return { errors: parsed.details.map((d) => ({ ...d })), warnings: [] };
  const details = toDetails(lint(parsed.spec, profileFor(parsed.spec.model)));
  return { errors: details.filter((d) => d.severity === "error"), warnings: details.filter((d) => d.severity === "warning") };
}

// ---------------------------------------------------------------------------
// Manifest and versions

export function manifestOf(set: SetRow, v: VersionRow, spec: QuestionSetSpec, channel: Manifest["channel"]): Manifest {
  const iface = interfaceOf(spec);
  return {
    setId: set.id,
    slug: set.slug,
    version: v.version,
    versionId: v.id,
    channel,
    model: spec.model,
    interfaceMajor: v.interfaceMajor,
    interfaceHash: v.interfaceHash,
    inputSchema: spec.input.schema,
    questions: specQuestions(spec).map(({ id, question }) => ({ id, ...moduleFor(question.type).manifestHint(question as never) })),
    composites: iface.composites,
    routeOutputs: iface.routeOutputs,
    actions: [...Action.options],
  };
}

export async function getManifest(env: OperationEnv, input: { ref: string }): Promise<Manifest> {
  const parsed = parseSetRef(input.ref);
  if (parsed === null) throw new OperationError("invalid_request", `${input.ref} is not a set ref. Use an id, a slug, slug@7 or slug@draft.`);
  const tx = env.tx;
  const set = isUuid(parsed.set) ? await repos.questionSets.get(tx, parsed.set) : await repos.questionSets.getBySlug(tx, parsed.set);
  if (set === null || set.archivedAt !== null) throw new OperationError("not_found", setNotFound(input.ref));
  const actor = env.ctx.actor;
  const channel: PointerChannel = actor.type === "apiKey" ? actor.channel : "production";
  env.authorize({ setId: set.id, channel, draft: parsed.selector.kind === "draft" }, undefined, setNotFound(input.ref));

  if (parsed.selector.kind === "draft") {
    const draft = await draftOf(tx, set);
    return manifestOf(set, draft, parseStoredSpec(draft), "draft");
  }
  if (parsed.selector.kind === "version") {
    const v = await repos.questionSetVersions.getByNumber(tx, set.id, parsed.selector.version);
    if (v === null || v.status === "draft") throw new OperationError("not_found", `${set.slug} has no published version ${parsed.selector.version}.`);
    return manifestOf(set, v, parseStoredSpec(v), "pinned");
  }
  const pointer = await repos.releasePointers.get(tx, set.id, channel);
  if (pointer === null) throw new OperationError("set_not_live", `${set.slug} has no ${channel} version yet.`);
  const v = await repos.questionSetVersions.get(tx, pointer.versionId);
  if (v === null) throw new OperationError("set_not_live", `${set.slug} has no ${channel} version yet.`);
  return manifestOf(set, v, parseStoredSpec(v), channel);
}

export async function listVersions(env: OperationEnv, input: { ref: string; limit: number; cursor?: string | undefined }) {
  const { set } = await authorizeSet(env, input.ref);
  const page = await repos.questionSetVersions.listPublished(env.tx, set.id, { limit: input.limit, cursor: cursorOf(input.cursor, "number") });
  return { data: page.data.map(versionSummary) satisfies VersionSummary[], nextCursor: page.nextCursor };
}

export async function getVersion(env: OperationEnv, input: { ref: string; n: number }): Promise<VersionDetail | Manifest> {
  const { set } = await authorizeSet(env, input.ref);
  const v = await repos.questionSetVersions.getByNumber(env.tx, set.id, input.n);
  if (v === null || v.status === "draft") throw new OperationError("not_found", `${set.slug} has no published version ${input.n}.`);
  const spec = parseStoredSpec(v);
  // App tokens read the manifest only, never instructions, criteria or thresholds.
  if (env.ctx.actor.type === "apiKey") return manifestOf(set, v, spec, "pinned");
  return { ...versionSummary(v), spec };
}

/** One side of a diff: a version number, "draft" or a channel name. */
export async function resolveSide(tx: TenantTx, set: SetRow, side: number | "draft" | PointerChannel): Promise<{ label: string; spec: QuestionSetSpec; row: VersionRow }> {
  let row: VersionRow | null;
  if (side === "draft") {
    row = await draftOf(tx, set);
    return { label: `${set.slug}@draft`, spec: parseStoredSpec(row), row };
  }
  if (typeof side === "number") {
    row = await repos.questionSetVersions.getByNumber(tx, set.id, side);
    if (row === null || row.status === "draft") throw new OperationError("not_found", `${set.slug} has no published version ${side}.`);
  } else {
    const pointer = await repos.releasePointers.get(tx, set.id, side);
    row = pointer === null ? null : await repos.questionSetVersions.get(tx, pointer.versionId);
    if (row === null) throw new OperationError("set_not_live", `${set.slug} has no ${side} version yet.`);
  }
  return { label: `${set.slug}@${row.version}`, spec: parseStoredSpec(row), row };
}

export async function diffVersions(env: OperationEnv, input: { ref: string; from: number | "draft" | PointerChannel; to: number | "draft" | PointerChannel }): Promise<SpecDiff> {
  const { set } = await authorizeSet(env, input.ref);
  const from = await resolveSide(env.tx, set, input.from);
  const to = await resolveSide(env.tx, set, input.to);
  return diffSpecs(from, to);
}
