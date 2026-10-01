import { describe, expect, it } from "vitest";

import { checkJson } from "./json-check";

describe("checkJson", () => {
  it("returns the parsed value for valid JSON", () => {
    expect(checkJson('{"a": [1, 2]}')).toEqual({ ok: true, value: { a: [1, 2] } });
  });

  it("names the line of the first error", () => {
    const res = checkJson('{\n  "a": 1,\n  bad\n}');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.line).toBe(3);
  });
});
