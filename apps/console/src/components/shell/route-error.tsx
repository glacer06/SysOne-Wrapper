"use client";

import type { ReactNode } from "react";

import { Button, InlineAlert } from "~/components/ui";

/**
 * The error boundary body for every console route. It never shows the error's message, which can
 * carry server state; the digest is enough to find the server log line.
 */
export function RouteError({ title, error, reset, hint }: { title: string; error: Error & { digest?: string }; reset: () => void; hint?: ReactNode }) {
  return (
    <div>
      <h1 className="mb-6 bw-page-title">{title}</h1>
      <InlineAlert kind="error" title="Couldn't load this page">
        Something failed on our side. Nothing was changed. Try again.
        {hint === undefined ? null : <span className="mt-1 block">{hint}</span>}
        {error.digest === undefined ? null : (
          <span className="mt-1 block">
            If it fails again, share this reference with the team: <span className="font-mono text-xs">{error.digest}</span>
          </span>
        )}
      </InlineAlert>
      <Button className="mt-4" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
