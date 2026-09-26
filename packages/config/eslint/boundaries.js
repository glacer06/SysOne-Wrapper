// @ts-check
/**
 * Import boundaries from references/architecture.md "Packages and boundaries".
 * Changing a rule here changes the architecture, so it needs an ADR.
 *
 * Every workspace import is resolved to its real file under packages/ or apps/
 * (through tsconfig/resolve.json), so a bad import is caught even when the
 * importing package does not list the target in its package.json.
 */
import { fileURLToPath } from "node:url";
import boundaries from "eslint-plugin-boundaries";

/** Repo root, two levels above packages/config. */
export const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));

const resolverPath = fileURLToPath(import.meta.resolve("eslint-import-resolver-typescript"));
const resolveTsconfig = fileURLToPath(new URL("../tsconfig/resolve.json", import.meta.url));

/**
 * Element types. Order matters: the first matching pattern wins, so narrower
 * folders (core contracts, client server entrypoints, cli local mode, console
 * pages) come before the package that contains them.
 * @type {Array<{ type: string; pattern: string }>}
 */
export const elements = [
  { type: "core-contracts", pattern: "packages/core/src/contracts" },
  { type: "core", pattern: "packages/core" },
  { type: "system-one-client", pattern: "packages/system-one-client" },
  { type: "llm-client", pattern: "packages/llm-client" },
  { type: "db", pattern: "packages/db" },
  { type: "tenancy", pattern: "packages/tenancy" },
  { type: "billing", pattern: "packages/billing" },
  { type: "client-server", pattern: "packages/client/src/server" },
  { type: "client", pattern: "packages/client" },
  { type: "react", pattern: "packages/react" },
  { type: "evals", pattern: "packages/evals" },
  { type: "cli-local", pattern: "packages/cli/src/local" },
  { type: "cli", pattern: "packages/cli" },
  { type: "codegen", pattern: "packages/codegen" },
  { type: "mcp-server", pattern: "packages/mcp-server" },
  { type: "plugin-sdk", pattern: "packages/plugin-sdk" },
  { type: "plugins-builtin", pattern: "packages/plugins-builtin" },
  { type: "config", pattern: "packages/config" },
  { type: "console-ui", pattern: "apps/console/src/app/\\(org\\)" },
  { type: "console-ui", pattern: "apps/console/src/app/\\(platform\\)" },
  { type: "console", pattern: "apps/console" },
  { type: "example-embed", pattern: "apps/example-embed" },
  { type: "extension-chrome", pattern: "apps/extension-chrome" },
];

/**
 * Which workspace elements each element may import. Imports inside the same
 * element are always allowed.
 * @type {Record<string, string[]>}
 */
export const allowedElementDeps = {
  "core-contracts": ["core"],
  core: ["core-contracts"],
  "system-one-client": ["core", "core-contracts"],
  "llm-client": ["core", "core-contracts"],
  db: ["core", "core-contracts"],
  tenancy: ["core", "core-contracts"],
  billing: ["core", "core-contracts"],
  "client-server": ["client", "core", "core-contracts"],
  client: ["core", "core-contracts"],
  react: ["client", "core", "core-contracts"],
  evals: ["core", "core-contracts", "system-one-client"],
  "cli-local": ["cli", "client", "codegen", "core", "core-contracts", "system-one-client"],
  cli: ["cli-local", "client", "codegen"],
  codegen: ["core-contracts"],
  "mcp-server": ["client", "core-contracts"],
  "plugin-sdk": ["core", "core-contracts"],
  "plugins-builtin": ["plugin-sdk", "core", "core-contracts"],
  config: [],
  "console-ui": [
    "console",
    "core",
    "core-contracts",
    "client",
    "client-server",
    "react",
    "plugin-sdk",
  ],
  console: [
    "console-ui",
    "core",
    "core-contracts",
    "system-one-client",
    "llm-client",
    "db",
    "tenancy",
    "billing",
    "client",
    "client-server",
    "react",
    "evals",
    "plugin-sdk",
    "plugins-builtin",
  ],
  "example-embed": ["client", "client-server", "react", "core-contracts"],
  "extension-chrome": ["client", "react", "core-contracts"],
};

