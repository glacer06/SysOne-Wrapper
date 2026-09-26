import { describe, expect, it } from "vitest";
import { packageName } from "./index.js";

describe("@sysone/mcp-server", () => {
  it("loads", () => {
    expect(packageName).toBe("@sysone/mcp-server");
  });
});
