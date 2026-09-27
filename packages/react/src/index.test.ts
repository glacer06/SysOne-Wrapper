import { describe, expect, it } from "vitest";
import { packageName } from "./index.js";

describe("@bandwise/react", () => {
  it("loads", () => {
    expect(packageName).toBe("@bandwise/react");
  });
});
