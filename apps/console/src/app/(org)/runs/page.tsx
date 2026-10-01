import Link from "next/link";

import { FilterForm, optionsOf } from "~/components/observe/filter-form";
import { hasFilters, hrefWith, param, RANGES, runListInput, type SearchParams } from "~/components/observe/filters";
import { ACTION_LABEL, formatLatency, formatUsd, formatWhen, SOURCE_LABEL, STATUS_LABEL } from "~/components/observe/format";
import { loadSets, SetLabel, setOptions } from "~/components/observe/sets";
import { OperationFailed } from "~/components/shell/coming-soon";
import { Badge, BandBadge, buttonClasses, EmptyState, PageHeader, RolloutBadge, Table, Td, Th } from "~/components/ui";
import { consoleOperation } from "~/server/console-operation";
import type { RunSummary } from "~/server/operations/views";

const FILTER_KEYS = ["set", "channel", "status", "source", "band", "action"] as const;

export default async function RunsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const now = new Date();
  const [sets, res] = await Promise.all([loadSets(), consoleOperation("run.list", runListInput(sp, now))]);

  const fields = [
    { name: "range", label: "Time", options: [...RANGES.map((r) => ({ value: r.value, label: r.label })), { value: "all", label: "All time" }], fallback: "7d" },
    { name: "set", label: "Set", options: [{ value: "", label: "Any set" }, ...setOptions(sets)] },
    { name: "channel", label: "Channel", options: optionsOf("Any channel", { production: "Production", staging: "Staging", pinned: "Pinned version", draft: "Draft" }) },
    { name: "status", label: "Status", options: optionsOf("Any status", STATUS_LABEL) },
    { name: "source", label: "Source", options: optionsOf("Any source", SOURCE_LABEL) },
    { name: "band", label: "Run band", options: optionsOf("Any band", { high: "High", medium: "Medium", low: "Low" }) },
  ];

  let body;
  if (res.status === "error") {
    body = <OperationFailed message={res.message} />;
  } else if (res.status === "not-built") {
    body = <OperationFailed message="Runs are not served yet." />;
  } else {
    const page = res.output as { data: RunSummary[]; nextCursor: string | null };
    body =
      page.data.length === 0 ? (
        hasFilters(sp, FILTER_KEYS) ? (
          <EmptyState title="No runs match these filters" action={<Link href="/runs" className={buttonClasses("secondary", "sm")}>Clear filters</Link>}>
            Try a longer time range or fewer filters.
          </EmptyState>
        ) : (
          <EmptyState title="No runs in this time range">
            Runs show up here once a hook or an app calls a set on app.bandwise.dev with a Bandwise token. With <code className="font-mono text-xs">BANDWISE_TOKEN</code> set,
            the next hook call lands here.
          </EmptyState>
        )
      ) : (
        <>
          <Table caption="Runs, newest first">
            <thead>
              <tr>
                <Th>When</Th>
                <Th>Set</Th>
                <Th>Stage at run</Th>
                <Th>Band</Th>
                <Th>Action</Th>
                <Th>Status</Th>
                <Th className="text-right">Cost</Th>
                <Th className="text-right">Saved</Th>
                <Th className="text-right">Latency</Th>
              </tr>
            </thead>
            <tbody>
              {page.data.map((r) => (
                <tr key={r.id} className="hover:bg-paper-sunk">
                  <Td className="whitespace-nowrap">
                    <Link href={`/runs/${r.id}`} className="text-ink underline underline-offset-2" title={r.createdAt}>
                      {formatWhen(r.createdAt, now)}
                    </Link>
                    <span className="ml-2 text-xs text-ink-3">{SOURCE_LABEL[r.source]}</span>
                  </Td>
                  <Td>
                    <SetLabel sets={sets} setId={r.setId} compact />
                    <span className="ml-1 text-xs text-ink-3">{r.channel}</span>
                  </Td>
                  <Td>
                    <RolloutBadge stage={r.rollout} />
                  </Td>
                  <Td>
                    <BandBadge band={r.runBand} />
                  </Td>
                  <Td className="whitespace-nowrap">{ACTION_LABEL[r.overallAction]}</Td>
                  <Td>{r.status === "ok" ? <Badge tone="good">OK</Badge> : <Badge tone="danger">{STATUS_LABEL[r.status]}</Badge>}</Td>
                  <Td numeric>{formatUsd(r.systemOneCostMicroUsd)}</Td>
                  <Td numeric>{formatUsd(r.savingsMicroUsd)}</Td>
                  <Td numeric>{formatLatency(r.latencyMs)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
          <div className="mt-4 flex items-center justify-between text-sm text-ink-3">
            <span>
              {page.data.length} {page.data.length === 1 ? "run" : "runs"} on this page
            </span>
            {param(sp, "cursor") === undefined ? null : (
              <Link href={hrefWith("/runs", sp, {})} className={buttonClasses("ghost", "sm")}>
                Back to newest
              </Link>
            )}
            {page.nextCursor === null ? null : (
              <Link href={hrefWith("/runs", sp, { cursor: page.nextCursor })} className={buttonClasses("secondary", "sm")}>
                Older runs
              </Link>
            )}
          </div>
        </>
      );
  }

  return (
    <>
      <PageHeader
        title="Runs"
        description="Every run of every set: the band, the action it allowed, what it cost and what it saved. Open a run for its decisions and answers."
      />
      <FilterForm action="/runs" fields={fields} sp={sp} clearHref="/runs" />
      {body}
    </>
  );
}
