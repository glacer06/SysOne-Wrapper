import { describe, expect, it } from "vitest";
import { packageName } from "./index.js";

describe("@bandwise/mcp-server", () => {
  it("loads", () => {
    expect(packageName).toBe("@bandwise/mcp-server");
  });
});
