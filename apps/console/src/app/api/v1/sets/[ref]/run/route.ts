// POST /api/v1/sets/{ref}/run (api.md, Run surface; ADR-020 D2b). The logic and its tests live in
// ~/server/run. This file hands over the raw request parts; the body is read only after the
// caller passes auth and the gates, and every failure goes through the handler's error boundary.

import type { SystemOneTransport } from "@bandwise/core";
import { FixtureTransport, SdkTransport } from "@bandwise/system-one-client/server";
import { createTokenHasher } from "@bandwise/tenancy";

import { getEnv } from "~/env";
import { getDb } from "~/server/db";
import { readLimitedBody } from "~/server/early-access";
import { handleRunHttp, MAX_RUN_BODY_BYTES, type RunHttpDeps } from "~/server/run/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

let transport: SystemOneTransport | undefined;

const log = (message: string, requestId: string) => console.error(`run ${requestId}: ${message}`);

/** Throws when the env is incomplete; handleRunHttp turns that into a generic 503. */
function runDeps(): RunHttpDeps {
  const env = getEnv();
  const pepper = env.BANDWISE_TOKEN_PEPPER;
  if (pepper === undefined) throw new Error("BANDWISE_TOKEN_PEPPER is not set");
  // One transport per server instance, so the SDK client cache survives across requests. Fixture
  // mode answers with synthetic answers only (system-one-client/server), for a local server.
  transport ??= env.SYSTEM_ONE_TRANSPORT === "sdk" ? new SdkTransport() : new FixtureTransport([], { synthesize: true });
  return {
    db: getDb(),
    hasher: createTokenHasher(pepper),
    transport,
    platformKeys: {
      ...(env.TYPESAFE_API_KEY !== undefined ? { typesafe: env.TYPESAFE_API_KEY } : {}),
      ...(env.OPENROUTER_API_KEY !== undefined ? { openrouter: env.OPENROUTER_API_KEY } : {}),
      ...(env.AI_GATEWAY_API_KEY !== undefined ? { vercel: env.AI_GATEWAY_API_KEY } : {}),
    },
    logError: log,
  };
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
  return Response.json(res.body, { status: res.status, headers });
}
