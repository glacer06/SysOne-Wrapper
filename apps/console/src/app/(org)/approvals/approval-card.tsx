// One agent request: who asked, the operation, what it would change, and why it waited for a
// person. The change is read through operations (set.get, version.diff), never the database.

import type { PointerChannel, RolloutStage, SpecDiff } from "@bandwise/core";
import Link from "next/link";

import { Badge, Card, RolloutBadge } from "~/components/ui";
import { consoleOperation } from "~/server/console-operation";

import { SpecDiffView } from "../sets/[ref]/releases/spec-diff-view";
import { describeMove, formatTime, STAGE_ORDER } from "../sets/[ref]/releases/stages";
import { DecideButtons } from "./decide";
import { operationLabel, riskReason, type SetFacts, setRefOf, timeLeft } from "./describe";

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

interface SetOut {
  slug: string;
  protected: boolean;
  draft: { etag: string } | null;
  channels: { channel: PointerChannel; version: number; stage: RolloutStage }[];
}

const STATUS_TONE = { pending: "info", approved: "good", executed: "good", rejected: "danger", expired: "neutral" } as const;

async function changeOf(item: ApprovalItem, input: Record<string, unknown>, set: SetOut | null) {
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

export async function ApprovalCard({ item, now, decide }: { item: ApprovalItem; now: Date; decide: boolean }) {
  const input = (item.input !== null && typeof item.input === "object" ? item.input : {}) as Record<string, unknown>;
  const ref = setRefOf(input);
  const got = ref === null ? null : await consoleOperation("set.get", { ref });
  const set = got?.status === "ok" ? (got.output as SetOut) : null;
  const facts: SetFacts | null = set === null ? null : { protected: set.protected, stages: Object.fromEntries(set.channels.map((c) => [c.channel, c.stage])) };
  const change = await changeOf(item, input, set);
  const label = operationLabel(item.opId);
  const name = item.requestedBy.name ?? "A member";
  const who = item.requestedBy.tokenName === undefined ? `${name}, through an agent token,` : `${name}, through the agent token "${item.requestedBy.tokenName}",`;

  const stageMove =
    item.opId === "rollout.change" && set !== null && STAGE_ORDER.includes(input["stage"] as RolloutStage)
      ? {
          channel: input["channel"] === "staging" ? "staging" : "production",
          from: set.channels.find((c) => c.channel === (input["channel"] === "staging" ? "staging" : "production"))?.stage ?? "inactive",
          to: input["stage"] as RolloutStage,
        }
      : null;

  return (
    <Card
      title={label}
      description={
        <>
          {who} asked {formatTime(item.createdAt)}.
          {item.status === "pending" ? ` Expires ${timeLeft(item.expiresAt, now)}.` : null}
        </>
      }
      actions={<Badge tone={STATUS_TONE[item.status]}>{item.status[0]?.toUpperCase() + item.status.slice(1)}</Badge>}
    >
      <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-[9rem_1fr]">
        <dt className="text-bw-text-muted">Operation</dt>
        <dd className="font-mono text-bw-text">{item.opId}</dd>
        {ref === null ? null : (
          <>
            <dt className="text-bw-text-muted">Set</dt>
            <dd>
              <Link href={`/sets/${encodeURIComponent(ref)}/releases`} className="font-mono text-bw-text underline underline-offset-2">
                {ref}
              </Link>
              {set === null ? null : (
                <span className="ml-3 inline-flex flex-wrap gap-2 align-middle">
                  {set.channels.map((c) => (
                    <span key={c.channel} className="inline-flex items-center gap-1 text-xs text-bw-text-muted">
                      {c.channel} v{c.version} <RolloutBadge stage={c.stage} />
                    </span>
                  ))}
                </span>
              )}
            </dd>
          </>
        )}
        <dt className="text-bw-text-muted">Agent&apos;s reason</dt>
        <dd className="text-bw-text">{item.reason}</dd>
        <dt className="text-bw-text-muted">Why it waits</dt>
        <dd className="text-bw-text">{riskReason(item.opId, input, facts)}</dd>
      </dl>

      <div className="mt-4 flex flex-col gap-3">
        {stageMove === null ? null : (
          <div className="flex flex-col gap-1 rounded-md border border-bw-border px-4 py-3 text-sm text-bw-text-muted">
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
        {change.warning === null ? null : <p className="text-sm font-medium text-bw-low-text">{change.warning}</p>}
        {change.note === null ? null : <p className="text-sm text-bw-text-muted">{change.note}</p>}
        {change.diff === null ? null : <SpecDiffView diff={change.diff} />}
        <details className="text-sm">
          <summary className="cursor-pointer text-bw-text-muted">The exact input</summary>
          <pre className="mt-2 max-h-72 overflow-auto rounded-sm bg-bw-surface-sunken px-3 py-2 font-mono text-xs whitespace-pre-wrap break-words text-bw-text">
            {JSON.stringify(item.input, null, 2)}
          </pre>
        </details>
        {item.result === undefined ? null : (
          <details className="text-sm" open={item.status !== "executed"}>
            <summary className="cursor-pointer text-bw-text-muted">Result</summary>
            <pre className="mt-2 max-h-72 overflow-auto rounded-sm bg-bw-surface-sunken px-3 py-2 font-mono text-xs whitespace-pre-wrap break-words text-bw-text">
              {JSON.stringify(item.result, null, 2)}
            </pre>
          </details>
        )}
        {decide && item.status === "pending" ? <DecideButtons id={item.id} label={label} warning={change.warning} /> : null}
      </div>
    </Card>
  );
}
