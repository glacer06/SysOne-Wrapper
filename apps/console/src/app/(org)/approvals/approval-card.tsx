// APPR-C, "Request card and trail": who asked (the agent token), what it wants in plain verbs and
// what that touches, the risk with its reason, how to undo it, then the trail (proposed, waiting,
// decided). The change is read through operations (set.get, version.diff), never the database.

import type { PointerChannel, RolloutStage, SpecDiff } from "@bandwise/core";
import Link from "next/link";
import type { ReactNode } from "react";

import { Badge, cx, RolloutBadge } from "~/components/ui";
import { consoleOperation } from "~/server/console-operation";

import { SpecDiffView } from "../sets/[ref]/releases/spec-diff-view";
import { describeMove, formatTime, STAGE_ORDER } from "../sets/[ref]/releases/stages";
import { DecideButtons } from "./decide";
import { operationLabel, requestSentence, riskReason, type SetFacts, setRefOf, trailSteps, undoNote } from "./describe";

export interface ApprovalItem {
  id: string;
  opId: string;
  status: "pending" | "approved" | "rejected" | "expired" | "executed";
  reason: string;
  input: unknown;
  ifMatch: string | null;
  requestedBy: { userId: string; tokenId: string; name?: string; tokenName?: string };
  createdAt: string;
  expiresAt: string;
  decidedAt?: string;
  result?: unknown;
}

export interface SetOut {
  slug: string;
  protected: boolean;
  draft: { etag: string } | null;
  channels: { channel: PointerChannel; version: number; stage: RolloutStage }[];
}

export interface Change {
  diff: SpecDiff | null;
  note: string | null;
  warning: string | null;
}

const STATUS: Record<ApprovalItem["status"], { tone: "info" | "good" | "danger" | "neutral"; label: string }> = {
  pending: { tone: "info", label: "Waiting" },
  approved: { tone: "good", label: "Approved" },
  executed: { tone: "good", label: "Approved and ran" },
  rejected: { tone: "danger", label: "Denied" },
  expired: { tone: "neutral", label: "Expired" },
};

async function changeOf(item: ApprovalItem, input: Record<string, unknown>, set: SetOut | null): Promise<Change> {
  const ref = setRefOf(input);
  if (ref === null || set === null) return { diff: null, note: null, warning: null };
  const channel = input["channel"] === "staging" ? "staging" : "production";
  const pointer = set.channels.find((c) => c.channel === channel);

  if (item.opId === "set.publish") {
    const stale = item.ifMatch !== null && set.draft !== null && item.ifMatch !== set.draft.etag;
    const warning = stale ? "The draft changed after the agent asked. Approving will fail and nothing will publish." : null;
    if (pointer === undefined) return { diff: null, note: `First publish to ${channel}. It starts at Shadow.`, warning };
    const d = await consoleOperation("version.diff", { ref, from: channel, to: "draft" });
    return { diff: d.status === "ok" ? (d.output as SpecDiff) : null, note: d.status === "error" ? d.message : null, warning };
  }
  if (item.opId === "channel.promote") {
    const d = await consoleOperation("version.diff", { ref, from: "production", to: "staging" });
    return { diff: d.status === "ok" ? (d.output as SpecDiff) : null, note: d.status === "error" ? d.message : null, warning: null };
  }
  return { diff: null, note: null, warning: null };
}

/** Loads what the request touches, then draws it. */
export async function ApprovalCard({ item, now, decide }: { item: ApprovalItem; now: Date; decide: boolean }) {
  const input = (item.input !== null && typeof item.input === "object" ? item.input : {}) as Record<string, unknown>;
  const ref = setRefOf(input);
  const got = ref === null ? null : await consoleOperation("set.get", { ref });
  const set = got?.status === "ok" ? (got.output as SetOut) : null;
  const change = await changeOf(item, input, set);
  return <RequestCard item={item} set={set} change={change} now={now} decide={decide} />;
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 border-t border-bw-border pt-3 sm:grid-cols-[8.5rem_minmax(0,1fr)] sm:gap-4">
      <dt className="bw-label pt-0.5">{label}</dt>
      <dd className="min-w-0 text-sm text-bw-text">{children}</dd>
    </div>
  );
}

