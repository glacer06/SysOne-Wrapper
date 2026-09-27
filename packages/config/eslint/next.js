// @ts-check
/**
 * ESLint flat config for Next.js apps: the shared config plus Next rules.
 * Entry point: `import bandwiseNext from "@bandwise/config/eslint/next"; export default bandwiseNext;`
 */
import nextPlugin from "@next/eslint-plugin-next";
import globals from "globals";
import bandwise from "./index.js";

/** @type {import("eslint").Linter.Config[]} */
const bandwiseNext = [
  ...bandwise,
  {
    name: "bandwise/next",
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

export default bandwiseNext;
