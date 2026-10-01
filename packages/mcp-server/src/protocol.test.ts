import { describe, expect, it, vi } from "vitest";
import {
  handleMcpHttp,
  type JsonObject,
  type McpHttpRequest,
  type McpServerInfo,
  type McpTool,
} from "./protocol.js";

const SECRET = "boom: secret internal detail 42";

const readTool: McpTool = {
  name: "echo",
  title: "Echo",
  description: "Returns text.",
  inputSchema: { type: "object", properties: {} },
  annotations: { readOnlyHint: true },
  call: async (args) => ({ content: [{ type: "text", text: `got ${JSON.stringify(args)}` }] }),
};

const throwingTool: McpTool = {
  name: "explode",
  title: "Explode",
  description: "Always throws.",
  inputSchema: { type: "object" },
  annotations: {},
  call: async () => {
    throw new Error(SECRET);
  },
};

const tools = [readTool, throwingTool];
const server: McpServerInfo = { name: "bw", title: "Bandwise", version: "1.2.3" };

function post(message: unknown, protocolVersion: string | null = null): McpHttpRequest {
  return { method: "POST", protocolVersion, body: { text: JSON.stringify(message), tooLarge: false } };
}

function rpc(method: string, params?: unknown, id: string | number = 1): McpHttpRequest {
  return post({ jsonrpc: "2.0", id, method, ...(params === undefined ? {} : { params }) });
}

const errorOf = (body: unknown) => (body as { error: { code: number; message: string } }).error;
const resultOf = (body: unknown) => (body as { result: JsonObject }).result;

describe("handleMcpHttp transport", () => {
  it.each(["GET", "DELETE"])("answers 405 to %s", async (method) => {
    const res = await handleMcpHttp({ method, protocolVersion: null, body: { text: null, tooLarge: false } }, server, tools);
    expect(res.status).toBe(405);
    expect(res.headers["allow"]).toBe("POST");
    expect(res.body).toBeNull();
  });

  it("accepts a missing protocol version header", async () => {
    const res = await handleMcpHttp(rpc("ping"), server, tools);
    expect(res.status).toBe(200);
  });

  it("accepts 2025-06-18", async () => {
    const res = await handleMcpHttp(post({ jsonrpc: "2.0", id: 1, method: "ping" }, "2025-06-18"), server, tools);
    expect(res.status).toBe(200);
  });

  it("rejects an unknown header version with 400 and -32600", async () => {
    const res = await handleMcpHttp(post({ jsonrpc: "2.0", id: 1, method: "ping" }, "1999-01-01"), server, tools);
    expect(res.status).toBe(400);
    expect(errorOf(res.body).code).toBe(-32600);
  });

  it("answers 413 for a body that is too large", async () => {
    const res = await handleMcpHttp({ method: "POST", protocolVersion: null, body: { text: null, tooLarge: true } }, server, tools);
    expect(res.status).toBe(413);
  });

  it("answers 400 and -32700 for invalid JSON", async () => {
    const res = await handleMcpHttp({ method: "POST", protocolVersion: null, body: { text: "{nope", tooLarge: false } }, server, tools);
    expect(res.status).toBe(400);
    expect(errorOf(res.body).code).toBe(-32700);
  });

  it("answers 400 and -32600 for a batch array", async () => {
    const res = await handleMcpHttp(post([{ jsonrpc: "2.0", id: 1, method: "ping" }]), server, tools);
    expect(res.status).toBe(400);
    expect(errorOf(res.body).code).toBe(-32600);
  });

  it("answers 400 when jsonrpc 2.0 is missing", async () => {
    const res = await handleMcpHttp(post({ id: 1, method: "ping" }), server, tools);
    expect(res.status).toBe(400);
    expect(errorOf(res.body).code).toBe(-32600);
  });

  it("answers 202 with a null body for a notification", async () => {
    const res = await handleMcpHttp(post({ jsonrpc: "2.0", method: "notifications/initialized" }), server, tools);
    expect(res.status).toBe(202);
    expect(res.body).toBeNull();
  });

  it("answers 202 for a JSON-RPC response object", async () => {
    const res = await handleMcpHttp(post({ jsonrpc: "2.0", id: 7, result: {} }), server, tools);
    expect(res.status).toBe(202);
    expect(res.body).toBeNull();
  });
});

