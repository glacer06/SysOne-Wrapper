import { fileURLToPath } from "node:url";
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const at = (relative: string): string => `${repoRoot}${relative}`;

function makeEslint(cwd: string): ESLint {
  return new ESLint({
    cwd,
    // Lint files that the normal run ignores, such as __fixtures__.
    ignore: false,
  });
}

function boundaryErrors(results: ESLint.LintResult[]): string[] {
  return results.flatMap((result) =>
    result.messages
      .filter((message) => message.ruleId === "boundaries/dependencies" && message.severity === 2)
      .map((message) => message.message),
  );
}

describe("boundary lint fixture", () => {
  it("reports the deliberate bad import in packages/react", async () => {
    const eslint = makeEslint(at("packages/react"));
    const results = await eslint.lintFiles([at("packages/react/src/__fixtures__/bad-import.ts")]);
    const errors = boundaryErrors(results);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("react may not import db");
  });

  it("reports the deliberate SDK transport import in packages/cli/src/local", async () => {
    const eslint = makeEslint(at("packages/cli"));
    const results = await eslint.lintFiles([at("packages/cli/src/local/__fixtures__/bad-sdk-import.ts")]);
    const errors = boundaryErrors(results);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("cli-local may not import system-one-client");
  });

  it("skips __fixtures__ in the normal lint run", async () => {
    const eslint = new ESLint({ cwd: at("packages/react") });
    expect(await eslint.isPathIgnored(at("packages/react/src/__fixtures__/bad-import.ts"))).toBe(true);
  });
});

type Case = { name: string; file: string; code: string; violates: boolean };

