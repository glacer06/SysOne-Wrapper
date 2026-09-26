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
  { name: "cli local -> system-one-client", file: "packages/cli/src/local/x.ts", code: `import "@sysone/system-one-client";`, violates: false },

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
