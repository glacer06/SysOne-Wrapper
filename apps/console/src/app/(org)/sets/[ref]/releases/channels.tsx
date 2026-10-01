"use client";

import type { ErrorDetail, PointerChannel, RolloutStage } from "@bandwise/core";
import { useState, useTransition } from "react";

import { Button, InlineAlert, Input, Select, useToast } from "~/components/ui";
import { ConfirmDialog } from "~/components/ui/confirm-dialog";

import {
  changeStageAction,
  checkRollbackAction,
  rollbackAction,
} from "./actions";
import { LintList } from "./lint-list";
import { ChannelTrail } from "../../_components/stage-trail-view";
import {
  describeMove,
  formatTime,
  needsConfirm,
  nextMove,
  otherStages,
  STAGE_LABEL,
  STAGE_MEANING,
} from "./stages";

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
  | {
      kind: "rollback";
      check: { from: string; to: string; changes: number } | null;
      error: string | null;
    }
  | { kind: "pause" }
  | null;

export function Channels({
  setRef,
  channels,
  canEdit,
}: {
  setRef: string;
  channels: ChannelRow[];
  canEdit: boolean;
}) {
  return (
    <ul className="flex flex-col divide-y divide-bw-border">
      {channels.map((c) => (
        // Keyed on what the server says, so the controls reset after a change lands.
        <li
          key={`${c.channel}:${c.version}:${c.stage}`}
          className="py-6 first:pt-0 last:pb-0"
        >
          <ChannelControls setRef={setRef} row={c} canEdit={canEdit} />
        </li>
      ))}
    </ul>
  );
}

