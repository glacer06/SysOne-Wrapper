import type { Metadata } from "next";

import { ApprovalsFirstRun } from "~/components/observe/first-runs";
import { OperationFailed } from "~/components/shell/operation-failed";
import { PageHeader } from "~/components/ui";
import { consoleOperation } from "~/server/console-operation";

import { ApprovalCard, type ApprovalItem } from "./approval-card";

export const metadata: Metadata = { title: "Approvals · Bandwise console" };

export default async function ApprovalsPage() {
  const result = await consoleOperation("approval.list", { limit: 50 });
  const items = result.status === "ok" ? ((result.output as { data: ApprovalItem[] }).data ?? []) : [];
  const now = new Date();
  return (
    <>
      <PageHeader
        title="Approvals"
        description="High-risk changes an agent asked for. Nothing runs until a person approves it. Pause and rollback never wait here."
      />
      {result.status === "error" ? (
        <OperationFailed message={result.message} />
      ) : items.length === 0 ? (
        <ApprovalsFirstRun />
      ) : (
        <div className="flex flex-col gap-10">
          <p className="text-sm text-bw-text-muted">
            {items.length} {items.length === 1 ? "request is" : "requests are"} waiting, newest first.
          </p>
          {items.map((item) => (
            <ApprovalCard key={item.id} item={item} now={now} decide />
          ))}
        </div>
      )}
    </>
  );
}
