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
import boundariesPlugin from "eslint-plugin-boundaries";

// The plugin ships CommonJS with an ESM-style default in its types. At runtime the default
// import is the plugin object, so narrow the type to what ESLint expects.
const boundaries = /** @type {import("eslint").ESLint.Plugin} */ (
  /** @type {unknown} */ (boundariesPlugin)
);

/** Repo root, two levels above packages/config. */
export const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));

const resolverPath = fileURLToPath(import.meta.resolve("eslint-import-resolver-typescript"));
const resolveTsconfig = fileURLToPath(new URL("../tsconfig/resolve.json", import.meta.url));

/**
 * Element types. Order matters: the first matching pattern wins, so narrower
 * folders (core contracts, client server entrypoints, cli local mode, console
 * pages) come before the package that contains them.
 * @type {Array<{ type: string; pattern: string; mode?: "file" | "folder" }>}
 */
export const elements = [
  // The generated OpenAPI document: data, not code. The HTTP clients build against it.
  { type: "core-openapi", pattern: "packages/core/openapi.json", mode: "file" },
  { type: "core-contracts", pattern: "packages/core/src/contracts" },
  { type: "core", pattern: "packages/core" },
  // The fixture subpath never loads @typesafe-ai/sdk, so `sysone run --local` can use it.
  { type: "system-one-client-fixture", pattern: "packages/system-one-client/src/fixture" },
  { type: "system-one-client", pattern: "packages/system-one-client" },
  // The fixture subpath never loads @anthropic-ai/sdk (the exclusive-externals rule enforces it).
  { type: "llm-client-fixture", pattern: "packages/llm-client/src/fixture" },
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
  { type: "docs", pattern: "apps/docs" },
  { type: "extension-chrome", pattern: "apps/extension-chrome" },
];

/**
 * Which workspace elements each element may import. Imports inside the same
 * element are always allowed.
 * @type {Record<string, string[]>}
 */
export const allowedElementDeps = {
  "core-openapi": [],
  "core-contracts": ["core"],
  core: ["core-contracts"],
  "system-one-client-fixture": ["core", "core-contracts"],
  "system-one-client": ["core", "core-contracts", "system-one-client-fixture"],
  "llm-client-fixture": ["core", "core-contracts"],
  "llm-client": ["core", "core-contracts", "llm-client-fixture"],
  db: ["core", "core-contracts"],
  tenancy: ["core", "core-contracts"],
  billing: ["core", "core-contracts"],
  "client-server": ["client", "core", "core-contracts"],
  client: ["core", "core-contracts", "core-openapi"],
  react: ["client", "core", "core-contracts"],
  evals: ["core", "core-contracts", "system-one-client", "system-one-client-fixture"],
  // Local mode runs core on the fixture transport only. It never imports the SDK transport.
  "cli-local": ["cli", "client", "codegen", "core", "core-contracts", "core-openapi", "system-one-client-fixture"],
  cli: ["cli-local", "client", "codegen", "core-openapi"],
  codegen: ["core-contracts"],
  "mcp-server": ["client", "core-contracts", "core-openapi"],
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
    "system-one-client-fixture",
    "llm-client",
    "llm-client-fixture",
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
  "example-embed": ["client", "client-server", "react", "core-contracts", "core-openapi"],
  // The public docs site. Its tests check the documented spec against core's parser; the site
  // itself reads packages/core/openapi.json from disk at build time.
  docs: ["core", "core-contracts", "core-openapi"],
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

  // A workspace import that did not resolve to a file under packages/ or apps/ cannot be
  // classified, so it would skip the element rules above. Fail it instead.
  policies.push({
    disallow: { to: { module: { origin: "external", source: "@sysone/*" } } },
    message:
      "{{dependency.source}} did not resolve to a workspace file. Add it to the package exports and to packages/config/tsconfig/resolve.json.",
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
          // Check third-party and Node builtin imports too, not only workspace files.
          checkAllOrigins: true,
          message:
            "{{from.element.types}} may not import {{to.element.types}} (references/architecture.md, Packages and boundaries).",
          policies: buildPolicies(),
        },
      ],
    },
  },
];

// ---------------------------------------------------------------------------
// Purity (golden rule 3): core, core contracts and codegen have no clock, id source, randomness,
// timers, env or network of their own. Imports are covered above; these rules cover globals.

const PURITY_MESSAGE = "is not allowed in a pure package (core, codegen). Take it through RunPorts or an argument.";

/**
 * Globals that reach the outside world, read the clock or schedule work.
 * @type {Array<{ name: string; message: string }>}
 */
export const pureRestrictedGlobals = [
  "process",
  "Buffer",
  "setTimeout",
  "setInterval",
  "setImmediate",
  "clearTimeout",
  "clearInterval",
  "clearImmediate",
  "fetch",
  "crypto",
  "performance",
  "require",
  "__dirname",
  "__filename",
  "globalThis",
].map((name) => ({ name, message: `${name} ${PURITY_MESSAGE}` }));

/**
 * Clock and randomness reads through otherwise allowed globals.
 * @type {Array<{ object: string; property: string; message: string }>}
 */
export const pureRestrictedProperties = [
  { object: "Date", property: "now" },
  { object: "Math", property: "random" },
  { object: "crypto", property: "randomUUID" },
  { object: "crypto", property: "getRandomValues" },
  { object: "performance", property: "now" },
].map(({ object, property }) => ({ object, property, message: `${object}.${property}() ${PURITY_MESSAGE}` }));

/** `new Date()` and `Date()` with no argument read the clock. `new Date(epochMs)` is fine. */
export const pureRestrictedSyntax = [
  {
    selector: "NewExpression[callee.name='Date'][arguments.length=0]",
    message: `new Date() ${PURITY_MESSAGE}`,
  },
  {
    selector: "CallExpression[callee.name='Date']",
    message: `Date() ${PURITY_MESSAGE}`,
  },
];

/**
 * Add to the eslint.config.js of every pure package, after the shared config:
 * `export default [...sysone, ...purityConfig];`. Tests, test helpers and fixtures are exempt,
 * since they may read files and use Node. Flat config globs are relative to the package, so the
 * pure packages opt in; the boundary tests check that core and codegen do.
 * @type {import("eslint").Linter.Config[]}
 */
export const purityConfig = [
  {
    name: "sysone/purity",
    files: ["src/**/*.{js,mjs,cjs,ts,mts,cts,tsx,jsx}"],
    ignores: ["**/*.test.{ts,tsx,js}", "**/test/**", "**/__fixtures__/**"],
    rules: {
      "no-restricted-globals": ["error", ...pureRestrictedGlobals],
      "no-restricted-properties": ["error", ...pureRestrictedProperties],
      "no-restricted-syntax": ["error", ...pureRestrictedSyntax],
    },
  },
];
