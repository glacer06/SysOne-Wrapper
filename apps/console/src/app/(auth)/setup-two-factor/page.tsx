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
      <h1 className="mb-1 text-xl font-semibold text-ink">Set up two-factor</h1>
      <p className="mb-6 text-sm text-ink-2">Signed in as {state.user.email}.</p>
      <SetupTwoFactor />
      <form action={signOutAction} className="mt-6">
        <button type="submit" className="text-xs text-ink-3 underline underline-offset-2 hover:text-ink">
          Sign out
        </button>
      </form>
    </>
  );
}