const cases: Case[] = [
  // react never imports server packages.
  { name: "react -> db", file: "packages/react/src/x.ts", code: `import "@sysone/db";`, violates: true },
  { name: "react -> tenancy", file: "packages/react/src/x.ts", code: `import "@sysone/tenancy";`, violates: true },
  { name: "react -> system-one-client", file: "packages/react/src/x.ts", code: `import "@sysone/system-one-client";`, violates: true },
  { name: "react -> llm-client", file: "packages/react/src/x.ts", code: `import "@sysone/llm-client";`, violates: true },
  { name: "react -> client server entrypoint", file: "packages/react/src/x.ts", code: `import "@sysone/client/server";`, violates: true },
  { name: "react -> client", file: "packages/react/src/x.ts", code: `import "@sysone/client";`, violates: false },
  { name: "react -> core contracts", file: "packages/react/src/x.ts", code: `import "@sysone/core/contracts";`, violates: false },

  // Workspace imports must resolve, or they would skip the element rules.
  { name: "unresolved workspace subpath", file: "packages/client/src/x.ts", code: `import "@sysone/core/not-a-subpath";`, violates: true },

  // Exclusive third-party SDKs.
  { name: "system-one-client -> @typesafe-ai/sdk", file: "packages/system-one-client/src/x.ts", code: `import "@typesafe-ai/sdk";`, violates: false },
  { name: "console -> @typesafe-ai/sdk", file: "apps/console/src/server/x.ts", code: `import "@typesafe-ai/sdk";`, violates: true },
  { name: "llm-client -> @anthropic-ai/sdk", file: "packages/llm-client/src/x.ts", code: `import "@anthropic-ai/sdk";`, violates: false },
  { name: "tenancy -> @anthropic-ai/sdk", file: "packages/tenancy/src/x.ts", code: `import "@anthropic-ai/sdk";`, violates: true },
  { name: "db -> drizzle-orm", file: "packages/db/src/x.ts", code: `import "drizzle-orm";`, violates: false },
  { name: "db -> drizzle-orm/pg-core", file: "packages/db/src/x.ts", code: `import "drizzle-orm/pg-core";`, violates: false },
  { name: "tenancy -> drizzle-orm/pg-core", file: "packages/tenancy/src/x.ts", code: `import "drizzle-orm/pg-core";`, violates: true },

  // Only tenancy touches crypto.
  { name: "tenancy -> node:crypto", file: "packages/tenancy/src/x.ts", code: `import "node:crypto";`, violates: false },
  { name: "billing -> node:crypto", file: "packages/billing/src/x.ts", code: `import "node:crypto";`, violates: true },

  // core is pure.
  { name: "core -> zod", file: "packages/core/src/x.ts", code: `import "zod";`, violates: false },
  { name: "core contracts -> zod", file: "packages/core/src/contracts/x.ts", code: `import "zod";`, violates: false },
  { name: "core -> node:fs", file: "packages/core/src/x.ts", code: `import "node:fs";`, violates: true },
  { name: "core -> third-party package", file: "packages/core/src/x.ts", code: `import "undici";`, violates: true },
  { name: "core -> db", file: "packages/core/src/x.ts", code: `import "@sysone/db";`, violates: true },
  { name: "core test -> vitest", file: "packages/core/src/x.test.ts", code: `import "vitest";`, violates: false },

  // codegen imports only core contracts.
  { name: "codegen -> core contracts", file: "packages/codegen/src/x.ts", code: `import "@sysone/core/contracts";`, violates: false },
  { name: "codegen -> core root", file: "packages/codegen/src/x.ts", code: `import "@sysone/core";`, violates: true },

  // cli reaches core and system-one-client only from src/local.
  { name: "cli -> client", file: "packages/cli/src/x.ts", code: `import "@sysone/client";`, violates: false },
  { name: "cli -> core", file: "packages/cli/src/x.ts", code: `import "@sysone/core";`, violates: true },
  { name: "cli local -> core", file: "packages/cli/src/local/x.ts", code: `import "@sysone/core";`, violates: false },
  // Local mode takes only the fixture subpath: the SDK transport is off limits (phase-1.md exit gate).
  { name: "cli local -> system-one-client SDK transport", file: "packages/cli/src/local/x.ts", code: `import "@sysone/system-one-client";`, violates: true },
  { name: "cli local -> system-one-client fixture", file: "packages/cli/src/local/x.ts", code: `import "@sysone/system-one-client/fixture";`, violates: false },
  { name: "cli local -> @typesafe-ai/sdk", file: "packages/cli/src/local/x.ts", code: `import "@typesafe-ai/sdk";`, violates: true },
  { name: "cli -> system-one-client fixture", file: "packages/cli/src/x.ts", code: `import "@sysone/system-one-client/fixture";`, violates: true },
  { name: "system-one-client fixture -> @typesafe-ai/sdk", file: "packages/system-one-client/src/fixture/x.ts", code: `import "@typesafe-ai/sdk";`, violates: true },
  { name: "system-one-client fixture -> SDK transport", file: "packages/system-one-client/src/fixture/x.ts", code: `import "../sdk-transport.js";`, violates: true },
  { name: "system-one-client -> its fixture folder", file: "packages/system-one-client/src/x.ts", code: `import "./fixture/index.js";`, violates: false },

  // The HTTP clients build against the generated OpenAPI document by package name.
  { name: "cli -> core openapi.json", file: "packages/cli/src/x.ts", code: `import "@sysone/core/openapi.json";`, violates: false },
  { name: "mcp-server -> core openapi.json", file: "packages/mcp-server/src/x.ts", code: `import "@sysone/core/openapi.json";`, violates: false },
  { name: "example-embed -> core openapi.json", file: "apps/example-embed/src/x.ts", code: `import "@sysone/core/openapi.json";`, violates: false },
  { name: "mcp-server -> core root", file: "packages/mcp-server/src/x.ts", code: `import "@sysone/core";`, violates: true },

  // mcp-server calls /api/v1 over HTTP only.
  { name: "mcp-server -> db", file: "packages/mcp-server/src/x.ts", code: `import "@sysone/db";`, violates: true },

  // Server packages depend on core, and only console wires them together.
  { name: "system-one-client -> core", file: "packages/system-one-client/src/x.ts", code: `import "@sysone/core";`, violates: false },
  { name: "billing -> db", file: "packages/billing/src/x.ts", code: `import "@sysone/db";`, violates: true },
  { name: "console server -> db", file: "apps/console/src/server/x.ts", code: `import "@sysone/db";`, violates: false },
  { name: "console org page -> db", file: "apps/console/src/app/(org)/[orgSlug]/page.ts", code: `import "@sysone/db";`, violates: true },
  { name: "console platform page -> db", file: "apps/console/src/app/(platform)/platform/page.ts", code: `import "@sysone/db";`, violates: true },
];

