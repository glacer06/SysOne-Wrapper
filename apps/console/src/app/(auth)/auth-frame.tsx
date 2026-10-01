import type { ReactNode } from "react";

import { BWireframe } from "~/components/shell/b-wireframe";
import { MarkA } from "~/components/shell/wordmark";

/**
 * Sign-in, two-factor and password pages (AUTH-B, rail and pane). The rail lists the whole path
 * as a dotted trail with the current step as the one teal node, under mark A. The pane holds only
 * the step at hand, with the B drawn faintly behind it, cropped at the right edge. On a phone the
 * rail lies flat above the heading.
 */
export function AuthFrame({ children, rail }: { children: ReactNode; rail: ReactNode }) {
  return (
    <main className="relative isolate flex min-h-dvh flex-col overflow-clip bg-bw-bg md:flex-row">
      <aside className="relative z-10 flex flex-col gap-6 border-b border-bw-border bg-bw-surface px-4 py-6 sm:px-8 md:w-72 md:shrink-0 md:gap-10 md:border-r md:border-b-0 md:px-10 md:py-16 lg:w-80">
        <MarkA width={96} alt="Bandwise" priority className="w-[4.5rem] md:w-24 [&_img]:h-auto [&_img]:w-full" />
        {rail}
        <p className="mt-auto hidden max-w-[16rem] text-xs text-bw-text-muted md:block">The Bandwise console is open to the internal team during early access.</p>
      </aside>
      <div className="relative flex flex-1 flex-col justify-start px-4 py-10 sm:px-8 md:justify-center md:px-12 md:py-16 lg:px-20">
        <BWireframe className="absolute top-1/2 right-0 -z-10 aspect-[203.33/306.67] h-[clamp(640px,115%,1120px)] w-auto translate-x-[38%] -translate-y-1/2" />
        <div className="w-full max-w-[28rem]">{children}</div>
        <p className="mt-10 max-w-[28rem] text-xs text-bw-text-muted md:hidden">The Bandwise console is open to the internal team during early access.</p>
      </div>
    </main>
  );
}
