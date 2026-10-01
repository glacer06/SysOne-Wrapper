import Link from "next/link";

import { Facts, JsonBlock } from "~/components/observe/bits";
import { choicesOf, confidenceOf, decisionsOf, DecisionsTable } from "~/components/observe/decisions";
import { param, type SearchParams } from "~/components/observe/filters";
import { ACTION_LABEL, formatUtc, formatValue, REASON_LABEL, REVIEW_STATUS_LABEL } from "~/components/observe/format";
import { loadSets, SetLabel } from "~/components/observe/sets";
import { OperationFailed } from "~/components/shell/coming-soon";
import { Badge, BandBadge, buttonClasses, Card, InlineAlert, PageHeader, RolloutBadge } from "~/components/ui";
import { consoleOperation } from "~/server/console-operation";
import type { RunDetail } from "~/server/operations/views";

import { type Choice, ConfirmForm, ResolveForm } from "./review-forms";

/** The value inside a `{ value }` resolution, or the resolution itself. */
function valueOf(resolution: unknown): unknown {
  return typeof resolution === "object" && resolution !== null && !Array.isArray(resolution) && "value" in resolution ? (resolution as { value: unknown }).value : resolution;
}

export default async function ReviewItemPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SearchParams> }) {
  const { id } = await params;
  const runId = param(await searchParams, "run");
  const back = (
    <Link href="/review" className={buttonClasses("ghost", "sm")}>
      Back to the queue
    </Link>
  );
  if (runId === undefined) {
    return (
      <>
        <PageHeader title="Review" actions={back} />
        <InlineAlert kind="info" title="Open this item from the queue">
          This link is missing the run it belongs to. Open the item from the review queue or from its run.
        </InlineAlert>
      </>
    );
  }

  const [sets, res] = await Promise.all([loadSets(), consoleOperation("run.get", { id: runId })]);
  const item = res.status === "ok" ? (res.output as RunDetail).reviewItems.find((i) => i.id === id) : undefined;
  if (res.status !== "ok" || item === undefined) {
    return (
      <>
        <PageHeader title="Review" actions={back} />
        <OperationFailed message={res.status === "error" ? res.message : "No review item with this id is visible to you."} />
      </>
    );
  }
  const run = res.output as RunDetail;
  const decision = decisionsOf(run.decisions).find(([d]) => d === item.decisionId)?.[1];
  const answer = (run.answers as Record<string, unknown> | null)?.[item.decisionId];
  const suggested = decision?.value ?? null;
  const conf = confidenceOf(answer);
  const choices: Choice[] | null = choicesOf(answer)?.map((c) => ({ json: JSON.stringify(c.json), label: c.label })) ?? null;

  return (
    <>
      <PageHeader
        title={`Review: ${item.decisionId}`}
        description={<SetLabel sets={sets} setId={run.setId} />}
        actions={back}
      />
      <div className="flex flex-col gap-6">
        <Card title="Is this answer right?" description={REASON_LABEL[item.reason]}>
          <div className="mb-5 flex flex-wrap items-center gap-3">
            <span className="text-3xl font-semibold text-ink">{formatValue(suggested)}</span>
            <BandBadge band={item.band} />
            {conf === null ? null : <span className="font-mono text-xs text-ink-3">{conf}</span>}
            <Badge tone={item.status === "open" || item.status === "pending_confirmation" ? "info" : "neutral"}>{REVIEW_STATUS_LABEL[item.status]}</Badge>
          </div>
          {item.status === "open" ? (
            <ResolveForm id={item.id} runId={run.id} suggestedJson={JSON.stringify(suggested)} suggestedLabel={formatValue(suggested)} choices={choices} />
          ) : item.status === "pending_confirmation" ? (
            <ConfirmForm
              id={item.id}
              runId={run.id}
              agentJson={JSON.stringify(valueOf(item.resolution) ?? null)}
              agentLabel={formatValue(valueOf(item.resolution))}
              choices={choices}
            />
          ) : (
            <p className="text-sm text-ink-2">
              {item.status === "resolved" ? <>Resolved as <strong className="text-ink">{formatValue(valueOf(item.resolution))}</strong></> : "Dismissed"}
              {item.resolvedAt === null ? null : <> on {formatUtc(item.resolvedAt)}</>}.
            </p>
          )}
        </Card>

        <Card title="What the run saw" description="The state is what System One answered on.">
          {run.state === null ? (
            <p className="text-sm text-ink-2">Not stored. This set keeps a hash of the state only, so judge from the answers and the other decisions below.</p>
          ) : (
            <JsonBlock value={run.state} label="Run state" />
          )}
        </Card>

        <Card title="The run">
          <Facts
            items={[
              { label: "When", value: formatUtc(run.createdAt) },
              { label: "Stage at run", value: <RolloutBadge stage={run.rollout} /> },
              { label: "Overall action", value: ACTION_LABEL[run.overallAction] },
              { label: "Channel", value: run.channel },
              { label: "Model", value: <span className="font-mono text-xs">{run.modelResolved ?? run.modelRequested}</span> },
              {
                label: "Run",
                value: (
                  <Link href={`/runs/${run.id}`} className="underline underline-offset-2">
                    Open the run
                  </Link>
                ),
              },
            ]}
          />
          <div className="mt-5">
            <DecisionsTable decisions={run.decisions} answers={run.answers} highlight={item.decisionId} />
          </div>
        </Card>
      </div>
    </>
  );
}
