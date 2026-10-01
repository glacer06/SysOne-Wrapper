import Link from "next/link";

import { Facts, JsonBlock, Stat } from "~/components/observe/bits";
import { DecisionsTable } from "~/components/observe/decisions";
import { ACTION_LABEL, formatCount, formatLatency, formatUsd, formatUtc, REASON_LABEL, REVIEW_STATUS_LABEL, SOURCE_LABEL, STATUS_LABEL } from "~/components/format";
import { loadSets, SetLabel } from "~/components/observe/sets";
import { OperationFailed } from "~/components/shell/operation-failed";
import { Badge, BandBadge, Card, InlineAlert, PageHeader, RolloutBadge, Table, Td, Th } from "~/components/ui";
import { consoleOperation } from "~/server/console-operation";
import type { RunDetail } from "~/server/operations/views";

export default async function RunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [sets, res] = await Promise.all([loadSets(), consoleOperation("run.get", { id })]);
  const crumbs = [{ href: "/runs", label: "Runs" }];
  if (res.status !== "ok") {
    return (
      <>
        <PageHeader crumbs={crumbs} title="Run" />
        <OperationFailed message={res.status === "error" ? res.message : "Runs are not served yet."} />
      </>
    );
  }
  const run = res.output as RunDetail;
  const calls = run.stages.reduce((n, s) => n + s.calls.length, 0);

  return (
    <>
      <PageHeader crumbs={crumbs} title="Run" description={<span className="font-mono text-xs">{run.id}</span>} />

      {run.status === "ok" ? null : (
        <InlineAlert kind="error" title={`This run ended with ${STATUS_LABEL[run.status].toLowerCase()}`} className="mb-4">
          {run.errorCode === null ? "No error code was recorded." : <span className="font-mono text-xs">{run.errorCode}</span>}
        </InlineAlert>
      )}
      {run.warnings.length === 0 ? null : (
        <InlineAlert kind="info" title="Warnings" className="mb-4">
          <ul className="list-disc pl-5">
            {run.warnings.map((w, i) => (
              <li key={`${i}-${w}`}>{w}</li>
            ))}
          </ul>
        </InlineAlert>
      )}

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="System One cost" value={formatUsd(run.systemOneCostMicroUsd)} hint={`${formatCount(run.inputTokens)} in, ${formatCount(run.outputTokens)} out, ${calls} ${calls === 1 ? "call" : "calls"}`} />
        <Stat label="Same decisions on an LLM" value={formatUsd(run.counterfactualMicroUsd)} hint="The estimate this run is compared with" />
        <Stat label="Saved" value={formatUsd(run.savingsMicroUsd)} emphasis />
      </div>

      <div className="flex flex-col gap-6">
        <Card title="Summary">
          <Facts
            items={[
              { label: "Set", value: <SetLabel sets={sets} setId={run.setId} /> },
              { label: "When", value: formatUtc(run.createdAt) },
              { label: "Channel", value: run.channel },
              { label: "Stage at run", value: <RolloutBadge stage={run.rollout} /> },
              { label: "Run band", value: <BandBadge band={run.runBand} /> },
              { label: "Overall action", value: ACTION_LABEL[run.overallAction] },
              { label: "Route", value: run.route ?? "None" },
              { label: "Source", value: SOURCE_LABEL[run.source] },
              { label: "Latency", value: formatLatency(run.latencyMs) },
              { label: "Model asked for", value: <span className="font-mono text-xs">{run.modelRequested}</span> },
              { label: "Model that answered", value: <span className="font-mono text-xs">{run.modelResolved ?? "Unknown"}</span> },
            ]}
          />
        </Card>

        <Card title="Decisions" description="The policy action is what the thresholds say. The allowed action is what the rollout stage let callers do.">
          <DecisionsTable decisions={run.decisions} answers={run.answers} />
        </Card>

        {run.reviewItems.length === 0 ? null : (
          <Card title="Review items">
            <Table caption="Review items from this run">
              <thead>
                <tr>
                  <Th>Decision</Th>
                  <Th>Why</Th>
                  <Th>Band</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {run.reviewItems.map((i) => (
                  <tr key={i.id}>
                    <Td className="font-mono text-xs">
                      <Link href={`/review/${i.id}?run=${run.id}`} className="underline underline-offset-2">
                        {i.decisionId}
                      </Link>
                    </Td>
                    <Td>{REASON_LABEL[i.reason]}</Td>
                    <Td>
                      <BandBadge band={i.band} />
                    </Td>
                    <Td>
                      <Badge tone={i.status === "open" || i.status === "pending_confirmation" ? "info" : "neutral"}>{REVIEW_STATUS_LABEL[i.status]}</Badge>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
        )}

        <Card title="Stages">
          <Table caption="Stages and their System One calls">
            <thead>
              <tr>
                <Th>Stage</Th>
                <Th className="text-right">Calls</Th>
                <Th className="text-right">Tokens in</Th>
                <Th className="text-right">Tokens out</Th>
                <Th className="text-right">Latency</Th>
              </tr>
            </thead>
            <tbody>
              {run.stages.map((s) => (
                <tr key={s.id}>
                  <Td className="font-mono text-xs">
                    {s.id}
                    {s.skipped ? <span className="ml-2 font-sans text-ink-3">skipped</span> : null}
                  </Td>
                  <Td numeric>{s.calls.length}</Td>
                  <Td numeric>{formatCount(s.calls.reduce((n, c) => n + c.inputTokens, 0))}</Td>
                  <Td numeric>{formatCount(s.calls.reduce((n, c) => n + c.outputTokens, 0))}</Td>
                  <Td numeric>{formatLatency(Math.max(0, ...s.calls.map((c) => c.latencyMs)))}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
          {Object.keys(run.checks).length === 0 ? null : (
            <p className="mt-3 text-sm text-ink-2">
              Checks:{" "}
              {Object.entries(run.checks).map(([k, v]) => (
                <span key={k} className="mr-3 font-mono text-xs">
                  {k} {v ? "passed" : "failed"}
                </span>
              ))}
            </p>
          )}
        </Card>

        <Card title="State" description="The input the run decided on.">
          {run.state === null ? (
            <p className="text-sm text-ink-2">Not stored. This set keeps a hash of the state only, or the state has passed its retention.</p>
          ) : (
            <JsonBlock value={run.state} label="Run state" />
          )}
        </Card>

        {run.answers === null ? null : (
          <details className="rounded-md border border-rule bg-paper-raised px-5 py-4">
            <summary className="cursor-pointer text-sm font-medium text-ink">Raw answers from System One</summary>
            <div className="mt-3">
              <JsonBlock value={run.answers} label="Raw answers" />
            </div>
          </details>
        )}
      </div>
    </>
  );
}
