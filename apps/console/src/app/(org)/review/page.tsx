import Link from "next/link";

import { FilterForm, optionsOf } from "~/components/observe/filter-form";
import { hasFilters, hrefWith, param, reviewListInput, type SearchParams } from "~/components/observe/filters";
import { formatValue, formatWhen, REASON_LABEL, REVIEW_STATUS_LABEL } from "~/components/format";
import { loadSets, SetLabel, setOptions } from "~/components/observe/sets";
import { OperationFailed } from "~/components/shell/operation-failed";
import { BandBadge, buttonClasses, cx, EmptyState, InlineAlert, PageHeader, Table, Td, Th } from "~/components/ui";
import { consoleOperation } from "~/server/console-operation";
import type { ReviewItemView } from "~/server/operations/views";

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

function suggestedOf(i: ReviewItemView): string {
  const s = i.suggested;
  return typeof s === "object" && s !== null && !Array.isArray(s) && "value" in s ? formatValue(s["value"]) : formatValue(s);
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
      body = (
        <>
          <Table caption="Review items, newest first">
            <thead>
              <tr>
                <Th>Decision</Th>
                <Th>Set</Th>
                <Th>Run said</Th>
                <Th>Band</Th>
                <Th>Why it is here</Th>
                <Th>Status</Th>
                <Th>When</Th>
              </tr>
            </thead>
            <tbody>
              {page.data.map((i) => (
                <tr key={i.id} className="hover:bg-bw-surface-sunken">
                  <Td className="font-mono text-xs">
                    {i.runId === null ? (
                      i.decisionId
                    ) : (
                      <Link href={`/review/${i.id}?run=${i.runId}`} className="underline underline-offset-2">
                        {i.decisionId}
                      </Link>
                    )}
                  </Td>
                  <Td>
                    <SetLabel sets={sets} setId={i.setId} compact stage={false} />
                  </Td>
                  <Td>{suggestedOf(i)}</Td>
                  <Td>
                    <BandBadge band={i.band} />
                  </Td>
                  <Td className="text-bw-text-muted">{REASON_LABEL[i.reason]}</Td>
                  <Td className="whitespace-nowrap">{REVIEW_STATUS_LABEL[i.status]}</Td>
                  <Td className="whitespace-nowrap text-bw-text-muted">{formatWhen(i.createdAt, now)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
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
        description="Medium and low band decisions waiting for a person, and audit samples. Each answer you give becomes a labeled decision the set is measured against."
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
              href={hrefWith("/review", sp, { status: t.value, done: undefined })}
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
