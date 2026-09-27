import { describe, expect, it } from "vitest";
import { packageName } from "./index.js";

describe("@bandwise/codegen", () => {
  it("loads", () => {
    expect(packageName).toBe("@bandwise/codegen");
  });
});
