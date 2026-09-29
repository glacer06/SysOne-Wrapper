// The guard of the kit export: nothing private may reach the public bandwise-kit tree. The export
// runs this over its output and fails when it finds anything. It checks file paths and file text.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

export interface ScanFinding {
  /** Path relative to the scanned root, with forward slashes. */
  file: string;
  /** 1-based line, or 0 for a finding about the path itself. */
  line: number;
  rule: string;
  /** The matched text, shortened. */
  match: string;
}

export interface ScanOptions {
  /** Extra internal doc names (for example `architecture.md`) that must not be named in the kit. */
  internalDocNames?: readonly string[];
}

/**
 * Internal design docs of the private monorepo. The export adds the names it finds on disk; this
 * list keeps the scanner useful on its own.
 */
export const DEFAULT_INTERNAL_DOC_NAMES: readonly string[] = [
  "api.md",
  "architecture.md",
  "confidence-policy.md",
  "conventions.md",
  "data-model.md",
  "definition-studio.md",
  "deploy-and-codegen.md",
  "effectiveness-loop.md",
  "events.md",
  "headless-and-agents.md",
  "management-api.md",
  "savings-model.md",
  "security.md",
  "spec-schema.md",
  "system-one-api-contract.md",
  "system-one-models.md",
  "team-playbook.md",
  "testing.md",
  "PLAN.md",
];

/** Folders that belong to the closed product. Their presence anywhere in the tree fails the scan. */
const FORBIDDEN_PATH_PATTERNS: ReadonlyArray<{ rule: string; re: RegExp }> = [
  { rule: "path.claude", re: /(^|\/)\.claude(\/|$)/ },
  { rule: "path.apps", re: /^apps(\/|$)/ },
  { rule: "path.adr", re: /(^|\/)docs\/adr(\/|$)/ },
  {
    rule: "path.closed-package",
    re: /^packages\/(console|db|tenancy|billing|llm-client|client|client-py|react|evals|codegen|mcp-server|plugin-sdk|plugins-builtin|extension-chrome)(\/|$)/,
  },
  { rule: "path.env-file", re: /(^|\/)\.env(\.[^/]*)?$/ },
  { rule: "path.key-file", re: /\.(pem|key|p12|pfx)$/ },
  { rule: "path.internal-skill", re: /(^|\/)(bandwise-builder|bandwise-operator|bandwise-integrate)(\/|$)/ },
];

/** Email domains reserved for examples (RFC 2606 and RFC 6761). Addresses at these are allowed. */
function isReservedExampleDomain(domain: string): boolean {
  const d = domain.toLowerCase();
  return (
    /(^|\.)example\.(com|org|net)$/.test(d) ||
    /(^|\.)(example|test|invalid|localhost)$/.test(d)
  );
}

interface TextRule {
  rule: string;
  re: RegExp;
  /** Return false to ignore a match. */
  keep?: (match: RegExpExecArray) => boolean;
}

