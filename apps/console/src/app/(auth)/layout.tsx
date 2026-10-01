import type { ReactNode } from "react";

import { BWireframe } from "~/components/shell/b-wireframe";
import { MarkA } from "~/components/shell/wordmark";
import { TrailDivider } from "~/components/ui";

// Sign-in, two-factor and password pages: one calm column, nothing else on screen. Mark A stands
// above the card, and the B is drawn faintly behind the page, cropped at the right edge.
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="relative isolate flex min-h-dvh flex-col items-center overflow-clip bg-bw-bg px-4 py-10 sm:py-16">
      <BWireframe className="absolute top-1/2 right-0 -z-10 aspect-[203.33/306.67] h-[clamp(640px,115%,1120px)] w-auto translate-x-[38%] -translate-y-1/2" />
      <div className="mb-8">
        <MarkA width={144} alt="Bandwise" priority className="w-[7.5rem] sm:w-36 [&_img]:h-auto [&_img]:w-full" />
      </div>
      <div className="w-full max-w-[26rem] rounded-md border border-bw-border bg-bw-surface p-6 sm:p-8">{children}</div>
      <TrailDivider className="mt-8 w-16" />
      <p className="mt-4 max-w-[26rem] text-center text-sm text-bw-text-muted">The Bandwise console is open to the internal team during early access.</p>
    </main>
  );
}
