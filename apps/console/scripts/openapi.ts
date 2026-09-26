// Writes packages/core/openapi.json from the operation registry.
//   pnpm openapi          regenerate the file
//   pnpm openapi --check  exit 1 when the committed file is stale
// The generator lives in src/server/operations/openapi.ts; the console parity test runs the same
// check on every `pnpm test`. This script sits inside the console project, so it is typechecked and
// linted with it.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { renderOpenApi } from "../src/server/operations/openapi";

const target = fileURLToPath(new URL("../../../packages/core/openapi.json", import.meta.url));
const next = renderOpenApi();

if (process.argv.includes("--check")) {
  let current = "";
  try {
    current = readFileSync(target, "utf8");
  } catch {
    // A missing file is stale.
  }
  if (current !== next) {
    process.stderr.write("packages/core/openapi.json is stale. Run `pnpm openapi` and commit the result.\n");
    process.exit(1);
  }
  process.stdout.write("packages/core/openapi.json is up to date.\n");
} else {
  writeFileSync(target, next);
  process.stdout.write(`Wrote ${target}\n`);
}