const pureElements = ["core", "core-contracts", "codegen"];

/**
 * External packages only one element may import.
 * @type {Array<{ source: string[]; owner: string }>}
 */
export const exclusiveExternals = [
  { source: ["@typesafe-ai/sdk"], owner: "system-one-client" },
  { source: ["@anthropic-ai/sdk"], owner: "llm-client" },
  { source: ["drizzle-orm", "drizzle-kit"], owner: "db" },
];

/** @returns {Array<Record<string, unknown>>} */
function buildPolicies() {
  /** @type {Array<Record<string, unknown>>} */
  const policies = [];

  // Third-party packages and Node builtins are allowed unless a later policy says otherwise.
  policies.push({ allow: { to: { module: { origin: "external" } } } });
  policies.push({ allow: { to: { module: { origin: "core" } } } });

  // Workspace element graph.
  for (const [from, deps] of Object.entries(allowedElementDeps)) {
    policies.push({
      from: { element: { type: from } },
      allow: { to: { element: { type: [from, ...deps] } } },
    });
  }

  // Config and test tooling files (vitest.config.ts, eslint.config.js) may import the config package.
  policies.push({
    from: { file: { categories: "tooling" } },
    allow: { to: { element: { type: "config" } } },
  });

  // Exclusive third-party SDKs.
  for (const { source, owner } of exclusiveExternals) {
    policies.push({
      from: { element: { type: `!${owner}` } },
      disallow: { to: { module: { source } } },
      message: `Only ${owner} may import {{to.module.source}} (references/architecture.md).`,
    });
  }

  // Only tenancy touches crypto and KMS.
  policies.push({
    from: { element: { type: "!tenancy" } },
    disallow: { to: { module: { origin: "core", source: ["crypto", "node:crypto"] } } },
    message: "Only tenancy may import {{to.module.source}} (references/architecture.md).",
  });

  // core, core contracts and codegen are pure: zod only, no Node builtins, no other packages.
  policies.push({
    from: { element: { type: pureElements } },
    disallow: [
      { to: { module: { origin: "external" } } },
      { to: { module: { origin: "core" } } },
    ],
    message: "{{from.element.types}} is pure and may import only zod, not {{to.module.source}}.",
  });
  policies.push({
    from: { element: { type: pureElements } },
    allow: { to: { module: { origin: "external", source: "zod" } } },
  });

  // Tests and tool config in pure packages may use the test runner and Node builtins.
  policies.push({
    from: { element: { type: pureElements }, file: { categories: ["test", "tooling"] } },
    allow: [
      { to: { module: { origin: "external", source: ["vitest", "vite"] } } },
      { to: { module: { origin: "core" } } },
    ],
  });

  return policies;
}

/** @type {import("eslint").Linter.Config[]} */
export const boundariesConfig = [
  {
    name: "sysone/boundaries",
    files: ["**/*.{js,mjs,cjs,ts,mts,cts,tsx,jsx}"],
    plugins: { boundaries },
    settings: {
      "boundaries/root-path": repoRoot,
      "boundaries/elements": elements,
      "boundaries/files": [
        { category: "test", pattern: "**/*.test.{ts,tsx,js}" },
        { category: "test", pattern: "**/test/**" },
        { category: "tooling", pattern: "**/*.config.{ts,js,mjs,cjs,mts}" },
      ],
      "boundaries/legacy-warnings": false,
      "import/resolver": {
        [resolverPath]: {
          project: resolveTsconfig,
          alwaysTryTypes: true,
          conditionNames: ["@sysone/source", "types", "import", "node", "require", "default"],
        },
      },
    },
    rules: {
      "boundaries/dependencies": [
        "error",
        {
          default: "disallow",
          message:
            "{{from.element.types}} may not import {{to.element.types}} (references/architecture.md, Packages and boundaries).",
          policies: buildPolicies(),
        },
      ],
    },
  },
];
