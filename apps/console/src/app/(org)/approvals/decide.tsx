"use client";

import { useState, useTransition } from "react";

import { Button, InlineAlert, Input, useToast } from "~/components/ui";
import { ConfirmDialog } from "~/components/ui/confirm-dialog";

import { decideAction } from "./actions";

/** Approve or deny one request, with an optional note for the audit log. */
export function DecideButtons({ id, label, warning }: { id: string; label: string; warning: string | null }) {
  const toast = useToast();
  const [busy, start] = useTransition();
  const [note, setNote] = useState("");
  const [asking, setAsking] = useState<"approved" | "rejected" | null>(null);
  const [error, setError] = useState<string | null>(null);

  function decide(decision: "approved" | "rejected") {
    start(async () => {
      const r = await decideAction({ id, decision, note });
      setAsking(null);
      if (r.ok) {
        setError(null);
        toast(r.message);
      } else setError(r.message);
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <Input label="Note" placeholder="Optional, saved on the audit row" value={note} onChange={(e) => setNote(e.target.value)} disabled={busy} />
        </div>
        <div className="flex gap-2">
          <Button variant="primary" onClick={() => setAsking("approved")} disabled={busy}>
            Approve
          </Button>
          <Button variant="danger" onClick={() => setAsking("rejected")} disabled={busy}>
            Deny
          </Button>
        </div>
      </div>
      {error === null ? null : <InlineAlert kind="error">{error}</InlineAlert>}
      <ConfirmDialog
        open={asking === "approved"}
        title={`Approve: ${label}?`}
        confirmLabel="Approve and run"
        pending={busy}
        onCancel={() => setAsking(null)}
        onConfirm={() => decide("approved")}
      >
        <p>The request runs now, exactly as the agent sent it, as the agent&apos;s token. The audit log names you as the approver.</p>
        {warning === null ? null : <p className="text-bw-low-text">{warning}</p>}
      </ConfirmDialog>
      <ConfirmDialog
        open={asking === "rejected"}
        title={`Deny: ${label}?`}
        confirmLabel="Deny"
        tone="danger"
        pending={busy}
        onCancel={() => setAsking(null)}
        onConfirm={() => decide("rejected")}
      >
        <p>Nothing runs. The agent sees the request as rejected and can ask again.</p>
      </ConfirmDialog>
    </div>
  );
}
