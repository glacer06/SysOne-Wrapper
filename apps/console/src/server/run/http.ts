// The HTTP half of `POST /api/v1/sets/{ref}/run`: bearer auth, the body, and the api.md error
// envelope. The route file only reads the request and builds the deps; everything that decides an
// answer is here, so it is tested without Next.

import { errorEnvelope, JsonValue, PointerChannel, RunOptions } from "@bandwise/core";
import type { TokenHasher } from "@bandwise/tenancy";
import { z } from "zod";

import { authenticateBearer } from "../auth/bearer";
import { OperationError } from "../operations/errors";
import { inputIssuesToDetails } from "../operations/run-operation";
import { runSetForCaller, type RunSetDeps } from "./run-set";

/** A state larger than this is refused before parsing. The model limits are far below it. */
export const MAX_RUN_BODY_BYTES = 256 * 1024;

export const RunBody = z.strictObject({ state: JsonValue, options: RunOptions.optional() });

export interface RunHttpInput {
  authorization: string | null;
  ref: string;
  /** `?channel=`, or null. */
  channel: string | null;
  body: string | null;
  bodyTooLarge: boolean;
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

function refuse(e: OperationError, requestId: string): RunHttpResponse {
  return { status: e.status, body: e.toEnvelope(requestId) };
}

export async function handleRunHttp(input: RunHttpInput, deps: RunHttpDeps): Promise<RunHttpResponse> {
  const { requestId } = input;
  try {
    // Auth first, so an unauthenticated caller learns nothing about the body or the set.
    const auth = await authenticateBearer(input.authorization, { db: deps.db, hasher: deps.hasher, now: deps.nowDate ?? (() => new Date()), requestId });

    if (input.bodyTooLarge) throw new OperationError("invalid_request", `The body is larger than ${MAX_RUN_BODY_BYTES} bytes.`);
    let json: unknown;
    try {
      json = JSON.parse(input.body ?? "");
    } catch {
      throw new OperationError("invalid_request", "The body is not valid JSON.");
    }
    const body = RunBody.safeParse(json);
    if (!body.success) throw new OperationError("invalid_request", "The run body is invalid.", { details: inputIssuesToDetails(body.error) });
    let channel: PointerChannel | undefined;
    if (input.channel !== null) {
      const c = PointerChannel.safeParse(input.channel);
      if (!c.success) throw new OperationError("invalid_request", "channel is production or staging.");
      channel = c.data;
    }

    const result = await runSetForCaller(auth.ctx, auth.orgSlug, { ref: input.ref, channel, state: body.data.state, options: body.data.options }, deps, input.signal);
    return { status: 200, body: result };
  } catch (e) {
    if (e instanceof OperationError) return refuse(e, requestId);
    // Never echo or log an unexpected error's message: a database or provider error can quote the
    // state. The log line names the error type and the request id, which is enough to find it.
    deps.logError?.(e instanceof Error ? e.name : "unknown error", requestId);
    return { status: 503, body: errorEnvelope("system_one_unavailable", { message: "The run could not be completed.", requestId }) };
  }
}
