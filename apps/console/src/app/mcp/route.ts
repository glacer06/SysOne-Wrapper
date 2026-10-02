// /mcp: Bandwise Gate over MCP streamable HTTP, stateless (ADR-021). The logic and its tests live
// in ~/server/mcp. This file hands over the raw request parts.

import { MAX_MCP_BODY_BYTES } from "@bandwise/mcp-server";
import { createTokenHasher } from "@bandwise/tenancy";

import { getEnv } from "~/env";
import { readLimitedBody } from "~/server/early-access";
import { handleMcpRequest, type McpDeps } from "~/server/mcp/handler";
import { serverRunDeps } from "~/server/run/deps";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const log = (message: string, requestId: string) => console.error(`mcp ${requestId}: ${message}`);

/** Throws when the env is incomplete; handleMcpRequest turns that into a generic 503. */
function deps(): McpDeps {
  const pepper = getEnv().BANDWISE_TOKEN_PEPPER;
  if (pepper === undefined) throw new Error("BANDWISE_TOKEN_PEPPER is not set");
  const run = serverRunDeps();
  return { run, ops: { db: run.db, logError: log }, hasher: createTokenHasher(pepper), logError: log };
}

async function handle(req: Request): Promise<Response> {
  const requestId = crypto.randomUUID();
  const res = await handleMcpRequest(
    {
      method: req.method,
      authorization: req.headers.get("authorization"),
      origin: req.headers.get("origin"),
      protocolVersion: req.headers.get("mcp-protocol-version"),
      readBody: () => readLimitedBody(req, MAX_MCP_BODY_BYTES),
      requestId,
      signal: req.signal,
    },
    deps,
    log,
  );
  const headers = { ...res.headers, "x-request-id": requestId };
  return res.body === null ? new Response(null, { status: res.status, headers }) : Response.json(res.body, { status: res.status, headers });
}

export const GET = handle;
export const POST = handle;
export const DELETE = handle;
