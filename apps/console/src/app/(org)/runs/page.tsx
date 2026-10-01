import Link from "next/link";

import { FilterForm, optionsOf } from "~/components/observe/filter-form";
import { hasFilters, hrefWith, param, RANGES, runListInput, type SearchParams } from "~/components/observe/filters";
import { SOURCE_LABEL, STATUS_LABEL } from "~/components/format";
import { decisionsOf } from "~/components/observe/decisions";
import { mapLimit } from "~/components/observe/map-limit";
import { decidingMarker, runRulers } from "~/components/observe/ruler-math";
import { loadSets, setOptions } from "~/components/observe/sets";
import { loadSpecs } from "~/components/observe/specs";
import { OperationFailed } from "~/components/shell/operation-failed";
import { buttonClasses, EmptyState, PageHeader } from "~/components/ui";
import { consoleOperation } from "~/server/console-operation";
import type { RunDetail, RunSummary } from "~/server/operations/views";

import { type RowRuler, RunsTable } from "./runs-table";

const FILTER_KEYS = ["set", "channel", "status", "source", "band", "action"] as const;

/**
 * Each row's tiny ruler: the decision that set the run band, at the lines of the version it ran on.
 * run.list carries no scores, so each row reads its run through run.get (the same operation the
 * detail page uses), a few at a time.
 */
async function rowRulers(runs: readonly RunSummary[], sets: Awaited<ReturnType<typeof loadSets>>): Promise<RowRuler[]> {
  const [details, specs] = await Promise.all([
    mapLimit(runs, 8, async (r) => {
      const got = await consoleOperation("run.get", { id: r.id });
      return got.status === "ok" ? (got.output as RunDetail) : null;
    }),
    loadSpecs(runs, sets),
  ]);
  return runs.map((r, i) => {
    const d = details[i];
    const spec = specs.get(r.versionId);
    if (d === null || d === undefined || spec === undefined) return null;
    return decidingMarker(runRulers(spec.spec, decisionsOf(d.decisions), d.answers, d.runBand));
  });
}

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
  } else if (res.status !== "ok") {
    body = <OperationFailed message="Runs are not served yet." />;
  } else {
    const page = res.output as { data: RunSummary[]; nextCursor: string | null };
    const rulers = await rowRulers(page.data, sets);
    body =
      page.data.length === 0 ? (
        hasFilters(sp, FILTER_KEYS) ? (
          <EmptyState title="No runs match these filters" action={<Link href="/runs" className={buttonClasses("secondary", "sm")}>Clear filters</Link>}>
            Try a longer time range or fewer filters.
          </EmptyState>
        ) : (
          <EmptyState mark title="No runs in this time range">
            Runs show up here once a hook or an app calls a set on app.bandwise.dev with a Bandwise token. With <code className="font-mono text-xs">BANDWISE_TOKEN</code> set,
            the next hook call lands here.
          </EmptyState>
        )
      ) : (
        <>
          <RunsTable runs={page.data} rulers={rulers} sets={sets} now={now} />
          <div className="mt-4 flex items-center justify-between text-sm text-bw-text-muted">
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
        description="Every run of every set. Each row draws the decision that set its band on that set's own lines. Open a run for every decision, what it cost and what it saved."
      />
      <FilterForm action="/runs" fields={fields} sp={sp} clearHref="/runs" />
      {body}
    </>
  );
}
