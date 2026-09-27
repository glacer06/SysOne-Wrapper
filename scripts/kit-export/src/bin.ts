// pnpm kit:export [outDir] [--lockfile]   write the kit tree (default dist-kit/) and scan it
// pnpm kit:export --scan <dir>            only scan an existing kit tree, for example after a build
// Exits 1 when the scan finds anything private.

import { isAbsolute, join, resolve } from "node:path";
import { REPO_ROOT, exportKit, internalDocNames } from "./export.js";
import { type ScanFinding, formatFindings, scanTree } from "./scan.js";

const USAGE = "usage: pnpm kit:export [outDir] [--lockfile]\n       pnpm kit:export --scan <dir>\n";
const args = process.argv.slice(2);
const flags = args.filter((a) => a.startsWith("--"));
const positional = args.filter((a) => !a.startsWith("--"));
const cwd = process.env["INIT_CWD"] ?? process.cwd();
const abs = (p: string): string => (isAbsolute(p) ? p : resolve(cwd, p));

function finish(findings: readonly ScanFinding[]): void {
  if (findings.length > 0) {
    process.stderr.write(`\nscan failed with ${findings.length} findings:\n${formatFindings(findings)}\n`);
    process.exitCode = 1;
  } else process.stdout.write("scan: clean\n");
}

if (flags.some((f) => f !== "--lockfile" && f !== "--scan") || positional.length > 1 || (flags.includes("--scan") && positional.length !== 1)) {
  process.stderr.write(USAGE);
  process.exitCode = 1;
} else if (flags.includes("--scan")) {
  const dir = abs(positional[0] as string);
  process.stdout.write(`kit export: scanning ${dir}\n`);
  finish(scanTree(dir, { internalDocNames: internalDocNames(REPO_ROOT) }));
} else {
  const outDir = positional[0] === undefined ? join(REPO_ROOT, "dist-kit") : abs(positional[0]);
  const report = exportKit({ outDir, lockfile: flags.includes("--lockfile") });
  const lines = [
    `kit export: ${report.files.length} files written to ${report.outDir}`,
    `excluded ${report.excluded.length} private files:`,
    ...report.excluded.map((e) => `  ${e.file} (${e.why})`),
    `moved: ${Object.entries(report.moved).map(([a, b]) => `${a} -> ${b}`).join(", ") || "none"}`,
    `replacements: ${Object.entries(report.replacements).map(([k, v]) => `${JSON.stringify(k)} x${v}`).join(", ") || "none"}`,
    `patches: ${report.patches.map((p) => `${p.file} (${p.why})`).join("; ") || "none"}`,
    `dropped tests: ${report.droppedTests.map((d) => `${d.file}: ${JSON.stringify(d.title)}`).join("; ") || "none"}`,
    `comment and test-title rewrites in ${report.rewrittenFiles.length} files: ${Object.entries(report.rewrites).map(([k, v]) => `${k} ${v}`).join(", ") || "none"}`,
  ];
  process.stdout.write(`${lines.join("\n")}\n`);
  finish(report.findings);
}
