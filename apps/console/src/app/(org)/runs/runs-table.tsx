import Link from "next/link";

import { ACTION_LABEL, formatLatency, formatUsd, formatWhen, SOURCE_LABEL, STATUS_LABEL } from "~/components/format";
import type { RulerGroup, RulerMarker } from "~/components/observe/ruler-math";
import { MiniRuler } from "~/components/observe/run-ruler";
import { SetLabel, type SetDirectory } from "~/components/observe/sets";
import { Badge, BandBadge, RolloutBadge, Table, Td, Th } from "~/components/ui";
import type { RunSummary } from "~/server/operations/views";

/** A row's tiny ruler, or null when the run's version or scores could not be read. */
export type RowRuler = { group: RulerGroup; marker: RulerMarker } | null;

/** RUNS-C list: a tiny ruler per row instead of a dot, with the band word and number beside it. */
export function RunsTable({ runs, rulers, sets, now }: { runs: readonly RunSummary[]; rulers: readonly RowRuler[]; sets: SetDirectory; now: Date }) {
  return (
    <Table caption="Runs, newest first">
      <thead>
        <tr>
          <Th>When</Th>
          <Th>Run band</Th>
          <Th>Set</Th>
          <Th>Stage at run</Th>
          <Th>Action</Th>
          <Th>Status</Th>
          <Th className="text-right">Cost</Th>
          <Th className="text-right">Saved</Th>
          <Th className="text-right">Latency</Th>
        </tr>
      </thead>
      <tbody>
        {runs.map((r, i) => {
          const ruler = rulers[i] ?? null;
          return (
            <tr key={r.id} className="hover:bg-bw-surface-sunken">
              <Td className="whitespace-nowrap">
                <Link href={`/runs/${r.id}`} data-row-link="" className="inline-flex min-h-6 items-center text-bw-text underline underline-offset-2" title={r.createdAt}>
                  {formatWhen(r.createdAt, now)}
                </Link>
                <span className="ml-2 text-xs text-bw-text-muted">{SOURCE_LABEL[r.source]}</span>
              </Td>
              <Td className="whitespace-nowrap">
                <span className="flex items-center gap-3">
                  {ruler === null ? null : <MiniRuler group={ruler.group} marker={ruler.marker} />}
                  <BandBadge band={r.runBand} score={ruler !== null && ruler.marker.band === r.runBand ? ruler.marker.at : null} />
                </span>
              </Td>
              <Td className="whitespace-nowrap">
                <span className="flex flex-col">
                  <SetLabel sets={sets} setId={r.setId} compact stage={false} />
                  <span className="text-xs text-bw-text-muted">{r.channel}</span>
                </span>
              </Td>
              <Td>
                <RolloutBadge stage={r.rollout} />
              </Td>
              <Td className="whitespace-nowrap">{ACTION_LABEL[r.overallAction]}</Td>
              <Td>{r.status === "ok" ? <Badge tone="good">OK</Badge> : <Badge tone="danger">{STATUS_LABEL[r.status]}</Badge>}</Td>
              <Td numeric>{formatUsd(r.systemOneCostMicroUsd)}</Td>
              <Td numeric>{formatUsd(r.savingsMicroUsd)}</Td>
              <Td numeric>{formatLatency(r.latencyMs)}</Td>
            </tr>
          );
        })}
      </tbody>
    </Table>
  );
}
