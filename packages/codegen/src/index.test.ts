import { describe, expect, it } from "vitest";
import { packageName } from "./index.js";

describe("@sysone/codegen", () => {
  it("loads", () => {
    expect(packageName).toBe("@sysone/codegen");
  });
});
