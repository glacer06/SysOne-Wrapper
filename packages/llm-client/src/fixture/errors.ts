// LLM provider failures as TransportErrors with llm_* codes (architecture.md, ports: llm-client maps
// provider errors to llm_*). Reads the status only, never the body, so provider messages never reach
// a caller. Shared by every LlmTransport, so it lives in the fixture folder, which never imports
// @anthropic-ai/sdk.

import { TransportError } from "@sysone/core";

/** Where an LLM call went. `openrouter` is the optional chat route of ADR-011 (proposed). */
export type LlmRoute = "anthropic" | "openrouter";

/** True for the statuses a retry can fix: timeouts, conflicts, rate limits and server errors. */
export function isRetryableLlmStatus(status: number): boolean {
  return status === 408 || status === 409 || status === 429 || status >= 500;
}

/** A scrubbed llm_unavailable error for an HTTP status. The message names the status and route only. */
export function llmErrorForStatus(status: number, route: LlmRoute, requestId: string | null = null): TransportError {
  return new TransportError(
    { code: "llm_unavailable", retryable: isRetryableLlmStatus(status), requestId },
    `LLM request to ${route} failed with HTTP ${status}`,
  );
}

/** llm_unavailable when the provider could not be reached, after retries. */
export function llmUnreachable(route: LlmRoute): TransportError {
  return new TransportError({ code: "llm_unavailable", retryable: true, requestId: null }, `LLM provider ${route} could not be reached`);
}

/** llm_invalid_reply when a response arrived but SysOne cannot read it. */
export function llmUnreadable(route: LlmRoute, requestId: string | null = null): TransportError {
  return new TransportError({ code: "llm_invalid_reply", retryable: false, requestId }, `LLM provider ${route} returned a response SysOne cannot read`);
}

/** client_aborted, the same code SystemOneTransport uses. */
export function llmAborted(): TransportError {
  return new TransportError({ code: "client_aborted", retryable: false, requestId: null }, "the call was aborted");
}
