import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getConsoleState } from "~/server/auth/console";

import { signOutAction } from "../actions";
import { SetupTwoFactor } from "../forms";

export const metadata: Metadata = { title: "Set up two-factor · Bandwise" };

export default async function SetupTwoFactorPage() {
  const state = await getConsoleState();
  if (state.kind === "signed-out") redirect("/sign-in");
  if (state.kind !== "needs-two-factor") redirect("/sets");
  return (
    <>
      <h1 className="bw-auth-title mb-2">Set up two-factor</h1>
      <p className="mb-6 text-sm text-bw-text-muted">Signed in as {state.user.email}.</p>
      <SetupTwoFactor />
      <form action={signOutAction} className="mt-6">
        <button type="submit" className="text-xs text-bw-text-muted underline underline-offset-2 hover:text-bw-text">
          Sign out
        </button>
      </form>
    </>
  );
}
