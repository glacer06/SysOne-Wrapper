"use server";

// The draft editor's Server Actions: thin wrappers that take the signed-in member's context and
// call server/editor, which goes through the operations. Inputs come from the browser, so each
// one is checked for type before it is used.

import { revalidatePath } from "next/cache";

import { requireConsole } from "~/server/auth/console";
import { getDb } from "~/server/db";
import {
  GENERIC_FAILURE,
  previewDraft,
  type PreviewResult,
  runState,
  type RunStateResult,
  saveDraft,
  type SaveDraftResult,
  validateSpec,
  type ValidateResult,
} from "~/server/editor/editor";
import { serverRunDeps } from "~/server/run/deps";

const isText = (v: unknown, max = 512): v is string => typeof v === "string" && v.length > 0 && v.length <= max;

function logger(requestId: string, what: string) {
  return (message: string) => console.error(`console ${what} ${requestId}: ${message}`);
}

export async function saveDraftAction(ref: unknown, spec: unknown, etag: unknown): Promise<SaveDraftResult> {
  const { ctx } = await requireConsole();
  if (!isText(ref) || !isText(etag)) return { status: "error", message: GENERIC_FAILURE };
  const res = await saveDraft(ctx, { db: getDb() }, { ref, spec, etag }, logger(ctx.requestId, "draft.update"));
  if (res.status === "saved") revalidatePath(`/sets/${encodeURIComponent(ref)}`);
  return res;
}

export async function validateDraftAction(ref: unknown, spec: unknown): Promise<ValidateResult> {
  const { ctx } = await requireConsole();
  if (!isText(ref)) return { status: "error", message: GENERIC_FAILURE };
  return validateSpec(ctx, { db: getDb() }, { ref, spec }, logger(ctx.requestId, "draft.validate"));
}

export async function previewDraftAction(ref: unknown, state: unknown, dryRun: unknown): Promise<PreviewResult> {
  const { ctx, org } = await requireConsole();
  if (!isText(ref)) return { status: "error", message: GENERIC_FAILURE };
  const log = logger(ctx.requestId, "set.run");
  let deps;
  try {
    deps = serverRunDeps();
  } catch (e) {
    log(e instanceof Error ? e.name : "unknown error");
    return { status: "error", message: GENERIC_FAILURE };
  }
  const res = await previewDraft(ctx, org.slug, { ref, state, dryRun: dryRun === true }, deps, log);
  if (res.status === "ran") revalidatePath("/runs");
  return res;
}

export async function runStateAction(id: unknown): Promise<RunStateResult> {
  const { ctx } = await requireConsole();
  if (!isText(id, 64)) return { status: "error", message: GENERIC_FAILURE };
  return runState(ctx, { db: getDb() }, { id }, logger(ctx.requestId, "run.get"));
}
