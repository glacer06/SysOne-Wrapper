import Link from "next/link";

import { formatCount, formatUsd, formatWhen } from "~/components/format";
import {
  Badge,
  BandBadge,
  buttonClasses,
  cx,
  EmptyState,
  FirstRunEmpty,
  type SampleColumn,
  type SampleRow,
  Table,
  Td,
  Th,
} from "~/components/ui";

import { NEW_SET_COMMAND, NewSet } from "./new-set";
import { StageTrail } from "./stage-trail-view";
import {
  chipCounts,
  healthOf,
  matches,
  type SetRow,
  type SetsFilter,
  stateLine,
} from "./sets-summary";

const COLUMNS: readonly SampleColumn[] = [
  { label: "Set" },
  { label: "Ver" },
  { label: "Stage" },
  { label: "Health" },
  { label: "Spend 24h", numeric: true },
  { label: "Last run", band: true },
];

// One per band, so a first-time reader sees each color a real row can take. Every one is tagged SAMPLE.
const SAMPLE: readonly SampleRow[] = [
  {
    band: "high",
    score: 0.91,
    cells: ["sample-set-a", "v1", "shadow", "clear", "$0.0040", ""],
  },
  {
    band: "medium",
    score: 0.52,
    cells: ["sample-set-b", "v1", "shadow", "clear", "$0.0040", ""],
  },
  {
    band: "low",
    score: 0.18,
    cells: ["sample-set-c", "v1", "shadow", "clear", "$0.0040", ""],
  },
];

const CHIPS: ReadonlyArray<{ id: SetsFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "clear", label: "Clear" },
  { id: "review", label: "Needs review" },
];

function Health({ row }: { row: SetRow }) {
  const h = healthOf(row);
  if (h === "paused") return <Badge tone="danger">Paused</Badge>;
  if (h === "review")
    return (
      <Link
        href={`/review?set=${encodeURIComponent(row.slug)}`}
        className="inline-flex min-h-10 items-center rounded-sm"
        aria-label={`${row.openReviews} open review items for ${row.slug}`}
      >
        <Badge tone="info">
          Needs review{" "}
          <span className="font-mono tabular-nums">{row.openReviews}</span>
        </Badge>
      </Link>
    );
  return <span className="text-sm text-bw-text-muted">Clear</span>;
}

/**
 * The sets list (SETS-B): one state line, health chips, then a flat table whose Stage column
 * draws the production trail. The only chamfer is New set.
 */
