import { describe, expect, it } from "vitest";
import * as core from "@sysone/core";
import { packageName } from "./index.js";

describe("@sysone/system-one-client", () => {
  it("loads", () => {
    expect(packageName).toBe("@sysone/system-one-client");
  });

  it("resolves @sysone/core from source without a build", () => {
    expect(core).toBeTypeOf("object");
  });
});
