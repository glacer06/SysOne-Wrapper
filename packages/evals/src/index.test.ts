import { describe, expect, it } from "vitest";
import { packageName } from "./index.js";

describe("@sysone/evals", () => {
  it("loads", () => {
    expect(packageName).toBe("@sysone/evals");
  });
});
