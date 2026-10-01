// The HTTP half of `POST /api/v1/sets/{ref}/run`: bearer auth, the body, and the api.md error
// envelope. The route file only hands over the raw request parts; everything that decides an
// answer is here, so it is tested without Next.
//
// Order matters and is all inside one error boundary: deps, bearer auth, the caller gates
// (internal org, run scope), and only then the ref, the channel and the body. So an
// unauthenticated or denied caller never makes the server read the body, and learns nothing
// from validation errors.

import { errorEnvelope, JsonValue, PointerChannel, RunOptions } from "@bandwise/core";
import type { TokenHasher } from "@bandwise/tenancy";
import { z } from "zod";

import { authenticateBearer } from "../auth/bearer";
import { OperationError } from "../operations/errors";
import { inputIssuesToDetails } from "../operations/run-operation";
import { assertRunCaller, runSetForCaller, type RunSetDeps } from "./run-set";

/** A state larger than this is refused before parsing. The model limits are far below it. */
export const MAX_RUN_BODY_BYTES = 256 * 1024;

export const RunBody = z.strictObject({ state: JsonValue, options: RunOptions.optional() });

export interface RunHttpInput {
  authorization: string | null;
  /** The path segment as received, still percent-encoded. */
  rawRef: string;
  /** `?channel=`, or null. */
  channel: string | null;
  /** Reads the body. Called only after the caller passes auth and the gates. */
  readBody: () => Promise<{ text: string | null; tooLarge: boolean }>;
  requestId: string;
  signal?: AbortSignal;
}

export interface RunHttpDeps extends RunSetDeps {
  hasher: TokenHasher;
  nowDate?: () => Date;
  logError?: (message: string, requestId: string) => void;
}

export interface RunHttpResponse {
  status: number;
  body: unknown;
}

function unexpected(e: unknown, requestId: string, log: ((message: string, requestId: string) => void) | undefined): RunHttpResponse {
  // Never echo or log an unexpected error's message: a database, env or provider error can quote
  // the state or a secret. The log line names the error type and the request id.
  log?.(e instanceof Error ? e.name : "unknown error", requestId);
  return { status: 503, body: errorEnvelope("system_one_unavailable", { message: "The run could not be completed.", requestId }) };
}

/**
 * Answer one run request. `loadDeps` is called inside the error boundary, so a missing env
 * variable is a generic 503 like any other unexpected failure. `fallbackLog` is used when the
 * deps themselves cannot be built.
 */
export async function handleRunHttp(
  input: RunHttpInput,
  loadDeps: () => RunHttpDeps,
  fallbackLog?: (message: string, requestId: string) => void,
): Promise<RunHttpResponse> {
  const { requestId } = input;
  let log = fallbackLog;
  try {
    const deps = loadDeps();
    log = deps.logError ?? fallbackLog;

    const auth = await authenticateBearer(input.authorization, { db: deps.db, hasher: deps.hasher, now: deps.nowDate ?? (() => new Date()), requestId });
    assertRunCaller(auth.ctx, auth.orgSlug);

    let ref: string;
    try {
      ref = decodeURIComponent(input.rawRef);
    } catch {
      throw new OperationError("invalid_request", "The set ref is not valid percent-encoding.");
    }
    let channel: PointerChannel | undefined;
    if (input.channel !== null) {
      const c = PointerChannel.safeParse(input.channel);
      if (!c.success) throw new OperationError("invalid_request", "channel is production or staging.");
      channel = c.data;
    }

    let raw: { text: string | null; tooLarge: boolean };
    try {
      raw = await input.readBody();
    } catch {
      throw new OperationError("invalid_request", "The body could not be read.");
    }
    if (raw.tooLarge) throw new OperationError("invalid_request", `The body is larger than ${MAX_RUN_BODY_BYTES} bytes.`);
    let json: unknown;
    try {
      json = JSON.parse(raw.text ?? "");
    } catch {
      throw new OperationError("invalid_request", "The body is not valid JSON.");
    }
    const body = RunBody.safeParse(json);
    if (!body.success) throw new OperationError("invalid_request", "The run body is invalid.", { details: inputIssuesToDetails(body.error) });

    const result = await runSetForCaller(auth.ctx, auth.orgSlug, { ref, channel, state: body.data.state, options: body.data.options }, deps, input.signal);
    return { status: 200, body: result };
  } catch (e) {
    if (e instanceof OperationError) return { status: e.status, body: e.toEnvelope(requestId) };
    return unexpected(e, requestId, log);
  }
}