function textRules(internalDocNames: readonly string[]): TextRule[] {
  const escaped = [...new Set(internalDocNames)].map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return [
    { rule: "word.sgr", re: /\bSGR\b/g },
    { rule: "word.dallas", re: /\bDallas\b/gi },
    { rule: "word.embers", re: /\bEmbers\b/gi },
    { rule: "word.nsims", re: /nsims/gi },
    // The owner's personal names stay out of the public kit, including sample data.
    { rule: "word.owner-name", re: /\bNick\b|\bSims\b/g },
    { rule: "word.assistant-names", re: /\bInstinct\b|\bPJ\b|\bDeeJay\b/g },
    { rule: "ref.linear-id", re: /\bNSI-\d+\b/g },
    { rule: "ref.linear-link", re: /linear\.app/gi },
    { rule: "ref.adr", re: /\bADR-?\d+\b/g },
    // Installing a skill into a project's .claude/skills/ is fine, and so is Claude Code's own
    // .claude/settings.json, where hooks go. Any other .claude path is not.
    { rule: "ref.claude-dir", re: /\.claude\/(?!skills\/?(?:find-decisions\/?)?(?![\w/.-]))(?!settings\.json(?![\w/-]))/g },
    { rule: "ref.docs-adr", re: /docs\/adr\b/g },
    { rule: "ref.phase-doc", re: /\bphase-\d+b?\.md\b/g },
    { rule: "ref.internal-skill", re: /\bbandwise-builder\b/g },
    // An internal doc named on its own or under references/. A public URL such as
    // https://docs.typesafe.ai/api.md is fine, so a name right after a slash or a dot is ignored,
    // unless the slash is the one in references/.
    ...(escaped.length === 0
      ? []
      : [
          {
            rule: "ref.internal-doc",
            re: new RegExp(`(?:references\\/|(?<![\\w./-]))(?:${escaped.join("|")})(?![\\w-])`, "g"),
          },
        ]),
    {
      rule: "secret.email",
      re: /[A-Za-z0-9._%+-]+@([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,})\b/g,
      keep: (m) => !isReservedExampleDomain(m[1] ?? ""),
    },
    // Key-shaped strings. Bare prefixes such as `sk_live_` are fine; a prefix followed by a body is not.
    { rule: "secret.bandwise-token", re: /\b(?:sk|pk|sa|rk)_(?:live|test)_[A-Za-z0-9]{8,}/g },
    { rule: "secret.sk-underscore", re: /\bsk_[A-Za-z0-9]{16,}/g },
    { rule: "secret.sk-dash", re: /\bsk-(?:ant-|or-|proj-)?[A-Za-z0-9_-]{20,}/g },
    { rule: "secret.stripe-webhook", re: /\bwhsec_[A-Za-z0-9]{8,}/g },
    { rule: "secret.github", re: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}|\bgithub_pat_[A-Za-z0-9_]{20,}/g },
    { rule: "secret.npm", re: /\bnpm_[A-Za-z0-9]{30,}/g },
    { rule: "secret.aws", re: /\bAKIA[0-9A-Z]{16}\b/g },
    { rule: "secret.slack", re: /\bxox[abprs]-[A-Za-z0-9-]{10,}/g },
    { rule: "secret.private-key", re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g },
    { rule: "secret.jwt", re: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g },
    {
      rule: "secret.assignment",
      re: /\b(?:TYPESAFE_API_KEY|OPENROUTER_API_KEY|AI_GATEWAY_API_KEY|ANTHROPIC_API_KEY|STRIPE_SECRET_KEY|STRIPE_WEBHOOK_SECRET|BANDWISE_KEK|BANDWISE_JWT_SIGNING_KEY|BANDWISE_TOKEN|AUTH_SECRET|NPM_TOKEN|NODE_AUTH_TOKEN)\s*[=:]\s*["']?[A-Za-z0-9_\-+/]{12,}/g,
    },
    { rule: "secret.connection-string", re: /\b(?:postgres(?:ql)?|redis|rediss|mysql|mongodb(?:\+srv)?):\/\/[^\s"'`]*:[^\s"'`@]+@/g },
    // Hosts that only make sense inside the company or on a preview deploy.
    {
      rule: "host.internal",
      re: /https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(?:1[6-9]|2\d|3[01])\.\d+\.\d+|[A-Za-z0-9.-]+\.(?:internal|local|corp|lan|vercel\.app|supabase\.co|fly\.dev|railway\.app|ngrok\.io|ngrok-free\.app))\b/g,
    },
    { rule: "host.bandwise-internal", re: /\b(?:staging|preview|dev|admin|internal)\.bandwise\.(?:dev|ai)\b/g },
  ];
}

const BINARY_EXTENSIONS = /\.(png|jpe?g|gif|webp|ico|woff2?|ttf|otf|zip|gz|tgz|pdf)$/i;

function walk(root: string, dir: string, out: string[]): void {
  for (const entry of readdirSync(dir).sort()) {
    if (entry === ".git" || entry === "node_modules") continue;
    const full = join(dir, entry);
    const rel = relative(root, full).split(sep).join("/");
    if (statSync(full).isDirectory()) {
      out.push(`${rel}/`);
      walk(root, full, out);
    } else out.push(rel);
  }
}

const short = (s: string): string => (s.length > 80 ? `${s.slice(0, 77)}...` : s);

/** Scan one file's path. */
export function scanPath(path: string): ScanFinding[] {
  const file = path.replace(/\/$/, "");
  return FORBIDDEN_PATH_PATTERNS.filter((p) => p.re.test(file)).map((p) => ({ file, line: 0, rule: p.rule, match: file }));
}

/** Scan one file's text. */
export function scanText(file: string, text: string, options: ScanOptions = {}): ScanFinding[] {
  const rules = textRules([...DEFAULT_INTERNAL_DOC_NAMES, ...(options.internalDocNames ?? [])]);
  const findings: ScanFinding[] = [];
  const lines = text.split("\n");
  for (const [i, line] of lines.entries()) {
    for (const r of rules) {
      r.re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = r.re.exec(line)) !== null) {
        if (r.keep === undefined || r.keep(m)) findings.push({ file, line: i + 1, rule: r.rule, match: short(m[0]) });
        if (m[0].length === 0) r.re.lastIndex++;
      }
    }
  }
  return findings;
}

/** Scan every file under `root` (skipping .git and node_modules). An empty result means clean. */
export function scanTree(root: string, options: ScanOptions = {}): ScanFinding[] {
  const entries: string[] = [];
  walk(root, root, entries);
  const findings: ScanFinding[] = [];
  for (const rel of entries) {
    findings.push(...scanPath(rel));
    if (rel.endsWith("/") || BINARY_EXTENSIONS.test(rel)) continue;
    findings.push(...scanText(rel, readFileSync(join(root, rel), "utf8"), options));
  }
  return findings;
}

/** One line per finding, for the export's error output. */
export function formatFindings(findings: readonly ScanFinding[]): string {
  return findings.map((f) => `${f.file}${f.line > 0 ? `:${f.line}` : ""}  ${f.rule}  ${f.match}`).join("\n");
}
