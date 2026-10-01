// How console pages and Server Actions call operations (headless parity, golden rule 8): the
// signed-in member's TenantContext through runOperation, the same path as /api/v1, the CLI and MCP.
import "server-only";

import type { OperationId } from "@bandwise/core";

import { requireConsole } from "./auth/console";
import { OperationError, OperationNotImplementedError, type OperationOutput, runOperation, type RunOperationOptions } from "./operations";

export type ConsoleOperationResult<K extends OperationId> =
  | { status: "ok"; output: OperationOutput<K> }
  /** The handler is still a stub. Pages show what is coming instead of an error. */
  | { status: "not-built" }
  | { status: "error"; code: string; message: string };

export async function consoleOperation<K extends OperationId>(
  id: K,
  input: unknown,
  options: RunOperationOptions = {},
): Promise<ConsoleOperationResult<K>> {
  const { ctx } = await requireConsole();
  try {
    const res = await runOperation(id, ctx as Parameters<typeof runOperation<K>>[1], input, options);
    if (res.kind !== "ok") return { status: "error", code: "unexpected", message: "The operation did not run." };
    return { status: "ok", output: res.output };
  } catch (e) {
    if (e instanceof OperationNotImplementedError) return { status: "not-built" };
    // Operation errors carry api.md messages written for people. Anything else stays generic.
    if (e instanceof OperationError) return { status: "error", code: e.code, message: e.message };
    return { status: "error", code: "internal", message: "Something went wrong. Try again." };
  }
}
