import type { ReactNode } from "react";

import { Wordmark } from "~/components/shell/wordmark";

// Sign-in, two-factor and password pages: one calm column, nothing else on screen.
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col items-center bg-paper px-4 py-12 sm:py-20">
      <div className="mb-8">
        <Wordmark />
      </div>
      <div className="w-full max-w-sm rounded-md border border-rule bg-paper-raised p-6 sm:p-8">{children}</div>
      <p className="mt-6 max-w-sm text-center text-xs text-ink-3">The Bandwise console is open to the internal team during early access.</p>
    </main>
  );
}
