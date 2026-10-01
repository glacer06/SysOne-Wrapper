// What the draft editor's Server Actions do, with the caller's context passed in so each step is
// tested on PGlite. Every step goes through an operation: draft.update, draft.validate, run.get,
// and set.run through the same runSetForCaller the API route uses (headless parity).
//
// Results are plain data for the client. Operation errors carry messages written for people;
// anything else becomes a generic message, so an unexpected error never reaches the browser.

import { can, type ErrorDetail, type JsonValue, parseSetRef, type RunDryRunResult, type RunResult, type TenantContext } from "@bandwise/core";

import { OperationError, OperationNotImplementedError } from "../operations/errors";
import { type OperationDeps, runOperation } from "../operations/run-operation";
import { runSetForCaller, type RunSetDeps } from "../run/run-set";

export const GENERIC_FAILURE = "Something went wrong. Try again.";

export type SaveDraftResult =
  | { status: "saved"; etag: string }
  /** Someone saved the draft after this editor loaded it. `currentEtag` lets the person overwrite on purpose. */
  | { status: "conflict"; message: string; currentEtag: string | null }
  | { status: "invalid"; message: string; details: ErrorDetail[] }
  | { status: "error"; message: string };

export type ValidateResult = { status: "ok"; errors: ErrorDetail[]; warnings: ErrorDetail[] } | { status: "error"; message: string };

export type PreviewResult =
  | { status: "ran"; result: RunResult }
  | { status: "dry"; result: RunDryRunResult }
  | { status: "refused"; message: string; details: ErrorDetail[] }
  | { status: "error"; message: string };

export type RunStateResult = { status: "ok"; state: JsonValue | null } | { status: "error"; message: string };

export const CONFLICT_MESSAGE =
  "Someone saved this draft after you opened it. Your edits are still here. Load their version to start from it, or save yours over it.";

function failure(e: unknown, log?: (message: string) => void): { status: "error"; message: string } {
  if (e instanceof OperationError) return { status: "error", message: e.message };
  if (e instanceof OperationNotImplementedError) return { status: "error", message: "This is not built yet." };
  // The type only: a database or provider message can quote the spec or the state.
  log?.(e instanceof Error ? e.name : "unknown error");
  return { status: "error", message: GENERIC_FAILURE };
}

export async function saveDraft(
  ctx: TenantContext,
  deps: OperationDeps,
  input: { ref: string; spec: unknown; etag: string },
  log?: (message: string) => void,
): Promise<SaveDraftResult> {
  try {
    const res = await runOperation("draft.update", ctx, { ref: input.ref, spec: input.spec }, { ifMatch: input.etag }, deps);
    if (res.kind !== "ok") return { status: "error", message: GENERIC_FAILURE };
    return { status: "saved", etag: res.etag ?? res.output.etag };
  } catch (e) {
    if (e instanceof OperationError && e.code === "precondition_failed") {
      return { status: "conflict", message: CONFLICT_MESSAGE, currentEtag: e.currentEtag ?? null };
    }
    if (e instanceof OperationError && e.code === "invalid_request") {
      return { status: "invalid", message: "The spec does not match the schema. Fix the items below, then save.", details: e.details ?? [] };
    }
    return failure(e, log);
  }
}

export async function validateSpec(
  ctx: TenantContext,
  deps: OperationDeps,
  input: { ref: string; spec: unknown },
  log?: (message: string) => void,
): Promise<ValidateResult> {
  if (typeof input.spec !== "object" || input.spec === null || Array.isArray(input.spec)) {
    return { status: "ok", errors: [{ path: "", rule: "spec.invalid", severity: "error", message: "The spec must be a JSON object." }], warnings: [] };
  }
  try {
    const res = await runOperation("draft.validate", ctx, { ref: input.ref, spec: input.spec }, {}, deps);
    if (res.kind !== "ok") return { status: "error", message: GENERIC_FAILURE };
    return { status: "ok", errors: res.output.errors, warnings: res.output.warnings };
  } catch (e) {
    return failure(e, log);
  }
}

/**
 * Run the saved draft on a sample state as `slug@draft`, which always runs as shadow: it is
 * logged and never acts. A dry run compiles and preflights only, with no System One call.
 */
export async function previewDraft(
  ctx: TenantContext,
  orgSlug: string,
  input: { ref: string; state: unknown; dryRun: boolean },
  deps: RunSetDeps,
  log?: (message: string) => void,
): Promise<PreviewResult> {
  const parsed = parseSetRef(input.ref);
  if (parsed === null || parsed.selector.kind !== "channel") return { status: "refused", message: "Open the set by its slug to preview its draft.", details: [] };
  const allowed = can(ctx, "set.run", { orgId: ctx.orgId, draft: true });
  if (!allowed.allowed) return { status: "refused", message: "Your role cannot run this set.", details: [] };
  try {
    const result = await runSetForCaller(
      ctx,
      orgSlug,
      { ref: `${parsed.set}@draft`, state: input.state as JsonValue, options: { dryRun: input.dryRun, includeProbabilities: true }, source: "console" },
      deps,
    );
    return "dryRun" in result ? { status: "dry", result } : { status: "ran", result };
  } catch (e) {
    // A bad state, a spec that does not compile, a missing key: messages written for people.
    if (e instanceof OperationError) return { status: "refused", message: e.message, details: e.details ?? [] };
    return failure(e, log);
  }
}

/** The stored state of a run, to reuse as a preview sample. Null when the storage mode kept none. */
export async function runState(ctx: TenantContext, deps: OperationDeps, input: { id: string }, log?: (message: string) => void): Promise<RunStateResult> {
  try {
    const res = await runOperation("run.get", ctx, { id: input.id }, {}, deps);
    if (res.kind !== "ok") return { status: "error", message: GENERIC_FAILURE };
    return { status: "ok", state: res.output.state };
  } catch (e) {
    return failure(e, log);
  }
}
