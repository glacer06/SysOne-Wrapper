// The link an agent prints with a pending approval (https://app.bandwise.dev/approvals/{id}).

import type { Metadata } from "next";
import Link from "next/link";

import { OperationFailed } from "~/components/shell/coming-soon";
import { EmptyState, PageHeader } from "~/components/ui";
import { consoleOperation } from "~/server/console-operation";

import { ApprovalCard, type ApprovalItem } from "../approval-card";

export const metadata: Metadata = { title: "Approval · Bandwise console" };

export default async function ApprovalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await consoleOperation("approval.get", { id });
  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-2 text-sm text-ink-3">
        <Link href="/approvals" className="hover:text-ink">
          Approvals
        </Link>
      </nav>
      <PageHeader title="Agent request" />
      {result.status === "ok" ? (
        <ApprovalCard item={result.output as ApprovalItem} now={new Date()} decide />
      ) : result.status === "error" && (result.code === "not_found" || result.code === "invalid_request") ? (
        <EmptyState title="No such request">This approval does not exist, or your role cannot decide it.</EmptyState>
      ) : (
        <OperationFailed message={result.status === "error" ? result.message : "The request could not load."} />
      )}
    </>
  );
}
