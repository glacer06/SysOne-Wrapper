// The MCP streamable HTTP transport, stateless (ADR-021 section 2). One POST carries one JSON-RPC
// message. A request gets one JSON response; a notification or a response gets 202 with no body.
// There is no session id and no server-to-client stream, so GET and DELETE answer 405.
//
// Transport-agnostic: the caller hands over the method, two headers and the body text, and sends
// back what this returns. Auth happens before this runs; the tools it is given are already the
// ones the caller may see.

/** Newest first. A client that asks for one of these gets it back; any other gets the first. */
export const SUPPORTED_PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26"] as const;

/** Assumed when a request has no MCP-Protocol-Version header (the spec's fallback). */
const DEFAULT_HEADER_VERSION = "2025-03-26";

/** A JSON-RPC body larger than this is refused before parsing. Tool inputs are far below it. */
export const MAX_MCP_BODY_BYTES = 64 * 1024;

export type JsonObject = { [key: string]: unknown };

export interface ToolAnnotations {
  title?: string;
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
}

/** What tools/call returns, before the JSON-RPC wrapper. */
export interface ToolResult {
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: JsonObject;
  isError?: boolean;
  /** Read by the host, not shown to the model: run ids and receipt detail go here. */
  _meta?: JsonObject;
}

export interface McpTool {
  name: string;
  title: string;
  description: string;
  inputSchema: JsonObject;
  annotations: ToolAnnotations;
  call: (args: JsonObject) => Promise<ToolResult>;
}

export interface McpServerInfo {
  name: string;
  title: string;
  version: string;
  /** Shown to the model once, at initialize. */
  instructions?: string;
}

export interface McpHttpRequest {
  method: string;
  /** The MCP-Protocol-Version header, or null. */
  protocolVersion: string | null;
  body: { text: string | null; tooLarge: boolean };
}

export interface McpHttpResponse {
  status: number;
  headers: Record<string, string>;
  /** Null for 202 and 405. */
  body: unknown;
}

// JSON-RPC 2.0 error codes.
const PARSE_ERROR = -32700;
const INVALID_REQUEST = -32600;
const METHOD_NOT_FOUND = -32601;
const INVALID_PARAMS = -32602;
const INTERNAL_ERROR = -32603;

const json = { "content-type": "application/json", "cache-control": "no-store" };

type Id = string | number | null;

const isObject = (x: unknown): x is JsonObject => typeof x === "object" && x !== null && !Array.isArray(x);

function rpcError(id: Id, code: number, message: string, status = 200): McpHttpResponse {
  return { status, headers: { ...json }, body: { jsonrpc: "2.0", id, error: { code, message } } };
}

function rpcResult(id: Id, result: unknown): McpHttpResponse {
  return { status: 200, headers: { ...json }, body: { jsonrpc: "2.0", id, result } };
}

function negotiate(requested: unknown): string {
  return typeof requested === "string" && (SUPPORTED_PROTOCOL_VERSIONS as readonly string[]).includes(requested)
    ? requested
    : SUPPORTED_PROTOCOL_VERSIONS[0];
}

/** What tools/list shows for a tool. The call function stays on the server. */
export function describeTool(tool: McpTool): JsonObject {
  return { name: tool.name, title: tool.title, description: tool.description, inputSchema: tool.inputSchema, annotations: { title: tool.title, ...tool.annotations } };
}

/**
 * Answer one MCP HTTP request. Never throws: a tool that throws becomes JSON-RPC internal error
 * with a generic message, and `onError` gets the error to log by type.
 */
export async function handleMcpHttp(
  req: McpHttpRequest,
  server: McpServerInfo,
  tools: readonly McpTool[],
  onError?: (e: unknown) => void,
): Promise<McpHttpResponse> {
  if (req.method !== "POST") {
    return { status: 405, headers: { allow: "POST", "cache-control": "no-store" }, body: null };
  }
  const headerVersion = req.protocolVersion ?? DEFAULT_HEADER_VERSION;
  if (!(SUPPORTED_PROTOCOL_VERSIONS as readonly string[]).includes(headerVersion)) {
    return rpcError(null, INVALID_REQUEST, `Unsupported MCP-Protocol-Version. This server speaks ${SUPPORTED_PROTOCOL_VERSIONS.join(" and ")}.`, 400);
  }
  if (req.body.tooLarge) return rpcError(null, INVALID_REQUEST, `The body is larger than ${MAX_MCP_BODY_BYTES} bytes.`, 413);

  let message: unknown;
  try {
    message = JSON.parse(req.body.text ?? "");
  } catch {
    return rpcError(null, PARSE_ERROR, "The body is not valid JSON.", 400);
  }
  if (Array.isArray(message)) return rpcError(null, INVALID_REQUEST, "Send one JSON-RPC message per request. Batches are not supported.", 400);
  if (!isObject(message) || message["jsonrpc"] !== "2.0") return rpcError(null, INVALID_REQUEST, "Not a JSON-RPC 2.0 message.", 400);

  const rawId = message["id"];
  const hasId = typeof rawId === "string" || typeof rawId === "number";
  // A notification or a response to us: nothing to answer.
  if (!hasId) return { status: 202, headers: { "cache-control": "no-store" }, body: null };
  const id: Id = rawId;
  if ("result" in message || "error" in message) return { status: 202, headers: { "cache-control": "no-store" }, body: null };

  const method = message["method"];
  if (typeof method !== "string") return rpcError(id, INVALID_REQUEST, "A request needs a method.", 400);
  const params = isObject(message["params"]) ? message["params"] : {};

  switch (method) {
    case "initialize": {
      const result: JsonObject = {
        protocolVersion: negotiate(params["protocolVersion"]),
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: server.name, title: server.title, version: server.version },
      };
      if (server.instructions !== undefined) result["instructions"] = server.instructions;
      return rpcResult(id, result);
    }
    case "ping":
      return rpcResult(id, {});
    case "tools/list":
      return rpcResult(id, { tools: tools.map(describeTool) });
    case "tools/call": {
      const name = params["name"];
      const tool = tools.find((t) => t.name === name);
      if (tool === undefined) return rpcError(id, INVALID_PARAMS, typeof name === "string" ? `No tool ${name} on this server for this token.` : "tools/call needs a tool name.");
      const args = params["arguments"] ?? {};
      if (!isObject(args)) return rpcError(id, INVALID_PARAMS, "arguments must be an object.");
      try {
        return rpcResult(id, await tool.call(args));
      } catch (e) {
        onError?.(e);
        return rpcError(id, INTERNAL_ERROR, "The tool could not be completed.");
      }
    }
    default:
      return rpcError(id, METHOD_NOT_FOUND, `Method ${method} is not supported.`);
  }
}
