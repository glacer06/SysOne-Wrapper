// How console pages and Server Actions call operations (headless parity, golden rule 8): the
// signed-in member's TenantContext through runOperation, the same path as /api/v1, the CLI and MCP.
import "server-only";

import type { OperationId } from "@bandwise/core";

import { requireConsole } from "./auth/console";
import { type ConsoleOperationResult, settle } from "./console-result";
import { getDb } from "./db";
import { runOperation, type RunOperationOptions } from "./operations";

export type { ConsoleOperationResult } from "./console-result";

export async function consoleOperation<K extends OperationId>(
  id: K,
  input: unknown,
  options: RunOperationOptions = {},
): Promise<ConsoleOperationResult<K>> {
  const { ctx } = await requireConsole();
  return settle(() =>
    runOperation(id, ctx as Parameters<typeof runOperation<K>>[1], input, options, {
      db: getDb(),
      logError: (message, requestId) => console.error(`console ${requestId}: ${message}`),
    }),
  );
}
