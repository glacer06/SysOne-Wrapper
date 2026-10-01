import type { ReactNode } from "react";

import { Lockup } from "~/components/shell/wordmark";
import { TrailDivider } from "~/components/ui";

// Sign-in, two-factor and password pages: one calm column, nothing else on screen.
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col items-center bg-bw-bg px-4 py-10 sm:py-20">
      <div className="mb-8">
        <Lockup width={184} />
      </div>
      <div className="w-full max-w-[26rem] rounded-md border border-bw-border bg-bw-surface p-6 sm:p-8">{children}</div>
      <TrailDivider className="mt-8 w-16" />
      <p className="mt-4 max-w-[26rem] text-center text-sm text-bw-text-muted">The Bandwise console is open to the internal team during early access.</p>
    </main>
  );
}
