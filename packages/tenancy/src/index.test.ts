import { describe, expect, it } from "vitest";
import { packageName } from "./index.js";

describe("@sysone/tenancy", () => {
  it("loads", () => {
    expect(packageName).toBe("@sysone/tenancy");
  });
});
