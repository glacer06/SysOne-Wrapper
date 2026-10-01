import Link from "next/link";

import { FilterForm, optionsOf } from "~/components/observe/filter-form";
import { hasFilters, hrefWith, param, reviewListInput, type SearchParams } from "~/components/observe/filters";
import { mapLimit } from "~/components/observe/map-limit";
import { loadSets, setOptions } from "~/components/observe/sets";
import { loadSpecs } from "~/components/observe/specs";
import { OperationFailed } from "~/components/shell/operation-failed";
import { buttonClasses, cx, EmptyState, InlineAlert, PageHeader } from "~/components/ui";
import { consoleOperation } from "~/server/console-operation";
import type { ReviewItemView, RunDetail } from "~/server/operations/views";

import { ReviewQueue } from "./queue";
import { type QueueEntry, queueEntry } from "./queue-data";

const TABS = [
  { value: undefined, label: "Open" },
  { value: "pending_confirmation", label: "Agent answered" },
  { value: "resolved", label: "Resolved" },
  { value: "dismissed", label: "Dismissed" },
  { value: "any", label: "All" },
] as const;

const DONE: Record<string, string> = {
  resolved: "Saved. The answer is now a labeled decision for this set.",
  dismissed: "Dismissed. The item left the queue.",
  confirmed: "Confirmed. The agent's answer now counts.",
};

/**
 * Every item on the page with its run and the lines of the version it ran on, so the pane moves
 * between items without a request. review.list carries no scores or state, so each run is read
 * through run.get, once per run and a few at a time.
 */
async function entriesOf(items: readonly ReviewItemView[], sets: Awaited<ReturnType<typeof loadSets>>, now: Date): Promise<QueueEntry[]> {
  const runIds = [...new Set(items.flatMap((i) => (i.runId === null ? [] : [i.runId])))];
  const runs = await mapLimit(runIds, 8, async (id) => {
    const got = await consoleOperation("run.get", { id });
    return got.status === "ok" ? (got.output as RunDetail) : null;
  });
  const byId = new Map(runs.flatMap((r) => (r === null ? [] : [[r.id, r] as const])));
  const specs = await loadSpecs([...byId.values()], sets);
  return items.map((i) => {
    const run = i.runId === null ? null : (byId.get(i.runId) ?? null);
    const spec = run === null ? null : (specs.get(run.versionId)?.spec ?? null);
    return queueEntry(i, run, spec, sets.get(i.setId)?.slug ?? i.setId.slice(0, 8), now);
  });
}

export default async function ReviewPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const now = new Date();
  const [sets, res] = await Promise.all([loadSets(), consoleOperation("review.list", reviewListInput(sp))]);
  const status = param(sp, "status");
  const done = DONE[param(sp, "done") ?? ""];

  let body;
  if (res.status !== "ok") {
    body = <OperationFailed message={res.status === "error" ? res.message : "The review queue is not served yet."} />;
  } else {
    const page = res.output as { data: ReviewItemView[]; nextCursor: string | null };
    if (page.data.length === 0) {
      body = hasFilters(sp, ["kind", "band", "set"]) ? (
        <EmptyState title="No items match these filters" action={<Link href={hrefWith("/review", sp, { kind: undefined, band: undefined, set: undefined })} className={buttonClasses("secondary", "sm")}>Clear filters</Link>} />
      ) : status === undefined ? (
        <EmptyState mark title="Nothing to review">
          Decisions land here when a set&apos;s policy sends a medium or low band to review, or when an audit samples one. In shadow the policy never sends a
          decision to review, so the queue starts once a set moves to controlled.
        </EmptyState>
      ) : (
        <EmptyState title="No items with this status" />
      );
    } else {
      const entries = await entriesOf(page.data, sets, now);
      const asked = param(sp, "item");
      const initial = entries.some((e) => e.id === asked) ? (asked ?? null) : (entries[0]?.id ?? null);
      body = (
        <>
          <ReviewQueue entries={entries} initialId={initial} startOpen={asked !== undefined && initial === asked} />
          <div className="mt-4 flex justify-end gap-2">
            {param(sp, "cursor") === undefined ? null : (
              <Link href={hrefWith("/review", sp, {})} className={buttonClasses("ghost", "sm")}>
                Back to newest
              </Link>
            )}
            {page.nextCursor === null ? null : (
              <Link href={hrefWith("/review", sp, { cursor: page.nextCursor })} className={buttonClasses("secondary", "sm")}>
                Older items
              </Link>
            )}
          </div>
        </>
      );
    }
  }

  return (
    <>
      <PageHeader
        title="Review"
        description="Decisions waiting for a person, and audit samples. Each answer you give becomes a labeled decision the set is measured against."
      />
      {done === undefined ? null : (
        <InlineAlert kind="success" className="mb-4">
          {done}
        </InlineAlert>
      )}
      <nav aria-label="Review status" className="mb-4 flex flex-wrap gap-x-5 border-b border-bw-border">
        {TABS.map((t) => {
          const current = status === t.value || (t.value === undefined && status === undefined);
          return (
            <Link
              key={t.label}
              href={hrefWith("/review", sp, { status: t.value, done: undefined, item: undefined })}
              aria-current={current ? "page" : undefined}
              className={cx("-mb-px border-b-2 px-0.5 py-3 text-sm transition-colors duration-(--bw-dur-fast)", current ? "border-bw-brand font-medium text-bw-text" : "border-transparent text-bw-text-muted hover:text-bw-text")}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>
      <FilterForm
        action="/review"
        sp={sp}
        keep={["status"]}
        clearHref={hrefWith("/review", sp, { kind: undefined, band: undefined, set: undefined, done: undefined })}
        fields={[
          { name: "set", label: "Set", options: [{ value: "", label: "Any set" }, ...setOptions(sets)] },
          { name: "band", label: "Band", options: optionsOf("Any band", { medium: "Medium", low: "Low", high: "High" }) },
          { name: "kind", label: "Kind", options: optionsOf("Any kind", { action: "Policy sent to review", label: "Labeling sample" }) },
        ]}
      />
      {body}
    </>
  );
}
