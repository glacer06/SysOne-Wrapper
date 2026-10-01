// Errors that runOperation and the operation handlers throw. Route handlers map them to the
// error envelope in references/api.md.

import {
  errorEnvelope,
  errorStatus,
  type ErrorCode,
  type ErrorDetail,
  type ErrorEnvelope,
  type ErrorEnvelopeInit,
  type GateResult,
  type OperationId,
  type Phase,
  type Scope,
} from "@bandwise/core";

/** The envelope fields an error may carry besides code and message (api.md, Error envelope). */
export type OperationErrorExtras = Omit<ErrorEnvelopeInit, "message" | "requestId">;

/** A failure with an api.md error code, plus the extras its code calls for. */
export class OperationError extends Error {
  override readonly name = "OperationError";
  readonly code: ErrorCode;
  readonly status: number;
  readonly details: ErrorDetail[] | undefined;
  /** With gate_not_met. */
  readonly gates: GateResult[] | undefined;
  /** With insufficient_scope. */
  readonly requiredScope: Scope | undefined;
  /** With precondition_failed: the draft's current ETag. */
  readonly currentEtag: string | undefined;
  /** Set when a failed run row was written. */
  readonly runId: string | undefined;
  /** With rate_limited: how long to wait, sent as the Retry-After header (api.md, Errors). */
  retryAfterMs: number | undefined;

  constructor(code: ErrorCode, message: string, extras: OperationErrorExtras = {}) {
    super(message);
    this.code = code;
    this.status = errorStatus(code);
    this.details = extras.details;
    this.gates = extras.gates;
    this.requiredScope = extras.requiredScope;
    this.currentEtag = extras.currentEtag;
    this.runId = extras.runId;
  }

  /** The api.md envelope for this error. */
  toEnvelope(requestId: string): ErrorEnvelope {
    const init: ErrorEnvelopeInit = { message: this.message, requestId };
    if (this.details !== undefined) init.details = this.details;
    if (this.gates !== undefined) init.gates = this.gates;
    if (this.requiredScope !== undefined) init.requiredScope = this.requiredScope;
    if (this.currentEtag !== undefined) init.currentEtag = this.currentEtag;
    if (this.runId !== undefined) init.runId = this.runId;
    return errorEnvelope(this.code, init);
  }
}

/**
 * Thrown by every stubbed handler and preview until the phase in the catalog's Phase column
 * implements it. It is not an api.md error code, because no deployed route may return it: a
 * route ships only with its handler.
 */
export class OperationNotImplementedError extends Error {
  override readonly name = "OperationNotImplementedError";
  readonly code = "not_implemented" as const;
  readonly status = 501;
  readonly operationId: OperationId;
  readonly phase: Phase;

  constructor(operationId: OperationId, phase: Phase, what: "handler" | "preview" = "handler") {
    super(`${operationId} ${what} is not implemented yet; it lands in Phase ${phase}`);
    this.operationId = operationId;
    this.phase = phase;
  }
}