describe("initialize", () => {
  it("echoes a supported requested version", async () => {
    const res = await handleMcpHttp(rpc("initialize", { protocolVersion: "2025-03-26" }), server, tools);
    expect(resultOf(res.body)["protocolVersion"]).toBe("2025-03-26");
  });

  it("falls back to 2025-06-18 for an unsupported version", async () => {
    const res = await handleMcpHttp(rpc("initialize", { protocolVersion: "2020-01-01" }), server, tools);
    expect(resultOf(res.body)["protocolVersion"]).toBe("2025-06-18");
  });

  it("reports capabilities and server info", async () => {
    const res = await handleMcpHttp(rpc("initialize", {}), server, tools);
    const result = resultOf(res.body);
    expect(result["capabilities"]).toEqual({ tools: { listChanged: false } });
    expect(result["serverInfo"]).toEqual({ name: "bw", title: "Bandwise", version: "1.2.3" });
    expect("instructions" in result).toBe(false);
  });

  it("includes instructions only when given", async () => {
    const res = await handleMcpHttp(rpc("initialize", {}), { ...server, instructions: "Use me well." }, tools);
    expect(resultOf(res.body)["instructions"]).toBe("Use me well.");
  });
});

describe("ping and tools/list", () => {
  it("answers ping with an empty result", async () => {
    const res = await handleMcpHttp(rpc("ping"), server, tools);
    expect(res.status).toBe(200);
    expect(resultOf(res.body)).toEqual({});
  });

  it("lists tools without the call function and merges the title into annotations", async () => {
    const res = await handleMcpHttp(rpc("tools/list"), server, tools);
    const listed = resultOf(res.body)["tools"] as JsonObject[];
    expect(listed).toHaveLength(2);
    expect(listed[0]).toEqual({
      name: "echo",
      title: "Echo",
      description: "Returns text.",
      inputSchema: { type: "object", properties: {} },
      annotations: { title: "Echo", readOnlyHint: true },
    });
    for (const t of listed) expect("call" in t).toBe(false);
    expect(JSON.stringify(res.body)).not.toContain('"call"');
  });
});

describe("tools/call", () => {
  it("answers -32602 for an unknown tool", async () => {
    const res = await handleMcpHttp(rpc("tools/call", { name: "nope" }), server, tools);
    expect(errorOf(res.body).code).toBe(-32602);
  });

  it("answers -32602 for non-object arguments", async () => {
    const res = await handleMcpHttp(rpc("tools/call", { name: "echo", arguments: "text" }), server, tools);
    expect(errorOf(res.body).code).toBe(-32602);
  });

  it("defaults missing arguments to an empty object", async () => {
    const res = await handleMcpHttp(rpc("tools/call", { name: "echo" }), server, tools);
    expect(resultOf(res.body)).toEqual({ content: [{ type: "text", text: "got {}" }] });
  });

  it("returns the tool result under result", async () => {
    const res = await handleMcpHttp(rpc("tools/call", { name: "echo", arguments: { a: 1 } }), server, tools);
    expect(res.status).toBe(200);
    expect(resultOf(res.body)).toEqual({ content: [{ type: "text", text: 'got {"a":1}' }] });
  });

  it("turns a throwing tool into a generic -32603 and logs the error once", async () => {
    const onError = vi.fn();
    const res = await handleMcpHttp(rpc("tools/call", { name: "explode" }), server, tools, onError);
    const err = errorOf(res.body);
    expect(err.code).toBe(-32603);
    expect(err.message).toBe("The tool could not be completed.");
    expect(onError).toHaveBeenCalledTimes(1);
    const logged = onError.mock.calls[0]?.[0] as Error;
    expect(logged).toBeInstanceOf(Error);
    expect(logged.message).toBe(SECRET);
    expect(JSON.stringify(res.body)).not.toContain(SECRET);
    expect(JSON.stringify(res.body)).not.toContain("secret internal detail");
  });
});

describe("methods and ids", () => {
  it("answers -32601 for an unknown method", async () => {
    const res = await handleMcpHttp(rpc("resources/list"), server, tools);
    expect(errorOf(res.body).code).toBe(-32601);
  });

  it("echoes string and numeric ids", async () => {
    const s = await handleMcpHttp(rpc("ping", undefined, "abc-1"), server, tools);
    expect((s.body as { id: unknown }).id).toBe("abc-1");
    const n = await handleMcpHttp(rpc("ping", undefined, 42), server, tools);
    expect((n.body as { id: unknown }).id).toBe(42);
    const e = await handleMcpHttp(rpc("nope", undefined, "x9"), server, tools);
    expect((e.body as { id: unknown }).id).toBe("x9");
  });
});
