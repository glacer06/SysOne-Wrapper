import { describe, expect, it } from "vitest";
import { packageName } from "./index.js";

describe("@sysone/db", () => {
  it("loads", () => {
    expect(packageName).toBe("@sysone/db");
  });
});
