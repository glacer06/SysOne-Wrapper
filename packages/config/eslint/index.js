// @ts-check
/**
 * Shared ESLint flat config for every SysOne package.
 * Entry point: `import sysone from "@sysone/config/eslint"; export default sysone;`
 */
import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import { boundariesConfig, purityConfig } from "./boundaries.js";

/** @type {import("eslint").Linter.Config[]} */
export const ignores = [
  {
    name: "sysone/ignores",
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.next/**",
      "**/.turbo/**",
      "**/coverage/**",
      "**/next-env.d.ts",
      // Deliberately broken files used by lint tests. Linted only by those tests.
      "**/__fixtures__/**",
    ],
  },
];

/** @type {import("eslint").Linter.Config[]} */
const sysone = [
  ...ignores,
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    name: "sysone/base",
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: { ...globals.node },
    },
    linterOptions: {
      reportUnusedDisableDirectives: "error",
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/consistent-type-imports": ["error", { fixStyle: "inline-type-imports" }],
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "no-console": ["error", { allow: ["warn", "error"] }],
    },
  },
  ...boundariesConfig,
];

export default sysone;
export { boundariesConfig, purityConfig } from "./boundaries.js";

/** The shared config plus the purity rules, for core and codegen. */
export const pure = [...sysone, ...purityConfig];
