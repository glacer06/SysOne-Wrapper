// What the Releases panel and the Approvals page do when a person clicks. Each step is one
// operation call through a Runner: consoleOperation in a Server Action, runOperation on PGlite in
// tests. The Server Actions in app/(org) are thin wrappers that add revalidatePath.

import type { DryRunResult, ErrorDetail, OperationId, PointerChannel, RolloutStage, SpecDiff } from "@bandwise/core";

import type { ConsoleOperationResult } from "../console-result";
import type { RunOperationOptions } from "../operations";

export type Runner = <K extends OperationId>(id: K, input: unknown, options?: RunOperationOptions) => Promise<ConsoleOperationResult<K>>;

export type ActionResult<T = null> =
  | { ok: true; message: string; data: T }
  | { ok: false; code: string; message: string; details: ErrorDetail[] };

const STAGE_NAME: Record<RolloutStage, string> = { inactive: "Inactive", shadow: "Shadow", controlled: "Controlled", full: "Full", paused: "Paused" };

/** A failed call as people read it. Operation messages are already written for people. */
export function failed(res: { status: "preview" | "not-built" } | { status: "error"; code: string; message: string; details?: ErrorDetail[] }): ActionResult<never> {
  if (res.status !== "error") return { ok: false, code: "unexpected", message: "The operation did not run.", details: [] };
  const details = res.details ?? [];
  if (res.code === "precondition_failed") {
    return { ok: false, code: res.code, message: "The draft changed since this page loaded. Reload the page, check the new draft, then try again.", details };
  }
  return { ok: false, code: res.code, message: res.message, details };
}

function fail(message: string): ActionResult<never> {
  return { ok: false, code: "invalid_request", message, details: [] };
}

/** The draft ETag as If-Match sends it. */
const quoted = (etag: string) => (etag.startsWith('"') ? etag : `"${etag}"`);

export interface PublishArgs {
  ref: string;
  channel: PointerChannel;
  changelog: string;
  /** The draft ETag the page showed. A newer draft makes the publish fail with nothing written. */
  etag: string;
}

function publishInput(a: PublishArgs) {
  return { ref: a.ref, channel: a.channel, changelog: a.changelog.trim() };
}

/** The dry run behind the publish dialog: what changes, the lints, and nothing written. */
const NO_CHANGELOG = "Write a changelog: one line on what changed and why.";

export async function checkPublish(run: Runner, a: PublishArgs): Promise<ActionResult<DryRunResult>> {
  if (a.changelog.trim() === "") return fail(NO_CHANGELOG);
  const res = await run("set.publish", publishInput(a), { ifMatch: quoted(a.etag), dryRun: true });
  if (res.status !== "preview") return failed(res.status === "ok" ? { status: "preview" } : res);
  return { ok: true, message: "", data: res.preview };
}

export async function publishDraft(run: Runner, a: PublishArgs): Promise<ActionResult<{ version: number }>> {
  if (a.changelog.trim() === "") return fail(NO_CHANGELOG);
  const res = await run("set.publish", publishInput(a), { ifMatch: quoted(a.etag) });
  if (res.status !== "ok") return failed(res);
  const { version } = res.output as { version: number };
  return { ok: true, message: `Published version ${version} to ${a.channel}.`, data: { version } };
}

export interface RollbackArgs {
  ref: string;
  channel: PointerChannel;
  toVersion?: number | undefined;
}

function rollbackInput(a: RollbackArgs) {
  return a.toVersion === undefined ? { ref: a.ref, channel: a.channel } : { ref: a.ref, channel: a.channel, toVersion: a.toVersion };
}

/** Which version a rollback would serve and how many spec fields differ. Writes nothing. */
export async function checkRollback(run: Runner, a: RollbackArgs): Promise<ActionResult<{ from: string; to: string; changes: number }>> {
  const res = await run("channel.rollback", rollbackInput(a), { dryRun: true });
  if (res.status !== "preview") return failed(res.status === "ok" ? { status: "preview" } : res);
  const { diff } = res.preview;
  return { ok: true, message: "", data: { from: diff.from, to: diff.to, changes: diff.changes.length } };
}

export async function rollbackChannel(run: Runner, a: RollbackArgs): Promise<ActionResult<{ toVersion: number }>> {
  const res = await run("channel.rollback", rollbackInput(a));
  if (res.status !== "ok") return failed(res);
  const out = res.output as { fromVersion: number; toVersion: number; stage: RolloutStage };
  return {
    ok: true,
    message: `${a.channel} now serves version ${out.toVersion} instead of ${out.fromVersion}. The stage stays ${STAGE_NAME[out.stage]}.`,
    data: { toVersion: out.toVersion },
  };
}

export interface StageArgs {
  ref: string;
  channel: PointerChannel;
  stage: RolloutStage;
  reason: string;
}

export async function changeStage(run: Runner, a: StageArgs, defaultReason: string): Promise<ActionResult<{ from: RolloutStage; to: RolloutStage }>> {
  const reason = a.reason.trim() || defaultReason;
  const res = await run("rollout.change", { ref: a.ref, channel: a.channel, stage: a.stage, reason });
  if (res.status !== "ok") return failed(res);
  const out = res.output as { from: RolloutStage; to: RolloutStage };
  const message = out.from === out.to ? `${a.channel} is already ${STAGE_NAME[out.to]}.` : `${a.channel} moved from ${STAGE_NAME[out.from]} to ${STAGE_NAME[out.to]}.`;
  return { ok: true, message, data: { from: out.from, to: out.to } };
}

export type DiffSide = number | "draft" | PointerChannel;

export async function diffSides(run: Runner, a: { ref: string; from: DiffSide; to: DiffSide }): Promise<ActionResult<SpecDiff>> {
  if (a.from === a.to) return fail("Pick two different sides to compare.");
  const res = await run("version.diff", a);
  if (res.status !== "ok") return failed(res);
  return { ok: true, message: "", data: res.output as SpecDiff };
}

export async function decideApproval(
  run: Runner,
  a: { id: string; decision: "approved" | "rejected"; note: string },
): Promise<ActionResult<{ status: string }>> {
  const input = a.note.trim() === "" ? { id: a.id, decision: a.decision } : { id: a.id, decision: a.decision, note: a.note.trim() };
  const res = await run("approval.decide", input);
  if (res.status !== "ok") return failed(res);
  const view = res.output as { opId: string; status: string; result?: { ok?: boolean; error?: { message?: string } } };
  if (a.decision === "rejected") return { ok: true, message: `Denied. ${view.opId} will not run.`, data: { status: view.status } };
  // Approved: the request ran as the agent's token after the decision committed.
  if (view.status === "executed") return { ok: true, message: `Approved. ${view.opId} ran.`, data: { status: view.status } };
  const why = view.result?.error?.message ?? "It could not run.";
  return { ok: false, code: "approval_failed", message: `Approved, but ${view.opId} did not run. ${why}`, details: [] };
}
