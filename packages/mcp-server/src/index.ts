// Bandwise Gate over MCP (ADR-021): the stateless streamable HTTP transport, the six preset tools
// and how a check result reads to the model. The console serves it at /mcp and supplies auth,
// redaction and the operations. The full curated tool list arrives with Phase 3 and Phase 7.

export const packageName = "@bandwise/mcp-server";

export * from "./format.js";
export * from "./protocol.js";
export * from "./tools.js";
