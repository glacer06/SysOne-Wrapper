// Runs the real export into a temp folder: the tree must scan clean and have the shape the
// public repo needs. Installing, building and testing that tree is the release runbook's job.

import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type ExportReport, KIT_VERSION, PUBLISHED_PACKAGES, exportKit, readCatalog } from "./export.js";

let out = "";
let report: ExportReport;
const read = (rel: string): string => readFileSync(join(out, rel), "utf8");
const json = (rel: string): Record<string, unknown> => JSON.parse(read(rel)) as Record<string, unknown>;

beforeAll(() => {
  out = mkdtempSync(join(tmpdir(), "bandwise-kit-"));
  report = exportKit({ outDir: out });
});

afterAll(() => {
  rmSync(out, { recursive: true, force: true });
});

describe("exportKit", () => {
  it("writes a tree the scanner finds clean", () => {
    expect(report.findings).toEqual([]);
  });

  it("has the root files of the public repo", () => {
    for (const f of [
      "LICENSE",
      "NOTICE",
      "README.md",
      "CONTRIBUTING.md",
      "SECURITY.md",
      "CODE_OF_CONDUCT.md",
      ".gitignore",
      ".nvmrc",
      "package.json",
      "pnpm-workspace.yaml",
      ".github/workflows/ci.yml",
      ".github/workflows/release.yml",
      "packages/config/tsconfig/base.json",
      "examples/email-triage.spec.json",
      "examples/email-triage.state.json",
      "plugins/claude-code/skills/find-decisions/SKILL.md",
    ]) {
      expect(existsSync(join(out, f)), f).toBe(true);
    }
    expect(read(".nvmrc").trim()).toBe("22");
    expect(read("LICENSE")).toContain("Apache License");
    expect(read("LICENSE")).toContain("Copyright 2026 Bandwise");
  });

  it("leaves out the closed product and the private contract snapshots", () => {
    for (const f of ["apps", "docs", ".claude", "packages/db", "packages/llm-client", "packages/core/openapi.json", "packages/system-one-client/contract"]) {
      expect(existsSync(join(out, f)), f).toBe(false);
    }
  });

  it("gives every published package the same version, license, repository and public access", () => {
    for (const dir of PUBLISHED_PACKAGES) {
      const m = json(`packages/${dir}/package.json`);
      expect(m["name"]).toBe(`@bandwise/${dir}`);
      expect(m["version"]).toBe(KIT_VERSION);
      expect(m["license"]).toBe("Apache-2.0");
      expect(m["private"]).toBeUndefined();
      expect(m["homepage"]).toBe("https://docs.bandwise.dev");
      expect(m["repository"]).toEqual({ type: "git", url: "git+https://github.com/glacer06/bandwise-kit.git", directory: `packages/${dir}` });
      expect(m["publishConfig"]).toMatchObject({ access: "public" });
      expect(existsSync(join(out, `packages/${dir}/LICENSE`))).toBe(true);
      expect(existsSync(join(out, `packages/${dir}/README.md`))).toBe(true);
    }
    expect(json("packages/config/package.json")["private"]).toBe(true);
  });

  it("makes core and the fixture transport real dependencies of the CLI", () => {
    const cli = json("packages/cli/package.json");
    expect(cli["dependencies"]).toEqual({ "@bandwise/core": "workspace:*", "@bandwise/system-one-client": "workspace:*" });
    expect(cli["peerDependencies"]).toBeUndefined();
  });

  it("resolves every workspace and catalog range inside the kit", () => {
    const catalog = readCatalog(read("pnpm-workspace.yaml"));
    const names = new Set(["config", ...PUBLISHED_PACKAGES].map((d) => `@bandwise/${d}`));
    for (const dir of ["config", ...PUBLISHED_PACKAGES]) {
      const m = json(`packages/${dir}/package.json`);
      for (const field of ["dependencies", "devDependencies", "peerDependencies"]) {
        for (const [name, range] of Object.entries((m[field] ?? {}) as Record<string, string>)) {
          if (range.startsWith("workspace:")) expect(names.has(name), `${dir} ${name}`).toBe(true);
          if (range === "catalog:") expect(catalog[name], `${dir} ${name}`).toBeDefined();
        }
      }
    }
    expect(Object.keys(catalog)).not.toContain("next");
    expect(Object.keys(catalog)).not.toContain("drizzle-orm");
  });

  it("lists every template in the README, with the independence line", () => {
    const readme = read("README.md");
    const ids = readdirSync(join(out, "plugins/claude-code/skills/find-decisions/templates"))
      .filter((f) => f.endsWith(".spec.json"))
      .map((f) => f.replace(/\.spec\.json$/, ""));
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) expect(readme).toContain(`\`${id}\``);
    expect(readme).toContain("Bandwise is an independent product built on TypeSafe's System One models.");
    expect(readme).toContain("https://www.bandwise.dev");
  });

  it("follows the writing rules in every prose file it writes", () => {
    const banned = /\b(leverage|utilize|delve|seamless|robust|comprehensive|cutting-edge|streamline|empower|unlock|furthermore|moreover)\b/i;
    const prose = [
      "README.md",
      "CONTRIBUTING.md",
      "SECURITY.md",
      "CODE_OF_CONDUCT.md",
      "NOTICE",
      ...PUBLISHED_PACKAGES.map((d) => `packages/${d}/README.md`),
    ];
    for (const f of prose) {
      const text = read(f);
      expect(text, f).not.toMatch(/—/);
      expect(text, f).not.toMatch(banned);
      expect(text, f).not.toMatch(/\p{Extended_Pictographic}/u);
    }
  });

  it("publishes with OIDC only: id-token write, provenance, and no token anywhere", () => {
    const release = read(".github/workflows/release.yml");
    expect(release).toContain("id-token: write");
    expect(release).toContain("--provenance --access public");
    expect(release).not.toMatch(/NPM_TOKEN|NODE_AUTH_TOKEN|secrets\./);
    expect(release.indexOf("for pkg in core system-one-client templates cli")).toBeGreaterThan(0);
    const ci = read(".github/workflows/ci.yml");
    expect(ci).toMatch(/permissions:\n {2}contents: read/);
  });

  it("refuses to clear a folder that is not a kit checkout", () => {
    const other = mkdtempSync(join(tmpdir(), "not-kit-"));
    try {
      writeFileSync(join(other, "keep.txt"), "mine");
      expect(() => exportKit({ outDir: other })).toThrow(/not a bandwise-kit checkout/);
      expect(readFileSync(join(other, "keep.txt"), "utf8")).toBe("mine");
    } finally {
      rmSync(other, { recursive: true, force: true });
    }
  });

  it("re-exports over its own output and keeps a lockfile", () => {
    writeFileSync(join(out, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
    writeFileSync(join(out, "stale.txt"), "old");
    const again = exportKit({ outDir: out });
    expect(again.findings).toEqual([]);
    expect(existsSync(join(out, "stale.txt"))).toBe(false);
    expect(existsSync(join(out, "pnpm-lock.yaml"))).toBe(true);
  });
});
