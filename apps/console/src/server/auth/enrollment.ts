// Admin-issued two-factor enrollment (D3, PJ's review of PR #21). console-member issues a one-time
// code with the reset link. The setup page needs it with the password, so someone who has only the
// password cannot enroll their own authenticator first. Only the code's hash is stored, it lasts as
// long as the reset link, and it is used up when two-factor turns on.

import { authRepositories, type BandwiseDb } from "@bandwise/db";
import { generateEnrollmentCode, hashEnrollmentCode } from "@bandwise/tenancy";

import { RESET_LINK_SECONDS } from "./config";

export interface EnrollmentStore {
  matches(userId: string, code: string): Promise<boolean>;
  consume(userId: string): Promise<void>;
}

export function dbEnrollmentStore(db: BandwiseDb, clock: () => number = Date.now): EnrollmentStore {
  return {
    matches: (userId, code) =>
      db.withNoTenant((tx) => authRepositories.consoleEnrollments.matches(tx, userId, hashEnrollmentCode(code), new Date(clock()))),
    consume: async (userId) => {
      await db.withNoTenant((tx) => authRepositories.consoleEnrollments.consume(tx, userId));
    },
  };
}

/** Issues (or replaces) a user's enrollment code. Returns the code; only its hash is stored. */
export async function issueEnrollmentCode(db: BandwiseDb, userId: string, now: Date = new Date()): Promise<string> {
  const code = generateEnrollmentCode();
  const expiresAt = new Date(now.getTime() + RESET_LINK_SECONDS * 1000);
  await db.withNoTenant((tx) => authRepositories.consoleEnrollments.issue(tx, userId, hashEnrollmentCode(code), expiresAt));
  return code;
}
