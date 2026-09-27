import { describe, expect, it } from "vitest";
import { packageName } from "./index.js";

describe("@bandwise/evals", () => {
  it("loads", () => {
    expect(packageName).toBe("@bandwise/evals");
  });
});
