import { type Document } from "fumadocs-openapi";
import { createOpenAPI } from "fumadocs-openapi/server";
import { apiDocument, breakInlineSchemaCycles } from "./api-spec";

/** Schema id of the one API document. */
export const API_SCHEMA_ID = "bandwise";

// Server only. The document is read from packages/core/openapi.json when the pages are built.
// Self-containing schemas such as JsonValue are cut where the renderer would expand them forever.
export const openapi = createOpenAPI({
  input: {
    [API_SCHEMA_ID]: () => breakInlineSchemaCycles(apiDocument()) as unknown as Document,
  },
});
