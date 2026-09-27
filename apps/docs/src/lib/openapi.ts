import { type Document } from "fumadocs-openapi";
import { createOpenAPI } from "fumadocs-openapi/server";
import { apiDocument } from "./api-spec";

/** Schema id of the one API document. */
export const API_SCHEMA_ID = "bandwise";

// Server only. The document is read from packages/core/openapi.json when the pages are built.
export const openapi = createOpenAPI({
  input: {
    [API_SCHEMA_ID]: () => apiDocument() as unknown as Document,
  },
});
