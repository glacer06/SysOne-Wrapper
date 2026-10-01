// GET /api/v1/openapi.json (api.md): the public OpenAPI document, no auth. It is rendered from the
// operation registry, which the parity test keeps equal to the committed packages/core/openapi.json.
// Next matches this file before the [...path] catch-all, which would answer 401.

import { renderOpenApi } from "~/server/operations/openapi";

export const runtime = "nodejs";

const DOCUMENT = renderOpenApi();

export function GET(): Response {
  return new Response(DOCUMENT, { headers: { "content-type": "application/json", "cache-control": "public, max-age=300" } });
}
