// POST /api/public/early-access (ADR-018). A plain route outside /api/v1 and the operation
// registry, like the device flow. The logic and its tests live in ~/server/early-access.

import { platformRepositories } from "@bandwise/db";

import { env, isDevelopment } from "~/env";
import { getDb } from "~/server/db";
import {
  clientIpFrom,
  DEVELOPMENT_ORIGINS,
  EARLY_ACCESS_ORIGINS,
  type EarlyAccessDeps,
  handleEarlyAccess,
  type HandlerResponse,
  readLimitedBody,
} from "~/server/early-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function deps(): EarlyAccessDeps {
  return {
    submit: (signup) => getDb().withNoTenant((tx) => platformRepositories.earlyAccessSignups.submit(tx, signup)),
    secret: env.AUTH_SECRET,
    allowedOrigins: isDevelopment ? [...EARLY_ACCESS_ORIGINS, ...DEVELOPMENT_ORIGINS] : EARLY_ACCESS_ORIGINS,
    logError: (message, requestId) => console.error(`early-access ${requestId}: ${message}`),
  };
}

function toResponse(res: HandlerResponse): Response {
  if (res.body === null) return new Response(null, { status: res.status, headers: res.headers });
  return Response.json(res.body, { status: res.status, headers: res.headers });
}

export async function POST(req: Request): Promise<Response> {
  const body = await readLimitedBody(req);
  return toResponse(
    await handleEarlyAccess(
      {
        method: "POST",
        origin: req.headers.get("origin"),
        contentType: req.headers.get("content-type"),
        body: body.text,
        bodyTooLarge: body.tooLarge,
        clientIp: clientIpFrom(req.headers),
      },
      deps(),
    ),
  );
}

export async function OPTIONS(req: Request): Promise<Response> {
  return toResponse(
    await handleEarlyAccess(
      {
        method: "OPTIONS",
        origin: req.headers.get("origin"),
        contentType: null,
        body: null,
        bodyTooLarge: false,
        clientIp: null,
      },
      deps(),
    ),
  );
}
