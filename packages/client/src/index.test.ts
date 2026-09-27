import { describe, expect, it } from "vitest";
import { packageName } from "./index.js";

describe("@bandwise/client", () => {
  it("loads", () => {
    expect(packageName).toBe("@bandwise/client");
  });
});
