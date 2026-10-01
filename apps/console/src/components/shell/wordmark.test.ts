import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const app = fileURLToPath(new URL("../../..", import.meta.url));
const source = readFileSync(join(app, "src/components/shell/wordmark.tsx"), "utf8");
const css = readFileSync(join(app, "src/app/globals.css"), "utf8");

describe("the console header logo (Nick, 2026-10-01)", () => {
  it("shows the supplied primary lockup, one file per theme, served unchanged", () => {
    for (const theme of ["light", "dark"]) {
      const name = `bandwise-lockup-horizontal-A-${theme}.svg`;
      expect(source).toContain(`/brand/${name}`);
      expect(source).toContain(`className="bw-for-${theme}"`);
      const served = join(app, "public/brand", name);
      expect(existsSync(served)).toBe(true);
      expect(readFileSync(served, "utf8")).toBe(readFileSync(join(app, "../../brand/marks", name), "utf8"));
    }
  });

  it("keeps the lockup at or above its 160px minimum", () => {
    for (const w of source.matchAll(/w-\[(\d+)px\]/g)) expect(Number(w[1])).toBeGreaterThanOrEqual(160);
  });

  it("no longer carries the unloaded ant or the typed wordmark", () => {
    for (const gone of ["bw-header-ant", "bw-wordmark", "ant-unloaded"]) {
      expect(source).not.toContain(gone);
      expect(css).not.toContain(gone);
    }
  });
});
