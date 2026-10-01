import { FilterForm } from "~/components/observe/filter-form";
import { SavingsFirstRun } from "~/components/observe/first-runs";
import { param, rangeOf, rangeStart, type SearchParams } from "~/components/observe/filters";
import { loadSets, setOptions } from "~/components/observe/sets";
import { OperationFailed } from "~/components/shell/operation-failed";
import { PageHeader } from "~/components/ui";
import { consoleOperation } from "~/server/console-operation";
import type { UsageView } from "~/server/operations/views";

import { SavingsView } from "./savings-view";

const RANGES = [
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
] as const;

export default async function SavingsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const now = new Date();
  const asked = rangeOf(sp, "7d");
  const range = RANGES.find((r) => r.value === asked) ?? RANGES[0];
  const from = rangeStart(range.value, now) ?? now;
  const set = param(sp, "set");
  const input = { from: from.toISOString(), to: now.toISOString(), ...(set === undefined ? {} : { set }) };
  const [sets, res] = await Promise.all([loadSets(), consoleOperation("usage.get", input)]);

  const header = (
    <>
      <PageHeader title="Savings" description="What System One cost, and an estimate of what the same decisions would have cost on an LLM, per set and per day." />
      <FilterForm
        action="/savings"
        sp={sp}
        clearHref="/savings"
        fields={[
          { name: "range", label: "Time", options: RANGES, fallback: "7d" },
          { name: "set", label: "Set", options: [{ value: "", label: "All sets" }, ...setOptions(sets)] },
        ]}
      />
    </>
  );

  if (res.status !== "ok") {
    return (
      <>
        {header}
        <OperationFailed message={res.status === "error" ? res.message : "Usage is not served yet."} />
      </>
    );
  }
  const usage = res.output as UsageView;

  if (usage.totals.runs === 0) {
    return (
      <>
        {header}
        <SavingsFirstRun />
      </>
    );
  }

  return (
    <>
      {header}
      <SavingsView usage={usage} sets={sets} rangeLabel={range.label} rangeParam={range.value} />
    </>
  );
}
