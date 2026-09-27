// The operation registry: one entry per row of OPERATION_CATALOG, keyed by operation id.
// Server Actions, /api/v1 route handlers, the CLI and the MCP server all go through it.

import { OPERATION_CATALOG, type OperationId } from "@bandwise/core";
import type { z } from "zod";

import type { RegisteredOperation } from "./define";
import { appOperations } from "./apps";
import { datasetOperations } from "./datasets";
import { identityOperations } from "./identity";
import { learningOperations } from "./learning";
import { platformOperations } from "./platform";
import { releaseOperations } from "./releases";
import { reportOperations } from "./reports";
import { reviewOperations } from "./review";
import { runOperations } from "./runs";
import { setOperations } from "./sets";
import { studioOperations } from "./studio";

export const OPERATIONS = {
  ...runOperations,
  ...setOperations,
  ...releaseOperations,
  ...datasetOperations,
  ...reviewOperations,
  ...learningOperations,
  ...studioOperations,
  ...appOperations,
  ...reportOperations,
  ...identityOperations,
  ...platformOperations,
} satisfies { [K in OperationId]: RegisteredOperation<K> };

// Compile-time parity: the registry has exactly the catalog's ids, no more and no fewer.
type _AssertNever<T extends never> = T;
type _NoExtraOperations = _AssertNever<Exclude<keyof typeof OPERATIONS, OperationId>>;
type _NoMissingOperations = _AssertNever<Exclude<OperationId, keyof typeof OPERATIONS>>;

export type Operations = typeof OPERATIONS;

/** The parsed input of an operation. */
export type OperationInput<K extends OperationId> = z.output<Operations[K]["input"]>;

/** What an operation's handler returns. */
export type OperationOutput<K extends OperationId> = z.output<Operations[K]["output"]>;

export function getOperation<K extends OperationId>(id: K): Operations[K] {
  return OPERATIONS[id];
}

/** Every registered operation, in catalog order. */
export function listOperations(): RegisteredOperation[] {
  return OPERATION_CATALOG.map((entry) => OPERATIONS[entry.id]);
}

export function isOperationId(id: string): id is OperationId {
  return Object.hasOwn(OPERATIONS, id);
}
