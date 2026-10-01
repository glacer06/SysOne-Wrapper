// app.bandwise.dev. Signed-in members go to their sets. Everyone else sees the early-access page
// (ADR-018, decision 5), which sends visitors to the form on www.
import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

import { Wordmark } from "~/components/shell/wordmark";
import { getConsoleState } from "~/server/auth/console";

const EARLY_ACCESS_URL = "https://www.bandwise.dev/#early-access";

/** Only a request that carries a session cookie touches the auth library and the database. */
async function signedInTarget(): Promise<string | null> {
  const names = (await cookies()).getAll().map((c) => c.name);
  if (!names.some((n) => n.endsWith("bandwise.session_token"))) return null;
  try {
    const state = await getConsoleState();
    return state.kind === "ready" ? "/sets" : state.kind === "needs-two-factor" ? "/setup-two-factor" : null;
  } catch {
    // Sign-in not configured on this deployment, or the database is down: show the public page.
    return null;
  }
}

export default async function HomePage() {
  const target = await signedInTarget();
  if (target !== null) redirect(target);
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center px-4 py-16">
      <Wordmark />
      <h1 className="mt-8 text-3xl font-semibold tracking-tight text-ink">The Bandwise console is in early access</h1>
      <p className="mt-4 text-base leading-7 text-ink-2">
        Sign-in opens to early-access teams first. Ask for a spot and we will write to you when yours is ready.
      </p>
      <p className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3">
        <a href={EARLY_ACCESS_URL} className="font-semibold text-ink underline underline-offset-4">
          Request early access on www.bandwise.dev
        </a>
        <Link href="/sign-in" className="text-sm text-ink-3 underline underline-offset-4 hover:text-ink">
          Team sign-in
        </Link>
      </p>
    </main>
  );
}
