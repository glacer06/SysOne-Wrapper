// Prints the generated security block for migrations/0001_init.sql (src/rls.ts).
import { securityBlock } from "../src/rls.js";

process.stdout.write(`${securityBlock()}\n`);
