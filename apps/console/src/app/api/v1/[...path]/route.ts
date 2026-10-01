// Every /api/v1 management route (management-api.md; ADR-020 D2c). The logic and its tests live
// in ~/server/api. Next matches the more specific route files first, so POST
// /api/v1/sets/{ref}/run still goes to sets/[ref]/run/route.ts.

import { createTokenHasher } from "@bandwise/tenancy";

import { getEnv } from "~/env";
import { type ApiDeps, handleApiRequest, MAX_API_BODY_BYTES } from "~/server/api/dispatch";
import { getDb } from "~/server/db";
import { readLimitedBody } from "~/server/early-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function deps(): ApiDeps {
  const pepper = getEnv().BANDWISE_TOKEN_PEPPER;
  if (pepper === undefined) throw new Error("BANDWISE_TOKEN_PEPPER is not set");
  return {
    db: getDb(),
    hasher: createTokenHasher(pepper),
    logError: (message, requestId) => console.error(`api ${requestId}: ${message}`),
  };
}

async function handle(req: Request): Promise<Response> {
  const requestId = crypto.randomUUID();
  const url = new URL(req.url);
  const body = req.method === "GET" || req.method === "DELETE" ? { text: null, tooLarge: false } : await readLimitedBody(req, MAX_API_BODY_BYTES);
  const res = await handleApiRequest(
    {
      method: req.method,
      path: url.pathname,
      query: url.searchParams,
      authorization: req.headers.get("authorization"),
      ifMatch: req.headers.get("if-match"),
      idempotencyKey: req.headers.get("idempotency-key"),
      body: body.text,
      bodyTooLarge: body.tooLarge,
      requestId,
    },
    deps(),
  );
  return Response.json(res.body, { status: res.status, headers: { ...res.headers, "x-request-id": requestId } });
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
