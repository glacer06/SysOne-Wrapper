"use client";

import type { DryRunResult, ErrorDetail, PointerChannel, RolloutStage } from "@bandwise/core";
import { useId, useState, useTransition } from "react";

import { Button, InlineAlert, Select, useToast } from "~/components/ui";
import { ConfirmDialog } from "~/components/ui/confirm-dialog";

import { checkPublishAction, publishAction } from "./actions";
import { LintList } from "./lint-list";
import { SpecDiffView } from "./spec-diff-view";
import { STAGE_LABEL, STAGE_MEANING } from "./stages";

const CHANNELS = [
  { value: "production", label: "Production" },
  { value: "staging", label: "Staging" },
] as const;

export interface PublishProps {
  setRef: string;
  draft: { version: number; etag: string };
  /** Each channel's current stage; a channel with no pointer starts at shadow on its first publish. */
  stages: Partial<Record<PointerChannel, RolloutStage>>;
}

export function PublishDraft({ setRef, draft, stages }: PublishProps) {
  const toast = useToast();
  const changelogId = useId();
  const [busy, start] = useTransition();
  const [channel, setChannel] = useState<PointerChannel>("production");
  const [changelog, setChangelog] = useState("");
  const [preview, setPreview] = useState<DryRunResult | null>(null);
  const [failure, setFailure] = useState<{ message: string; details: ErrorDetail[] } | null>(null);
  const [missing, setMissing] = useState(false);

  const args = { ref: setRef, channel, changelog, etag: draft.etag };
  const stage = stages[channel];
  const errors = preview?.lints.filter((l) => l.severity === "error") ?? [];
  const nothingNew = preview !== null && preview.diff.changes.length === 0 && stage !== undefined;

  function review() {
    if (changelog.trim() === "") {
      setMissing(true);
      return;
    }
    setFailure(null);
    start(async () => {
      const r = await checkPublishAction(args);
      if (r.ok) setPreview(r.data);
      else setFailure({ message: r.message, details: r.details });
    });
  }

  function publish() {
    start(async () => {
      const r = await publishAction(args);
      setPreview(null);
      if (r.ok) {
        setChangelog("");
        setFailure(null);
        toast(r.message);
      } else setFailure({ message: r.message, details: r.details });
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-bw-text-muted">
        Publishing freezes the draft as version {draft.version} and points the channel at it. Published versions never change, and
        rollback moves the pointer back.
      </p>
      <div className="grid gap-4 sm:grid-cols-[12rem_1fr]">
        <Select label="Channel" options={CHANNELS} value={channel} onChange={(e) => setChannel(e.target.value as PointerChannel)} disabled={busy} />
        <div className="flex flex-col gap-1.5">
          <label htmlFor={changelogId} className="text-sm font-medium text-bw-text">
            Changelog
          </label>
          <textarea
            id={changelogId}
            rows={2}
            value={changelog}
            onChange={(e) => {
              setChangelog(e.target.value);
              setMissing(false);
            }}
            placeholder="What changed and why, in one line"
            aria-invalid={missing || undefined}
            aria-describedby={missing ? `${changelogId}-error` : undefined}
            disabled={busy}
            className="w-full rounded-sm border border-bw-border-control bg-bw-surface-sunken px-3 py-2 text-sm text-bw-text placeholder:text-bw-text-muted aria-[invalid=true]:border-bw-low"
          />
          {missing ? (
            <p id={`${changelogId}-error`} className="text-xs text-bw-low-text">
              Write a changelog: one line on what changed and why.
            </p>
          ) : null}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="primary" onClick={review} pending={busy && preview === null}>
          {busy && preview === null ? "Checking..." : "Review and publish"}
        </Button>
        <span className="text-xs text-bw-text-muted">
          {stage === undefined
            ? `${channel} has no version yet. Its first publish starts at Shadow.`
            : `${channel} is ${STAGE_LABEL[stage]}. The stage does not change on publish.`}
        </span>
      </div>

      {failure === null ? null : (
        <InlineAlert kind="error" title={failure.message}>
          <LintList items={failure.details} />
        </InlineAlert>
      )}

      <ConfirmDialog
        open={preview !== null}
        title={errors.length > 0 ? "The draft has lint errors" : nothingNew ? "Nothing new to publish" : `Publish version ${draft.version} to ${channel}?`}
        confirmLabel={`Publish v${draft.version}`}
        pending={busy}
        confirmDisabled={errors.length > 0 || nothingNew}
        onCancel={() => setPreview(null)}
        onConfirm={publish}
      >
        {preview === null ? null : (
          <>
            {errors.length > 0 ? <p>Fix these in the draft, then publish.</p> : null}
            {nothingNew ? <p>The draft matches what {channel} serves, so a publish would create no version.</p> : null}
            <LintList items={preview.lints} />
            {errors.length === 0 && !nothingNew ? (
              <p>
                {stage === undefined
                  ? `${channel} starts at Shadow: ${STAGE_MEANING.shadow}`
                  : `${channel} stays ${STAGE_LABEL[stage]}: ${STAGE_MEANING[stage]}`}
              </p>
            ) : null}
            <div className="max-h-[50vh] overflow-y-auto">
              <SpecDiffView diff={preview.diff} />
            </div>
          </>
        )}
      </ConfirmDialog>
    </div>
  );
}
