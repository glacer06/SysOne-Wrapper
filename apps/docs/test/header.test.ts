import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const layout = readFileSync(join(root, "src/lib/layout.shared.tsx"), "utf8");
const css = readFileSync(join(root, "src/app/global.css"), "utf8");

describe("the docs header logo (Nick, 2026-10-01)", () => {
  it("shows the supplied primary lockup, one file per theme, served unchanged", () => {
    for (const theme of ["light", "dark"]) {
      const name = `bandwise-lockup-horizontal-A-${theme}.svg`;
      expect(layout).toContain(`/brand/${name}`);
      const served = join(root, "public/brand", name);
      expect(existsSync(served)).toBe(true);
      expect(readFileSync(served, "utf8")).toBe(readFileSync(join(root, "../../brand/marks", name), "utf8"));
    }
  });

  it("names the home link through the shown image", () => {
    expect(layout.match(/alt=\{`\$\{productName\} docs`\}/g)).toHaveLength(2);
  });

  it("no longer carries the unloaded ant or the typed wordmark", () => {
    for (const gone of ["bw-header-ant", "bw-wordmark", "ant-unloaded"]) {
      expect(layout).not.toContain(gone);
      expect(css).not.toContain(gone);
    }
  });
});
