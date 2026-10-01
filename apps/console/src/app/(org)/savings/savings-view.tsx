// SAVE-A, "The gap": one display number for the period, marked estimated, with a link to how it is
// computed; one mono line with the spend and what the LLM would have cost; paired bars per day; the
// per-set table below. Every figure comes from usage.get.

import Link from "next/link";

import { PairedDailyBars } from "~/components/observe/bar-chart";
import { fillDays, type PairDay } from "~/components/observe/chart";
import { SetLabel, type SetDirectory } from "~/components/observe/sets";
import { formatCount, formatShare, formatUsd } from "~/components/format";
import { Table, Td, Th } from "~/components/ui";
import type { UsageView } from "~/server/operations/views";

export const SAVINGS_DOC = "https://docs.bandwise.dev/docs/concepts/cost-and-savings";

/** Every UTC day of the range with both series, zero on days without runs. */
export function pairDays(usage: UsageView): PairDay[] {
  const from = new Date(usage.from);
  const to = new Date(usage.to);
  const spend = fillDays(from, to, usage.days.map((d) => ({ day: d.day, value: d.systemOneCostMicroUsd })));
  const llm = new Map(fillDays(from, to, usage.days.map((d) => ({ day: d.day, value: d.counterfactualMicroUsd }))).map((d) => [d.day, d.value]));
  return spend.map((d) => ({ day: d.day, spend: d.value, llm: llm.get(d.day) ?? 0 }));
}

/**
 * The part of the LLM estimate that is not counted as saved: escalation spend, and runs whose
 * savings are suppressed (shadow, staging, eval, experiments, outages). Zero when the gap is the
 * saving.
 */
export function uncounted(t: UsageView["totals"]): number {
  return Math.max(0, t.counterfactualMicroUsd - t.systemOneCostMicroUsd - t.savingsMicroUsd);
}

export function SavingsView({ usage, sets, rangeLabel, rangeParam }: { usage: UsageView; sets: SetDirectory; rangeLabel: string; rangeParam: string }) {
  const t = usage.totals;
  const rest = uncounted(t);
  return (
    <div className="flex flex-col gap-10">
      <section aria-labelledby="saved-label">
        <p id="saved-label" className="bw-label">
          Saved, {rangeLabel.toLowerCase()} · estimated
        </p>
        <div className="mt-2 flex flex-wrap items-baseline gap-x-6 gap-y-2">
          <p className="bw-display text-[2.75rem] leading-[1.04] tabular-nums text-bw-text sm:text-[3.5rem] lg:text-[4rem]">{formatUsd(t.savingsMicroUsd)}</p>
          <a href={SAVINGS_DOC} className="inline-flex min-h-11 items-center text-sm text-bw-brand-text underline underline-offset-2">
            How this is computed
          </a>
        </div>
        <p className="mt-3 max-w-[68ch] font-mono text-sm leading-6 text-bw-text">
          Spent {formatUsd(t.systemOneCostMicroUsd)} on System One across {formatCount(t.runs)} {t.runs === 1 ? "run" : "runs"}. The same calls on the LLM would have cost about{" "}
          {formatUsd(t.counterfactualMicroUsd)}.
        </p>
        {rest > 0 ? (
          <p className="mt-2 max-w-[68ch] text-xs leading-5 text-bw-text-muted">
            {formatUsd(rest)} of that gap is not counted as saved: escalations to an LLM spend it, and runs in shadow, staging, evals or experiments save nothing.
          </p>
        ) : null}
      </section>

      <section aria-labelledby="gap-title" className="border-t border-bw-border pt-6">
        <h2 id="gap-title" className="mb-1 text-base font-semibold text-bw-text">
          Spend and the LLM estimate, per day
        </h2>
        <p className="mb-4 text-sm text-bw-text-muted">Days are UTC. The gap between each pair is what the day did not spend.</p>
        <PairedDailyBars days={pairDays(usage)} label="System One spend and the LLM estimate per day" format={formatUsd} />
        <details className="mt-4">
          <summary className="inline-flex min-h-11 cursor-pointer items-center text-sm text-bw-text-muted">Show the numbers by day</summary>
          <div className="mt-3">
            <Table caption="Totals per day">
              <thead>
                <tr>
                  <Th>Day</Th>
                  <Th className="text-right">Runs</Th>
                  <Th className="text-right">System One spend</Th>
                  <Th className="text-right">LLM estimate</Th>
                  <Th className="text-right">Saved</Th>
                  <Th className="text-right">LLM calls avoided</Th>
                </tr>
              </thead>
              <tbody>
                {usage.days.map((d) => (
                  <tr key={d.day}>
                    <Td className="font-mono text-xs">{d.day}</Td>
                    <Td numeric>{formatCount(d.runs)}</Td>
                    <Td numeric>{formatUsd(d.systemOneCostMicroUsd)}</Td>
                    <Td numeric>{formatUsd(d.counterfactualMicroUsd)}</Td>
                    <Td numeric>{formatUsd(d.savingsMicroUsd)}</Td>
                    <Td numeric>{formatCount(d.llmCallsAvoided)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        </details>
      </section>

      <section aria-labelledby="per-set-title" className="border-t border-bw-border pt-6">
        <h2 id="per-set-title" className="mb-4 text-base font-semibold text-bw-text">
          Per set
        </h2>
        <Table caption="Totals per set">
          <thead>
            <tr>
              <Th>Set</Th>
              <Th className="text-right">Runs</Th>
              <Th className="text-right">High / med / low</Th>
              <Th className="text-right">Errors</Th>
              <Th className="text-right">System One spend</Th>
              <Th className="text-right">LLM estimate</Th>
              <Th className="text-right">Saved</Th>
              <Th className="text-right">Share of saved</Th>
            </tr>
          </thead>
          <tbody>
            {usage.sets.map((s) => (
              <tr key={s.setId}>
                <Td className="whitespace-nowrap">
                  <span className="flex flex-col items-start gap-1">
                    <SetLabel sets={sets} setId={s.setId} compact />
                    <Link href={`/runs?set=${encodeURIComponent(s.slug)}&range=${rangeParam}`} className="text-xs text-bw-text-muted underline underline-offset-2">
                      Open its runs
                    </Link>
                  </span>
                </Td>
                <Td numeric>{formatCount(s.runs)}</Td>
                <Td numeric>
                  {formatShare(s.bandHigh, s.runs)} / {formatShare(s.bandMedium, s.runs)} / {formatShare(s.bandLow, s.runs)}
                </Td>
                <Td numeric>{formatCount(s.errors)}</Td>
                <Td numeric>{formatUsd(s.systemOneCostMicroUsd)}</Td>
                <Td numeric>{formatUsd(s.counterfactualMicroUsd)}</Td>
                <Td numeric>{formatUsd(s.savingsMicroUsd)}</Td>
                <Td numeric>{formatShare(s.savingsMicroUsd, t.savingsMicroUsd)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
        <p className="mt-3 text-xs text-bw-text-muted">Saved is an estimate: each run is compared with the cost of asking the comparator LLM the same questions.</p>
      </section>
    </div>
  );
}