export function SetsOverview({
  rows,
  filter,
  now,
}: {
  rows: readonly SetRow[];
  filter: SetsFilter;
  now: Date;
}) {
  if (rows.length === 0) {
    return (
      <FirstRunEmpty
        title="Nothing on the trail yet."
        caption="Question sets"
        columns={COLUMNS}
        rows={SAMPLE}
        next="Push your first spec. The set shows up here with its draft, then you publish it to production in shadow."
        command={NEW_SET_COMMAND}
        commandLabel="Command to create a set"
      />
    );
  }
  const counts = chipCounts(rows);
  const shown = rows.filter((r) => matches(r, filter));
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <p
          className="pt-1.5 text-lg font-semibold text-bw-text sm:text-xl"
          role="status"
        >
          {stateLine(rows, now)}
        </p>
        <NewSet />
      </div>

      <nav aria-label="Filter sets by health">
        <ul className="flex flex-wrap gap-2">
          {CHIPS.map((c) => {
            const current = c.id === filter;
            return (
              <li key={c.id}>
                <Link
                  href={c.id === "all" ? "/sets" : `/sets?show=${c.id}`}
                  aria-current={current ? "true" : undefined}
                  className={cx(
                    "inline-flex min-h-10 items-center gap-2 rounded-full border px-4 text-sm max-sm:min-h-11",
                    current
                      ? "border-bw-text bg-bw-text text-bw-bg"
                      : "border-bw-border-control text-bw-text hover:bg-bw-surface-sunken",
                  )}
                >
                  {c.label}
                  <span className="font-mono text-xs tabular-nums">
                    {counts[c.id]}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {shown.length === 0 ? (
        <EmptyState
          title="No sets match this filter"
          action={
            <Link href="/sets" className={buttonClasses("secondary", "sm")}>
              Show all sets
            </Link>
          }
        />
      ) : (
        <>
          <ul
            className="flex flex-col divide-y divide-bw-border rounded-md border border-bw-border bg-bw-surface sm:hidden"
            aria-label="Question sets"
          >
            {shown.map((s) => (
              <li key={s.slug} className="flex flex-col gap-3 px-4 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link
                      href={`/sets/${encodeURIComponent(s.slug)}`}
                      className="font-medium text-bw-text underline-offset-2 hover:underline"
                    >
                      {s.name}
                    </Link>
                    <div className="truncate font-mono text-xs text-bw-text-muted">
                      {s.slug}
                      {s.production === null ? "" : ` v${s.production.version}`}
                      {s.draft === null ? "" : `, draft v${s.draft}`}
                    </div>
                  </div>
                  <Health row={s} />
                </div>
                <StageTrail
                  stage={s.production?.stage ?? null}
                  channel="Production"
                  version={s.production?.version}
                />
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span className="font-mono tabular-nums text-bw-text">
                    {formatUsd(s.spend24hMicroUsd)}{" "}
                    <span className="text-xs text-bw-text-muted">24h</span>
                  </span>
                  {s.lastRun === null ? (
                    <span className="text-bw-text-muted">No runs yet</span>
                  ) : (
                    <span className="inline-flex items-center gap-2">
                      <BandBadge band={s.lastRun.band} />
                      <time
                        dateTime={s.lastRun.at}
                        className="text-bw-text-muted"
                      >
                        {formatWhen(s.lastRun.at, now)}
                      </time>
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
          <div className="hidden sm:block">
            <Table caption="Question sets">
              <thead>
                <tr>
                  {COLUMNS.map((c) => (
                    <Th
                      key={c.label}
                      className={c.numeric ? "text-right" : undefined}
                    >
                      {c.label}
                    </Th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shown.map((s) => (
                  <tr key={s.slug}>
                    <Td>
                      <Link
                        href={`/sets/${encodeURIComponent(s.slug)}`}
                        className="font-medium text-bw-text underline-offset-2 hover:underline"
                      >
                        {s.name}
                      </Link>
                      <div className="font-mono text-xs text-bw-text-muted">
                        {s.slug}
                      </div>
                    </Td>
                    <Td>
                      <span className="font-mono tabular-nums">
                        {s.production === null
                          ? "-"
                          : `v${s.production.version}`}
                      </span>
                      {s.draft === null ? null : (
                        <div className="font-mono text-xs text-bw-text-muted">
                          draft v{s.draft}
                        </div>
                      )}
                    </Td>
                    <Td>
                      <StageTrail
                        stage={s.production?.stage ?? null}
                        channel="Production"
                        version={s.production?.version}
                      />
                      {s.staging === null ? null : (
                        <div className="mt-1 font-mono text-xs text-bw-text-muted">
                          staging v{s.staging.version} {s.staging.stage}
                        </div>
                      )}
                    </Td>
                    <Td>
                      <Health row={s} />
                    </Td>
                    <Td numeric>
                      {formatUsd(s.spend24hMicroUsd)}
                      <div className="text-xs text-bw-text-muted">
                        {s.runs24h === 1
                          ? "1 run"
                          : `${formatCount(s.runs24h)} runs`}
                      </div>
                    </Td>
                    <Td>
                      {s.lastRun === null ? (
                        <span className="text-bw-text-muted">No runs yet</span>
                      ) : (
                        <span className="inline-flex flex-wrap items-center gap-2">
                          <BandBadge band={s.lastRun.band} />
                          <time
                            dateTime={s.lastRun.at}
                            title={s.lastRun.at}
                            className="text-sm text-bw-text-muted"
                          >
                            {formatWhen(s.lastRun.at, now)}
                          </time>
                        </span>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        </>
      )}
      <p className="text-xs text-bw-text-muted">
        Health counts open review items and pauses. Precision and drift join it
        with the set health report.
      </p>
    </div>
  );
}
