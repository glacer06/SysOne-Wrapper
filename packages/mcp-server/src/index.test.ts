import { describe, expect, it } from "vitest";
import * as index from "./index.js";
import { packageName } from "./index.js";

describe("@bandwise/mcp-server", () => {
  it("loads", () => {
    expect(packageName).toBe("@bandwise/mcp-server");
  });

  it("re-exports the gate tools, the HTTP handler and the check formatter", () => {
    expect(Array.isArray(index.GATE_TOOLS)).toBe(true);
    expect(index.GATE_TOOLS).toHaveLength(6);
    expect(typeof index.handleMcpHttp).toBe("function");
    expect(typeof index.formatCheckResult).toBe("function");
  });
});
