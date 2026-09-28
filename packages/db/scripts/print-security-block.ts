// Prints a generated block from src/rls.ts: `rls:sql` or `rls:sql 0001` for the security block of
// migrations/0001_init.sql, `rls:sql 0004` for the policy block of migration 0004.
import { policyBlock, securityBlock } from "../src/rls.js";

const blocks: Record<string, () => string> = { "0001": securityBlock, "0004": policyBlock };
const which = process.argv[2] ?? "0001";
const block = blocks[which];
if (block === undefined) {
  process.stderr.write(`unknown block ${which}; use one of ${Object.keys(blocks).join(", ")}\n`);
  process.exit(1);
}
process.stdout.write(`${block()}\n`);
