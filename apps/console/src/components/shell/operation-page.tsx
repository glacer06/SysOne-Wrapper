import type { OperationId } from "@bandwise/core";
import type { ReactNode } from "react";

import { consoleOperation } from "~/server/console-operation";

import { EmptyState, PageHeader } from "../ui";
import { NotBuiltYet, OperationFailed } from "./coming-soon";

export interface OperationPageProps {
  title: string;
  description: string;
  /** A list operation the page reads through runOperation. */
  operation: OperationId;
  input?: unknown;
  /** Shown while the handler is a stub. */
  coming: ReactNode;
  /** Shown when the list is empty. */
  empty: { title: string; body: ReactNode };
  cli?: string;
}

/**
 * The shell every nav page starts from: header, then the operation's state. The UI team replaces
 * the "has rows" branch with the real view for each page.
 */
export async function OperationPage({ title, description, operation, input = {}, coming, empty, cli }: OperationPageProps) {
  const result = await consoleOperation(operation, input);
  let body: ReactNode;
  if (result.status === "not-built") {
    body = (
      <NotBuiltYet title="Coming next" {...(cli === undefined ? {} : { cli })}>
        {coming}
      </NotBuiltYet>
    );
  } else if (result.status !== "ok") {
    body = <OperationFailed message={result.status === "error" ? result.message : "The operation did not run."} />;
  } else {
    const rows = (result.output as { data?: unknown[] } | undefined)?.data ?? [];
    body =
      rows.length === 0 ? (
        <EmptyState title={empty.title}>{empty.body}</EmptyState>
      ) : (
        <p className="text-sm text-ink-2">
          {rows.length} {rows.length === 1 ? "item" : "items"}. The full view lands next.
        </p>
      );
  }
  return (
    <>
      <PageHeader title={title} description={description} />
      {body}
    </>
  );
}
