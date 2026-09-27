// Entry point for `pnpm smoke`. See cli.ts and smoke.ts.

import { smokeMain } from "./cli.js";

process.exitCode = await smokeMain(process.argv.slice(2), {
  out: (line) => process.stdout.write(`${line}\n`),
  err: (line) => process.stderr.write(`${line}\n`),
  env: process.env,
});
