import type { Metadata } from "next";
import Link from "next/link";

import { ResetPasswordForm } from "../forms";

export const metadata: Metadata = { title: "Set a password · Bandwise", referrer: "no-referrer" };

// The link from `pnpm console-member` lands here. The token stays in the form, never in a log line.
export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string | string[] }> }) {
  const raw = (await searchParams).token;
  const token = typeof raw === "string" ? raw : "";
  return (
    <>
      <h1 className="mb-1 text-xl font-semibold text-ink">Set your password</h1>
      {token === "" ? (
        <p className="text-sm text-ink-2">
          This page needs the link you were sent. Ask a platform operator for a new one, or{" "}
          <Link href="/sign-in" className="underline underline-offset-2">
            sign in
          </Link>
          .
        </p>
      ) : (
        <>
          <p className="mb-6 text-sm text-ink-2">The link works once and lasts a day.</p>
          <ResetPasswordForm token={token} />
        </>
      )}
    </>
  );
}