describe("boundary rules from references/architecture.md", () => {
  const eslint = makeEslint(repoRoot);

  it.each(cases)("$name", async ({ file, code, violates }) => {
    const results = await eslint.lintText(code, { filePath: at(file) });
    const errors = boundaryErrors(results);
    if (violates) {
      expect(errors, `expected a boundary error for ${file}`).not.toHaveLength(0);
    } else {
      expect(errors, `expected no boundary error for ${file}`).toEqual([]);
    }
  });
});

// Golden rule 3: core, core contracts and codegen have no clock, randomness, timers, env or network.
function purityErrors(results: ESLint.LintResult[]): string[] {
  const rules = new Set(["no-restricted-globals", "no-restricted-properties", "no-restricted-syntax"]);
  return results.flatMap((result) =>
    result.messages.filter((m) => m.ruleId !== null && rules.has(m.ruleId) && m.severity === 2).map((m) => m.message),
  );
}

const impure: Array<{ name: string; code: string }> = [
  { name: "process.env", code: `export const k = process.env["TYPESAFE_API_KEY"];` },
  { name: "Date.now()", code: `export const t = Date.now();` },
  { name: "new Date()", code: `export const d = new Date();` },
  { name: "Date()", code: `export const d = Date();` },
  { name: "Math.random()", code: `export const r = Math.random();` },
  { name: "crypto.randomUUID()", code: `export const id = crypto.randomUUID();` },
  { name: "setTimeout", code: `setTimeout(() => undefined, 1);` },
  { name: "setInterval", code: `setInterval(() => undefined, 1);` },
  { name: "Buffer", code: `export const b = Buffer.from("x");` },
  { name: "fetch", code: `export const p = fetch("https://example.com");` },
  { name: "globalThis", code: `export const g = globalThis;` },
];

describe("purity rules for core, core contracts and codegen", () => {
  const eslint = makeEslint(repoRoot);
  const pureFiles = ["packages/core/src/x.ts", "packages/core/src/contracts/x.ts", "packages/codegen/src/x.ts"];

  for (const file of pureFiles) {
    it.each(impure)(`${file}: $name is an error`, async ({ code }) => {
      const results = await eslint.lintText(code, { filePath: at(file) });
      expect(purityErrors(results)).not.toHaveLength(0);
    });
  }

  it("allows a clock value passed in, and new Date(epochMs)", async () => {
    const code = `export function iso(now: () => number): string { return new Date(now()).toISOString(); }`;
    const results = await eslint.lintText(code, { filePath: at("packages/core/src/x.ts") });
    expect(purityErrors(results)).toEqual([]);
  });

  it("exempts tests in pure packages", async () => {
    const results = await eslint.lintText(`export const t = Date.now();`, { filePath: at("packages/core/src/x.test.ts") });
    expect(purityErrors(results)).toEqual([]);
  });

  it("does not apply to server packages", async () => {
    const results = await eslint.lintText(`export const t = Date.now(); export const k = process.env["X"];`, {
      filePath: at("packages/system-one-client/src/x.ts"),
    });
    expect(purityErrors(results)).toEqual([]);
  });
});