export function RequestCard({ item, set, change, now, decide }: { item: ApprovalItem; set: SetOut | null; change: Change; now: Date; decide: boolean }) {
  const input = (item.input !== null && typeof item.input === "object" ? item.input : {}) as Record<string, unknown>;
  const ref = setRefOf(input);
  const facts: SetFacts | null = set === null ? null : { protected: set.protected, stages: Object.fromEntries(set.channels.map((c) => [c.channel, c.stage])) };
  const label = operationLabel(item.opId);
  const status = STATUS[item.status];
  const channel = input["channel"] === "staging" ? "staging" : "production";
  const stageMove =
    item.opId === "rollout.change" && set !== null && STAGE_ORDER.includes(input["stage"] as RolloutStage)
      ? { channel, from: set.channels.find((c) => c.channel === channel)?.stage ?? ("inactive" as RolloutStage), to: input["stage"] as RolloutStage }
      : null;
  const steps = trailSteps(item, now, formatTime);
  const hasDetail = stageMove !== null || change.diff !== null || change.note !== null;

  return (
    <article aria-labelledby={`req-${item.id}`} className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_17rem] lg:gap-8">
      <div className="min-w-0 rounded-md border border-bw-border bg-bw-surface px-5 py-5 sm:px-6">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <h2 id={`req-${item.id}`} className="text-lg leading-snug font-semibold text-bw-text">
            {requestSentence(item.opId, input)}
          </h2>
          <Badge tone={status.tone}>{status.label}</Badge>
        </div>
        <dl className="grid gap-3">
          <Row label="Agent token">
            <span className="font-mono">{item.requestedBy.tokenName ?? "Unnamed token"}</span>
            <span className="ml-2 font-mono text-xs text-bw-text-muted">{item.requestedBy.tokenId.slice(0, 8)}</span>
            <span className="mt-0.5 block text-xs text-bw-text-muted">Acts for {item.requestedBy.name ?? "a member"}, with no more than their role.</span>
          </Row>
          <Row label="Wants to">
            {label}
            <span className="mt-0.5 block font-mono text-xs text-bw-text-muted">{item.opId}</span>
          </Row>
          <Row label="Touches">
            {ref === null ? (
              "The org, not one set."
            ) : (
              <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <Link href={`/sets/${encodeURIComponent(ref)}/releases`} className="font-mono underline underline-offset-2">
                  {ref}
                </Link>
                {set === null
                  ? null
                  : set.channels.map((c) => (
                      <span key={c.channel} className="inline-flex items-center gap-1 text-xs text-bw-text-muted">
                        {c.channel} v{c.version} <RolloutBadge stage={c.stage} />
                      </span>
                    ))}
              </span>
            )}
          </Row>
          <Row label="Risk">
            <span className="font-semibold">High.</span> {riskReason(item.opId, input, facts)}
          </Row>
          <Row label="Agent's reason">{item.reason}</Row>
          <Row label="If it is wrong">{undoNote(item.opId)}</Row>
        </dl>

        {change.warning === null ? null : <p className="mt-4 text-sm font-medium text-bw-low-text">{change.warning}</p>}

        {hasDetail ? (
          <div className="mt-4 flex flex-col gap-3 border-t border-bw-border pt-4">
            <p className="bw-label">What changes</p>
            {stageMove === null ? null : (
              <div className="flex flex-col gap-1 text-sm text-bw-text-muted">
                <p className="flex flex-wrap items-center gap-2 text-bw-text">
                  {stageMove.channel}: <RolloutBadge stage={stageMove.from} /> to <RolloutBadge stage={stageMove.to} />
                </p>
                {describeMove(stageMove.channel, stageMove.from, stageMove.to)
                  .slice(1)
                  .map((line) => (
                    <p key={line}>{line}</p>
                  ))}
              </div>
            )}
            {change.note === null ? null : <p className="text-sm text-bw-text-muted">{change.note}</p>}
            {change.diff === null ? null : <SpecDiffView diff={change.diff} />}
          </div>
        ) : null}

        <details className="mt-4 text-sm">
          <summary className="inline-flex min-h-11 cursor-pointer items-center text-bw-text-muted">The exact input</summary>
          <pre className="mt-2 max-h-72 overflow-auto rounded-sm bg-bw-surface-sunken px-3 py-2 font-mono text-xs whitespace-pre-wrap break-words text-bw-text">
            {JSON.stringify(item.input, null, 2)}
          </pre>
        </details>
        {item.result === undefined ? null : (
          <details className="text-sm" open={item.status !== "executed"}>
            <summary className="inline-flex min-h-11 cursor-pointer items-center text-bw-text-muted">Result</summary>
            <pre className="mt-2 max-h-72 overflow-auto rounded-sm bg-bw-surface-sunken px-3 py-2 font-mono text-xs whitespace-pre-wrap break-words text-bw-text">
              {JSON.stringify(item.result, null, 2)}
            </pre>
          </details>
        )}
        {decide && item.status === "pending" ? (
          <div className="mt-5 border-t border-bw-border pt-5">
            <DecideButtons id={item.id} label={label} warning={change.warning} />
          </div>
        ) : null}
      </div>

      <section aria-label="Trail" className="min-w-0">
        <p className="bw-label mb-3">Trail</p>
        <ol className="flex flex-col">
          {steps.map((s, i) => (
            <li key={s.label} className="relative flex gap-3 pb-5 last:pb-0">
              {i < steps.length - 1 ? <span aria-hidden className="absolute top-4 bottom-0 left-[5px] border-l-[3px] border-dotted border-bw-border-strong" /> : null}
              <span
                aria-hidden
                className={cx(
                  "relative mt-1 h-3.5 w-3.5 shrink-0 rounded-full border",
                  s.state === "current" ? "border-bw-brand bg-bw-brand" : s.state === "done" ? "border-bw-text-muted bg-bw-text-muted" : "border-bw-border-control bg-bw-surface",
                )}
              />
              <div className="min-w-0">
                <p className={cx("text-sm font-semibold", s.state === "todo" ? "text-bw-text-muted" : "text-bw-text")}>
                  {s.label}
                  {s.state === "current" ? <span className="sr-only"> (now)</span> : null}
                </p>
                {s.at === null ? null : <p className="font-mono text-xs text-bw-text-muted">{s.at}</p>}
                <p className="mt-0.5 text-sm text-bw-text-muted">{s.detail}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </article>
  );
}
