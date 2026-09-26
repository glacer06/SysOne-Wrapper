import { describe, expect, it } from "vitest";
import { packageName } from "./index.js";

describe("@sysone/plugin-sdk", () => {
  it("loads", () => {
    expect(packageName).toBe("@sysone/plugin-sdk");
  });
});
