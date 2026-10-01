// The sign-in path as a trail (AUTH-B): password, two-factor, backup codes. Pure, so the rail and
// tests share it. The route decides the step; the two-factor form can point at backup codes while
// someone uses one.

export type AuthStepId = "password" | "two-factor" | "backup";
export type AuthStepState = "passed" | "current" | "ahead";

export interface AuthStep {
  id: AuthStepId;
  label: string;
  hint: string;
  state: AuthStepState;
}

export interface AuthRail {
  /** The mono label over the trail. */
  title: string;
  steps: AuthStep[];
}

const ORDER: readonly AuthStepId[] = ["password", "two-factor", "backup"];

function states(current: AuthStepId | null, passed: readonly AuthStepId[]): Record<AuthStepId, AuthStepState> {
  const out = {} as Record<AuthStepId, AuthStepState>;
  for (const id of ORDER) out[id] = id === current ? "current" : passed.includes(id) ? "passed" : "ahead";
  return out;
}

/**
 * The rail for a path. `usingBackup` is true while the two-factor form takes a backup code, so
 * the backup step is the current one. Unknown paths get the sign-in rail.
 */
export function authRail(pathname: string, usingBackup = false): AuthRail {
  const build = (title: string, s: Record<AuthStepId, AuthStepState>, hints: Record<AuthStepId, string>): AuthRail => ({
    title,
    steps: [
      { id: "password", label: "Password", hint: hints.password, state: s.password },
      { id: "two-factor", label: "Two-factor", hint: hints["two-factor"], state: s["two-factor"] },
      { id: "backup", label: "Backup codes", hint: hints.backup, state: s.backup },
    ],
  });
  const signInHints = { password: "Email and password", "two-factor": "Code from your app", backup: "Only if you lost your phone" };
  const setupHints = { password: "Set from your link", "two-factor": "Scan, then enter a code", backup: "Saved once, during setup" };

  if (pathname.startsWith("/two-factor")) {
    return build("Sign in", usingBackup ? states("backup", ["password"]) : states("two-factor", ["password"]), signInHints);
  }
  if (pathname.startsWith("/setup-two-factor")) return build("First sign-in", states("two-factor", ["password"]), setupHints);
  if (pathname.startsWith("/reset-password")) return build("First sign-in", states("password", []), setupHints);
  if (pathname.startsWith("/no-access")) return build("Access", states(null, ["password", "two-factor"]), signInHints);
  return build("Sign in", states("password", []), signInHints);
}
