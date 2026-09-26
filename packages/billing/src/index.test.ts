import { describe, expect, it } from "vitest";
import { packageName } from "./index.js";

describe("@sysone/billing", () => {
  it("loads", () => {
    expect(packageName).toBe("@sysone/billing");
  });
});
