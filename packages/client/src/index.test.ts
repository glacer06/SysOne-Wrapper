import { describe, expect, it } from "vitest";
import { packageName } from "./index.js";

describe("@sysone/client", () => {
  it("loads", () => {
    expect(packageName).toBe("@sysone/client");
  });
});
