import type { ReactNode } from "react";

import { EmptyState, InlineAlert } from "../ui";

/**
 * The page body while an operation's handler is still a stub, or when it fails. `cli` is the
 * command that does the same thing today, so the page is still useful.
 */
export function NotBuiltYet({ title, children, cli }: { title: string; children: ReactNode; cli?: string }) {
  return (
    <EmptyState title={title}>
      {children}
      {cli === undefined ? null : (
        <p className="mt-3">
          Today, from a shell: <code className="rounded-sm bg-paper-sunk px-1.5 py-0.5 font-mono text-xs text-ink">{cli}</code>
        </p>
      )}
    </EmptyState>
  );
}

export function OperationFailed({ message }: { message: string }) {
  return <InlineAlert kind="error" title="This page could not load">{message}</InlineAlert>;
}
