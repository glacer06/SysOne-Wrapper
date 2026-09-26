// @ts-check
/**
 * ESLint flat config for Next.js apps: the shared config plus Next rules.
 * Entry point: `import sysoneNext from "@sysone/config/eslint/next"; export default sysoneNext;`
 */
import nextPlugin from "@next/eslint-plugin-next";
import globals from "globals";
import sysone from "./index.js";

/** @type {import("eslint").Linter.Config[]} */
const sysoneNext = [
  ...sysone,
  {
    name: "sysone/next",
    files: ["**/*.{js,mjs,ts,tsx,jsx}"],
    plugins: { "@next/next": nextPlugin },
    languageOptions: {
      globals: { ...globals.browser },
    },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs["core-web-vitals"].rules,
    },
  },
];

export default sysoneNext;
