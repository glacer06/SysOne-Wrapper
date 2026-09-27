import { describe, expect, it } from "vitest";
import { packageName } from "./index.js";

describe("@bandwise/billing", () => {
  it("loads", () => {
    expect(packageName).toBe("@bandwise/billing");
  });
});
