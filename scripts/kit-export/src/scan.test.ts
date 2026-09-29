import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { formatFindings, scanPath, scanText, scanTree } from "./scan.js";

const rules = (text: string, internalDocNames: string[] = []): string[] =>
  scanText("f.ts", text, { internalDocNames }).map((f) => f.rule);

describe("scanText", () => {
  it.each([
    ["the SGR org", "word.sgr"],
    ["a City of Dallas pilot", "word.dallas"],
    ["the Embers CRM", "word.embers"],
    ["NSIMS", "word.nsims"],
    ["Hi Nick, please approve", "word.owner-name"],
    ["sent via Instinct", "word.assistant-names"],
    ["see NSI-714", "ref.linear-id"],
    ["https://linear.app/team/issue/X-1", "ref.linear-link"],
    ["accepted in ADR-012", "ref.adr"],
    ["read .claude/skills/bandwise-builder/SKILL.md", "ref.claude-dir"],
    ["keys in .claude/settings.local.json", "ref.claude-dir"],
    ["see .claude/agents/x.md", "ref.claude-dir"],
    ["docs/adr/019-open-core-split.md", "ref.docs-adr"],
    ["phase-3b.md checklist", "ref.phase-doc"],
    ["the bandwise-builder skill", "ref.internal-skill"],
    ["(spec-schema.md section 2)", "ref.internal-doc"],
    ["references/api.md", "ref.internal-doc"],
    ["mail ops@company.com", "secret.email"],
    ["sk_live_0123456789abcdef", "secret.bandwise-token"],
    ["sa_live_abcdefgh1234", "secret.bandwise-token"],
    ["sk-ant-api03-abcdefghijklmnopqrstuvwxyz", "secret.sk-dash"],
    ["whsec_abcdefgh12345", "secret.stripe-webhook"],
    ["ghp_abcdefghijklmnopqrstuvwxyz0123", "secret.github"],
    ["AKIAABCDEFGHIJKLMNOP", "secret.aws"],
    ["-----BEGIN RSA PRIVATE KEY-----", "secret.private-key"],
    ["TYPESAFE_API_KEY=abcdefghijklmnop", "secret.assignment"],
    ["postgres://app:hunter2@db:5432/app", "secret.connection-string"],
    ["http://localhost:3000/api", "host.internal"],
    ["https://db.internal/metrics", "host.internal"],
    ["https://bandwise-git-main.vercel.app", "host.internal"],
    ["https://staging.bandwise.dev", "host.bandwise-internal"],
  ])("flags %j", (text, rule) => {
    expect(rules(text)).toContain(rule);
  });

  it.each([
    "ana@example.com and raj@customer.example.com and hello@yourco.example",
    "the sk_live_ and sk_test_ prefixes, pk_live_ too",
    "https://docs.typesafe.ai/api.md and https://docs.typesafe.ai/models.md",
    "copy the folder into .claude/skills/ or ~/.claude/skills/find-decisions",
    "merge them into .claude/settings.json yourself",
    "https://www.bandwise.dev and https://docs.bandwise.dev",
    "import { z } from \"zod\"; // @bandwise/core",
    "TYPESAFE_API_KEY is read from your env",
    "SECURITY.md and CONTRIBUTING.md",
  ])("allows %j", (text) => {
    expect(rules(text)).toEqual([]);
  });

  it("uses extra internal doc names", () => {
    expect(rules("see team-notes.md", ["team-notes.md"])).toEqual(["ref.internal-doc"]);
    expect(rules("see team-notes.md")).toEqual([]);
  });

  it("reports the line and the match", () => {
    expect(scanText("a.md", "ok\nfrom ADR-007 on\n")).toEqual([{ file: "a.md", line: 2, rule: "ref.adr", match: "ADR-007" }]);
  });
});

describe("scanPath", () => {
  it.each([
    [".claude/skills/x/SKILL.md", "path.claude"],
    ["apps/console/page.tsx", "path.apps"],
    ["docs/adr/001-stack.md", "path.adr"],
    ["packages/db/src/schema.ts", "path.closed-package"],
    ["packages/tenancy/", "path.closed-package"],
    ["packages/billing/package.json", "path.closed-package"],
    ["packages/llm-client/src/index.ts", "path.closed-package"],
    [".env", "path.env-file"],
    ["packages/core/.env.local", "path.env-file"],
    ["certs/server.pem", "path.key-file"],
  ])("flags %j", (path, rule) => {
    expect(scanPath(path).map((f) => f.rule)).toContain(rule);
  });

  it.each(["packages/core/src/index.ts", "packages/cli/dist/bin.js", "plugins/claude-code/skills/find-decisions/SKILL.md", ".github/workflows/ci.yml"])(
    "allows %j",
    (path) => {
      expect(scanPath(path)).toEqual([]);
    },
  );
});

describe("scanTree", () => {
  let root = "";
  afterEach(() => {
    if (root !== "") rmSync(root, { recursive: true, force: true });
  });
  const write = (rel: string, text: string): void => {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), text);
  };

  it("is clean on a clean tree and skips .git and node_modules", () => {
    root = mkdtempSync(join(tmpdir(), "kit-scan-"));
    write("README.md", "# Kit\n\nMail ana@example.com.\n");
    write("packages/core/src/index.ts", "export const x = 1;\n");
    write(".git/config", "url = git@github.com:someone/private.git # ADR-001\n");
    write("node_modules/x/index.js", "// see ADR-002\n");
    expect(scanTree(root)).toEqual([]);
  });

  it("finds paths and text anywhere else", () => {
    root = mkdtempSync(join(tmpdir(), "kit-scan-"));
    write("packages/db/index.ts", "export {};\n");
    write(".env.production", "X=1\n");
    write("packages/core/src/a.ts", "// the SGR tenant (ADR-012)\n");
    const findings = scanTree(root);
    expect(findings.map((f) => `${f.file} ${f.rule}`).sort()).toEqual([
      ".env.production path.env-file",
      "packages/core/src/a.ts ref.adr",
      "packages/core/src/a.ts word.sgr",
      "packages/db path.closed-package",
      "packages/db/index.ts path.closed-package",
    ]);
    expect(formatFindings(findings)).toContain("packages/core/src/a.ts:1  word.sgr  SGR");
  });
});
