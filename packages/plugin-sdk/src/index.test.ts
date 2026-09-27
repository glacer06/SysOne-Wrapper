import { describe, expect, it } from "vitest";
import { packageName } from "./index.js";

describe("@bandwise/plugin-sdk", () => {
  it("loads", () => {
    expect(packageName).toBe("@bandwise/plugin-sdk");
  });
});
