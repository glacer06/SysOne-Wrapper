"use client";

import { Button, InlineAlert } from "~/components/ui";

// The error itself is not shown: its message can carry server details. Next logs it on the server.
export default function SetsError({ reset }: { reset: () => void }) {
  return (
    <InlineAlert kind="error" title="This page could not load">
      <p>Something went wrong on our side. Your saved work is safe.</p>
      <Button size="sm" className="mt-3" onClick={reset}>
        Try again
      </Button>
    </InlineAlert>
  );
}
