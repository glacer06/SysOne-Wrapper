import { describe, expect, it } from "vitest";
import { packageName } from "./index.js";

describe("@sysone/example-embed", () => {
  it("loads", () => {
    expect(packageName).toBe("@sysone/example-embed");
  });
});
