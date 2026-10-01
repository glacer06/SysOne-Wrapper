import Link from "next/link";

import { DailyBars } from "~/components/observe/bar-chart";
import { Stat } from "~/components/observe/bits";
import { fillDays } from "~/components/observe/chart";
import { FilterForm } from "~/components/observe/filter-form";
import { hrefWith, param, rangeOf, rangeStart, type SearchParams } from "~/components/observe/filters";
import { formatCount, formatShare, formatUsd } from "~/components/observe/format";
import { loadSets, SetLabel, setOptions } from "~/components/observe/sets";
import { OperationFailed } from "~/components/shell/coming-soon";
import { Card, cx, EmptyState, PageHeader, Table, Td, Th } from "~/components/ui";
import { consoleOperation } from "~/server/console-operation";
import type { UsageDay, UsageView } from "~/server/operations/views";

const RANGES = [
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
] as const;

const METRICS = {
  savings: { label: "Estimated savings", pick: (d: UsageDay) => d.savingsMicroUsd, money: true },
  spend: { label: "System One spend", pick: (d: UsageDay) => d.systemOneCostMicroUsd, money: true },
  runs: { label: "Runs", pick: (d: UsageDay) => d.runs, money: false },
} as const;

type Metric = keyof typeof METRICS;

export default async function SavingsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const now = new Date();
  const range = rangeOf(sp, "7d");
  const from = rangeStart(RANGES.some((r) => r.value === range) ? range : "7d", now) ?? now;
  const set = param(sp, "set");
  const metricParam = param(sp, "metric");
  const metric: Metric = metricParam === "spend" || metricParam === "runs" ? metricParam : "savings";
  const input = { from: from.toISOString(), to: now.toISOString(), ...(set === undefined ? {} : { set }) };
  const [sets, res] = await Promise.all([loadSets(), consoleOperation("usage.get", input)]);

  const header = (
    <>
      <PageHeader
        title="Savings"
        description="What System One cost, and an estimate of what the same decisions would have cost on an LLM, per set and per day."
      />
      <FilterForm
        action="/savings"
        sp={sp}
        clearHref="/savings"
        keep={["metric"]}
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
  const t = usage.totals;

  if (t.runs === 0) {
    return (
      <>
        {header}
        <EmptyState title="Nothing to count in this range">
          Savings add up from hosted runs. The first run of a set starts its count. Local runs from <code className="font-mono text-xs">bandwise run --live</code> stay in your
          receipts; see them with <code className="font-mono text-xs">pnpm bandwise report --since 7d</code>.
        </EmptyState>
      </>
    );
  }

  const m = METRICS[metric];
  const fmt = (v: number) => (m.money ? formatUsd(v) : formatCount(v));
  const days = fillDays(new Date(usage.from), new Date(usage.to), usage.days.map((d) => ({ day: d.day, value: m.pick(d) })));

  return (
    <>
      {header}
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Estimated savings" value={formatUsd(t.savingsMicroUsd)} hint={`Against ${formatUsd(t.counterfactualMicroUsd)} on an LLM`} emphasis />
        <Stat label="System One spend" value={formatUsd(t.systemOneCostMicroUsd)} hint={`${formatCount(t.inputTokens)} tokens in, ${formatCount(t.outputTokens)} out`} />
        <Stat label="LLM calls avoided" value={formatCount(t.llmCallsAvoided)} />
        <Stat label="Runs" value={formatCount(t.runs)} hint={`${formatShare(t.bandHigh, t.runs)} high band, ${formatCount(t.errors)} ${t.errors === 1 ? "error" : "errors"}`} />
      </div>

      <div className="flex flex-col gap-6">
        <Card
          title={`${m.label} per day`}
          description="Days are UTC."
          actions={
            <nav aria-label="Chart metric" className="flex gap-1">
              {(Object.keys(METRICS) as Metric[]).map((k) => (
                <Link
                  key={k}
                  href={hrefWith("/savings", sp, { metric: k === "savings" ? undefined : k })}
                  aria-current={k === metric ? "true" : undefined}
                  className={cx("rounded-sm px-2.5 py-1 text-sm", k === metric ? "bg-paper-sunk font-medium text-ink" : "text-ink-2 hover:bg-paper-sunk")}
                >
                  {METRICS[k].label}
                </Link>
              ))}
            </nav>
          }
        >
          <DailyBars days={days} label={`${m.label} per day`} format={fmt} />
          <details className="mt-4">
            <summary className="cursor-pointer text-sm text-ink-2">Show the numbers by day</summary>
            <div className="mt-3">
              <Table caption="Totals per day">
                <thead>
                  <tr>
                    <Th>Day</Th>
                    <Th className="text-right">Runs</Th>
                    <Th className="text-right">System One spend</Th>
                    <Th className="text-right">Estimated savings</Th>
                    <Th className="text-right">LLM calls avoided</Th>
                  </tr>
                </thead>
                <tbody>
                  {usage.days.map((d) => (
                    <tr key={d.day}>
                      <Td className="font-mono text-xs">{d.day}</Td>
                      <Td numeric>{formatCount(d.runs)}</Td>
                      <Td numeric>{formatUsd(d.systemOneCostMicroUsd)}</Td>
                      <Td numeric>{formatUsd(d.savingsMicroUsd)}</Td>
                      <Td numeric>{formatCount(d.llmCallsAvoided)}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          </details>
        </Card>

        <Card title="Per set" description="Open a set's runs to see each decision.">
          <Table caption="Totals per set">
            <thead>
              <tr>
                <Th>Set</Th>
                <Th className="text-right">Runs</Th>
                <Th className="text-right">High / medium / low</Th>
                <Th className="text-right">Errors</Th>
                <Th className="text-right">System One spend</Th>
                <Th className="text-right">LLM estimate</Th>
                <Th className="text-right">Estimated savings</Th>
                <Th className="text-right">LLM calls avoided</Th>
              </tr>
            </thead>
            <tbody>
              {usage.sets.map((s) => (
                <tr key={s.setId}>
                  <Td>
                    <SetLabel sets={sets} setId={s.setId} compact />
                    <Link href={`/runs?set=${encodeURIComponent(s.slug)}&range=${range === "all" ? "all" : range}`} className="ml-2 text-xs text-ink-2 underline underline-offset-2">
                      Runs
                    </Link>
                  </Td>
                  <Td numeric>{formatCount(s.runs)}</Td>
                  <Td numeric>
                    {formatShare(s.bandHigh, s.runs)} / {formatShare(s.bandMedium, s.runs)} / {formatShare(s.bandLow, s.runs)}
                  </Td>
                  <Td numeric>{formatCount(s.errors)}</Td>
                  <Td numeric>{formatUsd(s.systemOneCostMicroUsd)}</Td>
                  <Td numeric>{formatUsd(s.counterfactualMicroUsd)}</Td>
                  <Td numeric>{formatUsd(s.savingsMicroUsd)}</Td>
                  <Td numeric>{formatCount(s.llmCallsAvoided)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
          <p className="mt-3 text-xs text-ink-3">
            Savings are an estimate: each run is compared with the cost of asking an LLM the same questions.
          </p>
        </Card>
      </div>
    </>
  );
}
