// RUNS-C, "Ruler first": the run opens on a full-width ruler at the set's own lines, with the
// decision card under it. Presentational, so the page only loads data.

import Link from "next/link";

import { Facts, JsonBlock } from "~/components/observe/bits";
import { decisionsOf, DecisionsTable } from "~/components/observe/decisions";
import { decidingMarker, runRulers } from "~/components/observe/ruler-math";
import { RunRuler } from "~/components/observe/run-ruler";
import { SetLabel, type SetDirectory } from "~/components/observe/sets";
import type { RunSpec } from "~/components/observe/specs";
import { ACTION_LABEL, bandCountLine, formatCount, formatLatency, formatUsd, formatUtc, REASON_LABEL, REVIEW_STATUS_LABEL, runStateLine, SOURCE_LABEL, STATUS_LABEL } from "~/components/format";
import { Badge, BandBadge, Card, DecisionCard, InlineAlert, PageHeader, RolloutBadge, Table, Td, Th } from "~/components/ui";
import type { RunDetail } from "~/server/operations/views";

export function RunDetailView({ run, sets, spec }: { run: RunDetail; sets: SetDirectory; spec: RunSpec | null }) {
  const calls = run.stages.reduce((n, s) => n + s.calls.length, 0);
  const decisions = decisionsOf(run.decisions);
  const rulers = spec === null ? null : runRulers(spec.spec, decisions, run.answers, run.runBand);
  const deciding = rulers === null ? null : decidingMarker(rulers);
  const slug = sets.get(run.setId)?.slug;
  const bands = bandCountLine(decisions.map(([, d]) => d.band));

  return (
    <>
      <PageHeader
        crumbs={[{ href: "/runs", label: "Runs" }]}
        title="Run"
        description={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-mono text-xs break-all">{run.id}</span>
            <span>{formatUtc(run.createdAt)}</span>
          </span>
        }
      />

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

      <section aria-labelledby="ruler-title" className="mb-6 border-y border-bw-border py-5">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 id="ruler-title" className="bw-label">
            Run band at this set&apos;s lines
          </h2>
          <p className="font-mono text-xs text-bw-text-muted">
            {slug ?? run.setId.slice(0, 8)}
            {spec === null ? null : ` v${spec.version}`}, {run.channel}
          </p>
        </div>
        {rulers === null ? (
          <p className="text-sm text-bw-text-muted">The ruler needs the spec of the version this run used, and it could not be read. The bands below come from the run itself.</p>
        ) : rulers.groups.length === 0 ? (
          <p className="text-sm text-bw-text-muted">No counted decision has a score to place on a ruler.</p>
        ) : (
          <div className="flex flex-col gap-8">
            {rulers.groups.map((g, i) => (
              <RunRuler key={g.key} group={g} walk={i === 0} {...(rulers.groups.length > 1 ? { title: `${g.axis}: ${g.markers.map((m) => m.id).join(", ")}` } : {})} />
            ))}
          </div>
        )}
        {rulers === null || rulers.unplaced.length === 0 ? null : (
          <p className="mt-4 text-xs text-bw-text-muted">
            Not on the ruler:{" "}
            {rulers.unplaced.map((u, i) => (
              <span key={u.id}>
                {i === 0 ? null : "; "}
                <span className="font-mono">{u.id}</span>, {u.why}
              </span>
            ))}
            .
          </p>
        )}
      </section>

      <DecisionCard
        className="mb-6"
        state={runStateLine(run.overallAction, run.rollout)}
        band={run.runBand}
        score={deciding?.marker.band === run.runBand ? deciding.marker.at : null}
        bandNote={deciding?.marker.band === run.runBand ? `Run band, set by ${deciding.marker.id}` : "Run band: the lowest among the counted decisions"}
        why={run.route === null ? bands : <>Route <span className="font-mono">{run.route}</span>. {bands}</>}
        cost={
          <>
            {formatUsd(run.systemOneCostMicroUsd)} on System One, saved {formatUsd(run.savingsMicroUsd)} against {formatUsd(run.counterfactualMicroUsd)} on an LLM
            <span className="mt-1 block font-sans text-xs text-bw-text-muted">
              {formatCount(run.inputTokens)} tokens in, {formatCount(run.outputTokens)} out, {calls} {calls === 1 ? "call" : "calls"}
            </span>
          </>
        }
      />

      <div className="flex flex-col gap-6">
        <Card title="Decisions" description="The policy action is what the thresholds say. The allowed action is what the rollout stage let callers do.">
          <DecisionsTable decisions={run.decisions} answers={run.answers} />
        </Card>

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
                      <Link href={`/review/${i.id}?run=${run.id}`} data-row-link="" className="underline underline-offset-2">
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
                    {s.skipped ? <span className="ml-2 font-sans text-bw-text-muted">skipped</span> : null}
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
            <p className="mt-3 text-sm text-bw-text-muted">
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
            <p className="text-sm text-bw-text-muted">Not stored. This set keeps a hash of the state only, or the state has passed its retention.</p>
          ) : (
            <JsonBlock value={run.state} label="Run state" />
          )}
        </Card>

        {run.answers === null ? null : (
          <details className="rounded-md border border-bw-border bg-bw-surface px-5 py-4">
            <summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium text-bw-text">Raw answers from System One</summary>
            <div className="mt-3">
              <JsonBlock value={run.answers} label="Raw answers" />
            </div>
          </details>
        )}
      </div>
    </>
  );
}
