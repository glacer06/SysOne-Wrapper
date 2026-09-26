import { describe, expect, it } from "vitest";
import { packageName } from "./index.js";

describe("@sysone/llm-client", () => {
  it("loads", () => {
    expect(packageName).toBe("@sysone/llm-client");
  });
});
