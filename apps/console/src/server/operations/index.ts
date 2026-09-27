// Operation registry: one OperationDef per management capability, shared by Server Actions,
// /api/v1, the bandwise CLI and the MCP server (references/management-api.md).

export * from "./define";
export * from "./errors";
export * from "./registry";
export * from "./run-operation";
export { buildOpenApiDocument, renderOpenApi, type OpenApiDocument } from "./openapi";
