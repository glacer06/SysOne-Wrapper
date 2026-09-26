// Deliberate boundary violation: @sysone/react must never import @sysone/db.
// This folder is excluded from lint, typecheck, test and build.
// packages/config/test/boundaries.test.ts lints this file on purpose and expects an error.
import { packageName } from "@sysone/db";

export const leakedServerPackage = packageName;
