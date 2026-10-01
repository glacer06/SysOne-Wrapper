import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { buttonClasses } from "~/components/ui";
import { getConsoleState } from "~/server/auth/console";

import { signOutAction } from "../actions";

export const metadata: Metadata = { title: "No access · Bandwise" };

export default async function NoAccessPage() {
  const state = await getConsoleState();
  if (state.kind === "signed-out") redirect("/sign-in");
  if (state.kind === "ready") redirect("/sets");
  return (
    <>
      <h1 className="bw-auth-title mb-2">No console access</h1>
      <p className="mb-6 text-sm text-bw-text-muted">
        {state.user.email} is not a member of the internal team. Ask a console owner to add you, then sign in again.
      </p>
      <form action={signOutAction}>
        <button type="submit" className={buttonClasses("secondary")}>
          Sign out
        </button>
      </form>
    </>
  );
}
