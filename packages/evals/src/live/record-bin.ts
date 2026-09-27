// Entry point for `pnpm fixtures:record`. See cli.ts and record.ts.

import { recordMain } from "./cli.js";

process.exitCode = await recordMain(process.argv.slice(2), {
  out: (line) => process.stdout.write(`${line}\n`),
  err: (line) => process.stderr.write(`${line}\n`),
  env: process.env,
});
