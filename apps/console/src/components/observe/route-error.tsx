"use client";

import { Button, InlineAlert } from "~/components/ui";

/**
 * The error boundary body for the runs, savings and review routes. It never shows the error's
 * message, which can carry server state; the digest is enough to find the server log line.
 */
export function RouteError({ title, error, reset }: { title: string; error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight text-ink">{title}</h1>
      <InlineAlert kind="error" title="This page could not load">
        Something went wrong on our side. Try again in a moment.
        {error.digest === undefined ? null : <span className="mt-1 block font-mono text-xs text-ink-3">Reference {error.digest}</span>}
      </InlineAlert>
      <Button className="mt-4" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
