import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getConsoleState } from "~/server/auth/console";

import { SignInForm } from "../forms";

export const metadata: Metadata = { title: "Sign in · Bandwise" };

export default async function SignInPage() {
  const state = await getConsoleState();
  if (state.kind === "ready") redirect("/sets");
  if (state.kind === "needs-two-factor") redirect("/setup-two-factor");
  return (
    <>
      <h1 className="bw-auth-title mb-2">Sign in</h1>
      <p className="mb-6 text-sm text-bw-text-muted">Use the email and password for your console account.</p>
      <SignInForm />
    </>
  );
}
