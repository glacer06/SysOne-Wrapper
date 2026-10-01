// POST /api/v1/sets/{ref}/run (api.md, Run surface; ADR-020 D2b). The logic and its tests live in
// ~/server/run. This file reads the request and builds the deps from the env.

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

function deps(): RunHttpDeps {
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
    logError: (message, requestId) => console.error(`run ${requestId}: ${message}`),
  };
}

export async function POST(req: Request, ctx: { params: Promise<{ ref: string }> }): Promise<Response> {
  const requestId = crypto.randomUUID();
  const { ref } = await ctx.params;
  const body = await readLimitedBody(req, MAX_RUN_BODY_BYTES);
  const res = await handleRunHttp(
    {
      authorization: req.headers.get("authorization"),
      ref: decodeURIComponent(ref),
      channel: new URL(req.url).searchParams.get("channel"),
      body: body.text,
      bodyTooLarge: body.tooLarge,
      requestId,
      signal: req.signal,
    },
    deps(),
  );
  return Response.json(res.body, { status: res.status, headers: { "x-request-id": requestId, "cache-control": "no-store" } });
}
