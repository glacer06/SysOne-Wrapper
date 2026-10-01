import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getConsoleState } from "~/server/auth/console";

import { TwoFactorForm } from "../forms";

export const metadata: Metadata = { title: "Two-factor · Bandwise" };

export default async function TwoFactorPage() {
  if ((await getConsoleState()).kind === "ready") redirect("/sets");
  return (
    <>
      <h1 className="bw-auth-title mb-2">Two-factor check</h1>
      <p className="mb-6 text-sm text-bw-text-muted">Enter the code from your authenticator app. It changes every 30 seconds.</p>
      <TwoFactorForm />
      <p className="mt-6 text-xs text-bw-text-muted">
        The check expires after 10 minutes.{" "}
        <Link href="/sign-in" className="underline underline-offset-2 hover:text-bw-text">
          Start again
        </Link>
      </p>
    </>
  );
}
