import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { UNLOADED_ANT_DARK, UNLOADED_ANT_LIGHT } from "~/components/unloaded-ant-art";
import { inlineUnloadedAnt } from "~/lib/unloaded-ant";

const root = fileURLToPath(new URL("..", import.meta.url));
const brand = (path: string) => readFileSync(join(root, "../../brand", path), "utf8");
const attrs = (svg: string, name: string) => [...svg.matchAll(new RegExp(` ${name}="([^"]*)"`, "g"))].map((m) => m[1]);

describe("the unloaded ant (brand kit v1.7)", () => {
  for (const [theme, inline] of [
    ["light", UNLOADED_ANT_LIGHT],
    ["dark", UNLOADED_ANT_DARK],
  ] as const) {
    const file = brand(`unloaded/bandwise-ant-unloaded-A-r4-right-${theme}.svg`);

    it(`inlines the supplied ${theme} file, regenerated from brand/unloaded`, () => {
      expect(inline).toBe(inlineUnloadedAnt(file));
    });

    it(`keeps every ${theme} path, transform, fill and pivot unchanged`, () => {
      for (const name of ["d", "transform", "fill", "data-pivot-x", "data-pivot-y", "cx", "cy", "r"]) {
        expect(attrs(inline, name)).toEqual(attrs(file, name));
      }
    });
  }

  it("serves the ruler's B files unchanged", () => {
    const files = [
      ["marks", "bandwise-b-monogram-light.svg"],
      ["marks", "bandwise-b-monogram-dark.svg"],
    ] as const;
    for (const [dir, name] of files) {
      const served = join(root, "public/brand", name);
      expect(existsSync(served)).toBe(true);
      expect(readFileSync(served, "utf8")).toBe(brand(`${dir}/${name}`));
    }
  });
});
