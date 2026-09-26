import { describe, expect, it } from "vitest";
import { packageName } from "./index.js";

describe("@sysone/react", () => {
  it("loads", () => {
    expect(packageName).toBe("@sysone/react");
  });
});
