import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("..", import.meta.url));
const footer = readFileSync(join(root, "src/components/site-footer.tsx"), "utf8");

describe("the footer (FOOT-B)", () => {
  it("has an Agents column with llms.txt, openapi.json and MCP", () => {
    expect(footer).toContain('title: "Agents"');
    for (const label of ["llms.txt", "openapi.json", "MCP"]) expect(footer).toContain(`label: "${label}"`);
  });

  it("uses the supplied horizontal lockup files, unchanged", () => {
    for (const theme of ["light", "dark"]) {
      const name = `bandwise-lockup-horizontal-C-${theme}.svg`;
      expect(footer).toContain(`/brand/${name}`);
      const served = join(root, "public/brand", name);
      expect(existsSync(served)).toBe(true);
      expect(readFileSync(served, "utf8")).toBe(readFileSync(join(root, "../../brand/marks", name), "utf8"));
    }
  });
});
