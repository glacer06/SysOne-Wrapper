"use client";

import type { ErrorDetail, PointerChannel, RolloutStage } from "@bandwise/core";
import { useState, useTransition } from "react";

import { Button, InlineAlert, Input, RolloutBadge, Select, useToast } from "~/components/ui";
import { ConfirmDialog } from "~/components/ui/confirm-dialog";

import { changeStageAction, checkRollbackAction, rollbackAction } from "./actions";
import { LintList } from "./lint-list";
import { describeMove, formatTime, needsConfirm, STAGE_LABEL, STAGE_MEANING, STAGE_ORDER } from "./stages";

export interface ChannelRow {
  channel: PointerChannel;
  version: number;
  stage: RolloutStage;
  updatedAt: string;
  /** From rollout.get: a moving model, gates not checked yet. */
  warnings: string[];
}

type Failure = { message: string; details: ErrorDetail[] } | null;

type Pending =
  | { kind: "stage"; to: RolloutStage; reason: string }
  | { kind: "rollback"; check: { from: string; to: string; changes: number } | null; error: string | null }
  | { kind: "pause" }
  | null;

const STAGE_OPTIONS = STAGE_ORDER.map((s) => ({ value: s, label: STAGE_LABEL[s] }));

export function Channels({ setRef, channels, canEdit }: { setRef: string; channels: ChannelRow[]; canEdit: boolean }) {
  return (
    <ul className="flex flex-col divide-y divide-bw-border">
      {channels.map((c) => (
        // Keyed on what the server says, so the controls reset after a change lands.
        <li key={`${c.channel}:${c.version}:${c.stage}`} className="py-4 first:pt-0 last:pb-0">
          <ChannelControls setRef={setRef} row={c} canEdit={canEdit} />
        </li>
      ))}
    </ul>
  );
}

function ChannelControls({ setRef, row, canEdit }: { setRef: string; row: ChannelRow; canEdit: boolean }) {
  const toast = useToast();
  const [busy, start] = useTransition();
  const [target, setTarget] = useState<RolloutStage>(row.stage);
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState<Pending>(null);
  const [failure, setFailure] = useState<Failure>(null);
  const label = row.channel === "production" ? "Production" : "Staging";

  function done(r: { ok: true; message: string } | { ok: false; message: string; details: ErrorDetail[] }) {
    setPending(null);
    if (r.ok) {
      setFailure(null);
      setReason("");
      toast(r.message);
    } else setFailure({ message: r.message, details: r.details });
  }

  function moveStage(to: RolloutStage, why: string) {
    start(async () => done(await changeStageAction({ ref: setRef, channel: row.channel, stage: to, reason: why })));
  }

  function askStage() {
    if (target === row.stage) return;
    if (needsConfirm(row.stage, target)) setPending({ kind: "stage", to: target, reason });
    else moveStage(target, reason);
  }

  function askRollback() {
    setFailure(null);
    start(async () => {
      const r = await checkRollbackAction({ ref: setRef, channel: row.channel });
      setPending(r.ok ? { kind: "rollback", check: r.data, error: null } : { kind: "rollback", check: null, error: r.message });
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h3 className="text-sm font-semibold text-bw-text">{label}</h3>
        <span className="font-mono text-sm text-bw-text">v{row.version}</span>
        <RolloutBadge stage={row.stage} />
        <span className="text-xs text-bw-text-muted">Updated {formatTime(row.updatedAt)}</span>
      </div>
      <p className="text-sm text-bw-text-muted">{STAGE_MEANING[row.stage]}</p>
      {row.warnings.length === 0 ? null : (
        <ul className="flex flex-col gap-1 text-xs text-bw-text-muted">
          {row.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}

      {canEdit ? (
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
          <div className="grid flex-1 gap-3 sm:grid-cols-[10rem_1fr_auto] sm:items-end">
            <Select label="Stage" options={STAGE_OPTIONS} value={target} onChange={(e) => setTarget(e.target.value as RolloutStage)} disabled={busy} />
            <Input label="Reason" placeholder="Why, for the audit log (optional)" value={reason} onChange={(e) => setReason(e.target.value)} disabled={busy} />
            <Button onClick={askStage} disabled={busy || target === row.stage}>
              Change stage
            </Button>
          </div>
          <div className="flex gap-2">
            <Button onClick={askRollback} disabled={busy}>
              Roll back
            </Button>
            {row.stage === "paused" ? null : (
              <Button variant="danger" onClick={() => setPending({ kind: "pause" })} disabled={busy}>
                Pause
              </Button>
            )}
          </div>
        </div>
      ) : null}

      {failure === null ? null : (
        <InlineAlert kind="error" title={failure.message}>
          <LintList items={failure.details} />
        </InlineAlert>
      )}

      <ConfirmDialog
        open={pending?.kind === "stage"}
        title={pending?.kind === "stage" ? `Move ${row.channel} to ${STAGE_LABEL[pending.to]}?` : ""}
        confirmLabel={pending?.kind === "stage" ? `Move to ${STAGE_LABEL[pending.to]}` : "Move"}
        pending={busy}
        onCancel={() => setPending(null)}
        onConfirm={() => pending?.kind === "stage" && moveStage(pending.to, pending.reason)}
      >
        {pending?.kind === "stage" ? describeMove(row.channel, row.stage, pending.to).map((line) => <p key={line}>{line}</p>) : null}
      </ConfirmDialog>

      <ConfirmDialog
        open={pending?.kind === "rollback"}
        title={`Roll back ${row.channel}?`}
        confirmLabel="Roll back"
        tone="danger"
        pending={busy}
        confirmDisabled={pending?.kind === "rollback" && pending.check === null}
        onCancel={() => setPending(null)}
        onConfirm={() => start(async () => done(await rollbackAction({ ref: setRef, channel: row.channel })))}
      >
        {pending?.kind === "rollback" && pending.check !== null ? (
          <>
            <p>
              {row.channel} stops serving <span className="font-mono text-bw-text">{pending.check.from}</span> and serves{" "}
              <span className="font-mono text-bw-text">{pending.check.to}</span> again, with {pending.check.changes}{" "}
              {pending.check.changes === 1 ? "spec change" : "spec changes"}.
            </p>
            <p>The stage stays {STAGE_LABEL[row.stage]}. Rollback is never gated, and the next run uses the older version.</p>
          </>
        ) : pending?.kind === "rollback" ? (
          <p>{pending.error}</p>
        ) : null}
      </ConfirmDialog>

      <ConfirmDialog
        open={pending?.kind === "pause"}
        title={`Pause ${row.channel}?`}
        confirmLabel="Pause now"
        tone="danger"
        pending={busy}
        onCancel={() => setPending(null)}
        onConfirm={() => moveStage("paused", reason)}
      >
        <p>{STAGE_MEANING.paused}</p>
        <p>Callers keep their existing path until a person moves the stage again. Pausing is never gated.</p>
      </ConfirmDialog>
    </div>
  );
}
