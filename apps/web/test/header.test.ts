import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("..", import.meta.url));
const header = readFileSync(join(root, "src/components/site-header.tsx"), "utf8");
const css = readFileSync(join(root, "src/app/global.css"), "utf8");

describe("the header logo (Nick, 2026-10-01)", () => {
  it("shows the supplied primary lockup, one file per theme, served unchanged", () => {
    for (const theme of ["light", "dark"]) {
      const name = `bandwise-lockup-horizontal-A-${theme}.svg`;
      expect(header).toContain(`/brand/${name}`);
      const served = join(root, "public/brand", name);
      expect(existsSync(served)).toBe(true);
      expect(readFileSync(served, "utf8")).toBe(readFileSync(join(root, "../../brand/marks", name), "utf8"));
    }
  });

  it("names the home link and keeps the images decorative", () => {
    expect(header).toContain('aria-label={`${productName} home`}');
    expect(header).toContain('<span className="header-lockup" aria-hidden="true">');
  });

  it("follows data-theme as well as the system setting", () => {
    expect(css).toContain(':root:not([data-theme="light"]) .header-lockup .header-lockup-dark');
    expect(css).toContain('[data-theme="dark"] .header-lockup .header-lockup-dark');
  });

  it("no longer carries the unloaded ant or the typed wordmark", () => {
    for (const gone of ["header-ant", "wordmark-pair", "ant-unloaded"]) {
      expect(header).not.toContain(gone);
      expect(css).not.toContain(gone);
    }
  });
});
