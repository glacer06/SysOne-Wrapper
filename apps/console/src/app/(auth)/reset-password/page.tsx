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
      <h1 className="bw-auth-title mb-2">Set your password</h1>
      {token === "" ? (
        <p className="text-sm text-bw-text-muted">
          This page needs the link you were sent. Ask a platform operator for a new one, or{" "}
          <Link href="/sign-in" className="underline underline-offset-2">
            sign in
          </Link>
          .
        </p>
      ) : (
        <>
          <p className="mb-6 text-sm text-bw-text-muted">The link works once and lasts a day.</p>
          <ResetPasswordForm token={token} />
        </>
      )}
    </>
  );
}
