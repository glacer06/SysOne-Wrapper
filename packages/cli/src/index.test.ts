import { describe, expect, it } from "vitest";
import { packageName } from "./index.js";

describe("@sysone/cli", () => {
  it("loads", () => {
    expect(packageName).toBe("@sysone/cli");
  });
});
