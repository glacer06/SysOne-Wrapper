// Deliberate boundary violation: @bandwise/react must never import @bandwise/db.
// This folder is excluded from lint, typecheck, test and build.
// packages/config/test/boundaries.test.ts lints this file on purpose and expects an error.
import { packageName } from "@bandwise/db";

export const leakedServerPackage = packageName;
