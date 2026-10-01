"use client";

import { Button, InlineAlert } from "~/components/ui";

/** Shown when the page fails to render. The error's message is never shown: it can carry state. */
export default function ReleasesError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex flex-col items-start gap-3">
      <InlineAlert kind="error" title="Releases could not load">
        Try again. The CLI reaches the same operations: bandwise rollback and bandwise rollout keep working while this page is down.
      </InlineAlert>
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}