function ChannelControls({
  setRef,
  row,
  canEdit,
}: {
  setRef: string;
  row: ChannelRow;
  canEdit: boolean;
}) {
  const toast = useToast();
  const [busy, start] = useTransition();
  const [target, setTarget] = useState<RolloutStage>(row.stage);
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState<Pending>(null);
  const [failure, setFailure] = useState<Failure>(null);
  const label = row.channel === "production" ? "Production" : "Staging";

  function done(
    r:
      | { ok: true; message: string }
      | { ok: false; message: string; details: ErrorDetail[] },
  ) {
    setPending(null);
    if (r.ok) {
      setFailure(null);
      setReason("");
      toast(r.message);
    } else setFailure({ message: r.message, details: r.details });
  }

  function moveStage(to: RolloutStage, why: string) {
    start(async () =>
      done(
        await changeStageAction({
          ref: setRef,
          channel: row.channel,
          stage: to,
          reason: why,
        }),
      ),
    );
  }

  function askRollback() {
    setFailure(null);
    start(async () => {
      const r = await checkRollbackAction({
        ref: setRef,
        channel: row.channel,
      });
      setPending(
        r.ok
          ? { kind: "rollback", check: r.data, error: null }
          : { kind: "rollback", check: null, error: r.message },
      );
    });
  }

  const next = nextMove(row.stage);
  const others = otherStages(row.stage).map((st) => ({
    value: st,
    label: STAGE_LABEL[st],
  }));
  const otherTarget = others.some((o) => o.value === target)
    ? target
    : (others[0]?.value ?? row.stage);

  function ask(to: RolloutStage) {
    if (to === row.stage) return;
    if (needsConfirm(row.stage, to)) setPending({ kind: "stage", to, reason });
    else moveStage(to, reason);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid items-start gap-x-8 gap-y-5 lg:grid-cols-[10rem_minmax(0,1fr)_17rem]">
        <div className="flex flex-col gap-1">
          <h3 className="bw-label text-bw-text">{label}</h3>
          {row.stage === "paused" ? (
            <p className="text-sm font-semibold text-bw-low-text">
              Paused, kill switch on
            </p>
          ) : null}
          <p className="text-xs text-bw-text-muted">
            Updated {formatTime(row.updatedAt)}
          </p>
        </div>

        <div className="flex min-w-0 flex-col gap-3">
          <ChannelTrail
            stage={row.stage}
            version={row.version}
            channel={label}
          />
          <p className="text-sm text-bw-text-muted">
            {row.stage === "paused" ? (
              <span className="text-bw-text">
                Serving <span className="font-mono">v{row.version}</span>.{" "}
              </span>
            ) : null}
            {STAGE_MEANING[row.stage]}
          </p>
          {row.warnings.length === 0 ? null : (
            <ul className="flex flex-col gap-1 text-xs text-bw-text-muted">
              {row.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}
        </div>

        {canEdit ? (
          <div className="flex flex-col gap-4">
            {next === null ? (
              <p className="text-sm text-bw-text-muted">
                At full, the end of the trail. Nothing further to move to.
              </p>
            ) : (
              <div className="flex flex-col gap-1.5">
                <Button
                  variant="primary"
                  onClick={() => ask(next.to)}
                  disabled={busy}
                >
                  {next.label}
                </Button>
                <p className="text-xs text-bw-text-muted">{next.gate}</p>
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              <div className="grid grid-cols-2 gap-2">
                {row.stage === "paused" ? null : (
                  <Button
                    onClick={() => setPending({ kind: "pause" })}
                    disabled={busy}
                  >
                    Pause
                  </Button>
                )}
                <Button
                  onClick={askRollback}
                  disabled={busy}
                  className={row.stage === "paused" ? "col-span-2" : undefined}
                >
                  Roll back
                </Button>
              </div>
              <p className="text-xs text-bw-text-muted">
                {row.stage === "paused"
                  ? "Roll back never waits"
                  : "Pause and Roll back never wait"}{" "}
                for an approval.
              </p>
            </div>
          </div>
        ) : next === null ? null : (
          <p className="text-xs text-bw-text-muted">
            Next: {STAGE_LABEL[next.to]}. {next.gate}
          </p>
        )}
      </div>

      {canEdit ? (
        <details className="group rounded-sm border border-bw-border">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-3 text-sm text-bw-text hover:bg-bw-surface-sunken sm:min-h-10 [&::-webkit-details-marker]:hidden">
            <span
              aria-hidden
              className="font-mono text-xs text-bw-text-muted transition-transform group-open:rotate-90"
            >
              &gt;
            </span>
            Another stage, or a reason for the audit log
          </summary>
          <div className="grid gap-3 border-t border-bw-border p-3 sm:grid-cols-[10rem_1fr_auto] sm:items-end">
            {others.length === 0 ? (
              <p className="text-sm text-bw-text-muted sm:self-center">
                No other stage to pick.
              </p>
            ) : (
              <Select
                label="Stage"
                options={others}
                value={otherTarget}
                onChange={(e) => setTarget(e.target.value as RolloutStage)}
                disabled={busy}
              />
            )}
            <Input
              label="Reason"
              placeholder="Why, for the audit log (optional)"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={busy}
            />
            {others.length === 0 ? null : (
              <Button onClick={() => ask(otherTarget)} disabled={busy}>
                Move to {STAGE_LABEL[otherTarget].toLowerCase()}
              </Button>
            )}
          </div>
        </details>
      ) : null}

      {failure === null ? null : (
        <InlineAlert kind="error" title={failure.message}>
          <LintList items={failure.details} />
        </InlineAlert>
      )}

      <ConfirmDialog
        open={pending?.kind === "stage"}
        title={
          pending?.kind === "stage"
            ? `Move ${row.channel} to ${STAGE_LABEL[pending.to]}?`
            : ""
        }
        confirmLabel={
          pending?.kind === "stage"
            ? `Move to ${STAGE_LABEL[pending.to]}`
            : "Move"
        }
        pending={busy}
        onCancel={() => setPending(null)}
        onConfirm={() =>
          pending?.kind === "stage" && moveStage(pending.to, pending.reason)
        }
      >
        {pending?.kind === "stage"
          ? describeMove(row.channel, row.stage, pending.to).map((line) => (
              <p key={line}>{line}</p>
            ))
          : null}
      </ConfirmDialog>

      <ConfirmDialog
        open={pending?.kind === "rollback"}
        title={`Roll back ${row.channel}?`}
        confirmLabel="Roll back"
        tone="danger"
        pending={busy}
        confirmDisabled={pending?.kind === "rollback" && pending.check === null}
        onCancel={() => setPending(null)}
        onConfirm={() =>
          start(async () =>
            done(await rollbackAction({ ref: setRef, channel: row.channel })),
          )
        }
      >
        {pending?.kind === "rollback" && pending.check !== null ? (
          <>
            <p>
              {row.channel} stops serving{" "}
              <span className="font-mono text-bw-text">
                {pending.check.from}
              </span>{" "}
              and serves{" "}
              <span className="font-mono text-bw-text">{pending.check.to}</span>{" "}
              again, with {pending.check.changes}{" "}
              {pending.check.changes === 1 ? "spec change" : "spec changes"}.
            </p>
            <p>
              The stage stays {STAGE_LABEL[row.stage]}. Rollback is never gated,
              and the next run uses the older version.
            </p>
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
        <p>
          Callers keep their existing path until a person moves the stage again.
          Pausing is never gated.
        </p>
      </ConfirmDialog>
    </div>
  );
}
