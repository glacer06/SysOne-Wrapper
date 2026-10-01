// POST /api/v1/sets/{ref}/run (api.md, Run surface; ADR-020 D2b). The logic and its tests live in
// ~/server/run. This file hands over the raw request parts; the body is read only after the
// caller passes auth and the gates, and every failure goes through the handler's error boundary.

import { createTokenHasher } from "@bandwise/tenancy";

import { getEnv } from "~/env";
import { readLimitedBody } from "~/server/early-access";
import { serverRunDeps } from "~/server/run/deps";
import { handleRunHttp, MAX_RUN_BODY_BYTES, type RunHttpDeps } from "~/server/run/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const log = (message: string, requestId: string) => console.error(`run ${requestId}: ${message}`);

/** Throws when the env is incomplete; handleRunHttp turns that into a generic 503. */
function runDeps(): RunHttpDeps {
  const pepper = getEnv().BANDWISE_TOKEN_PEPPER;
  if (pepper === undefined) throw new Error("BANDWISE_TOKEN_PEPPER is not set");
  return { ...serverRunDeps(), hasher: createTokenHasher(pepper), logError: log };
}

export async function POST(req: Request, ctx: { params: Promise<{ ref: string }> }): Promise<Response> {
  const requestId = crypto.randomUUID();
  const headers = { "x-request-id": requestId, "cache-control": "no-store" };
  let rawRef = "";
  try {
    rawRef = (await ctx.params).ref;
  } catch {
    // An unreadable path falls through as an empty ref, which the handler refuses after auth.
  }
  const res = await handleRunHttp(
    {
      authorization: req.headers.get("authorization"),
      rawRef,
      channel: new URL(req.url).searchParams.get("channel"),
      readBody: () => readLimitedBody(req, MAX_RUN_BODY_BYTES),
      requestId,
      signal: req.signal,
    },
    runDeps,
    log,
  );
  return Response.json(res.body, { status: res.status, headers: { ...headers, ...res.headers } });
}
