// What a console page or Server Action gets back from runOperation. Kept apart from
// console-operation.ts so tests can settle a runOperation call without a session.

import type { DryRunResult, ErrorDetail, OperationId } from "@bandwise/core";

import { OperationError, OperationNotImplementedError, type OperationOutput, type RunOperationResult } from "./operations";

export type ConsoleOperationResult<K extends OperationId> =
  | { status: "ok"; output: OperationOutput<K>; etag?: string }
  /** A dryRun call: what would change, the lints, and whether an agent would need an approval. */
  | { status: "preview"; preview: DryRunResult }
  /** The handler is still a stub. Pages show what is coming instead of an error. */
  | { status: "not-built" }
  | { status: "error"; code: string; message: string; details?: ErrorDetail[]; currentEtag?: string };

export async function settle<K extends OperationId>(
  run: () => Promise<RunOperationResult<K>>,
): Promise<ConsoleOperationResult<K>> {
  try {
    const res = await run();
    if (res.kind === "ok") return res.etag === undefined ? { status: "ok", output: res.output } : { status: "ok", output: res.output, etag: res.etag };
    if (res.kind === "dryRun") return { status: "preview", preview: res.preview };
    // Only agent calls are gated, and the console calls as a person.
    return { status: "error", code: "unexpected", message: "The operation did not run." };
  } catch (e) {
    if (e instanceof OperationNotImplementedError) return { status: "not-built" };
    // Operation errors carry api.md messages written for people. Anything else stays generic.
    if (e instanceof OperationError) {
      const out: ConsoleOperationResult<K> = { status: "error", code: e.code, message: e.message };
      if (e.details !== undefined) out.details = e.details;
      if (e.currentEtag !== undefined) out.currentEtag = e.currentEtag;
      return out;
    }
    return { status: "error", code: "internal", message: "Something went wrong. Try again." };
  }
}
