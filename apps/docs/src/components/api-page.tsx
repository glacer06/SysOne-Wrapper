"use client";
import { createOpenAPIPage } from "fumadocs-openapi/ui";

// The API is not live yet, so the page shows the reference without a request playground.
export const OpenAPIPage = createOpenAPIPage({
  playground: { enabled: false },
});
