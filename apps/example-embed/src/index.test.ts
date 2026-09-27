import { describe, expect, it } from "vitest";
import { packageName } from "./index.js";

describe("@bandwise/example-embed", () => {
  it("loads", () => {
    expect(packageName).toBe("@bandwise/example-embed");
  });
});
