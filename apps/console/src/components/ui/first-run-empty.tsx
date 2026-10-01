import type { Band } from "@bandwise/core";
import type { ReactNode } from "react";

import { BandBadge } from "./badge";
import { CopyCommand } from "./copy-command";
import { cx } from "./cx";
import { Table, Td, Th } from "./table";

export interface SampleColumn {
  label: string;
  /** Right aligned and mono, as the real column is. */
  numeric?: boolean;
  /** The column that holds the band. Its cell shows the sample row's band badge. */
  band?: boolean;
}

export interface SampleRow {
  band: Band;
  score: number;
  /** One per column, in order. The band column's entry is ignored. */
  cells: readonly string[];
}

/**
 * A first-time empty table (Nick's EMPTY mix of A and C). It keeps the page's real headers, a
 * state line with the trail under it and no teal node, and one next step with the exact CLI line.
 * Under the headers sit three sample rows, one per band, in their real band colors, so a first-time
 * reader sees what a real row will look like. Every sample row is tagged SAMPLE in mono and its
 * other values are muted, so no sample number can pass for a real one. Filter misses use the
 * plain EmptyState instead.
 */
export function FirstRunEmpty({
  title,
  columns,
  rows,
  next,
  command,
  commandLabel,
  caption,
}: {
  /** The state line, for example "Nothing on the trail yet." */
  title: string;
  columns: readonly SampleColumn[];
  rows: readonly SampleRow[];
  /** The one next step, in a sentence. */
  next: ReactNode;
  command: string;
  commandLabel?: string;
  /** The table's accessible name, for example "Runs". */
  caption: string;
}) {
  return (
    <section className="flex flex-col gap-4" aria-label={title}>
      <div className="flex flex-col gap-3">
        <h2 className="text-base font-semibold text-bw-text">{title}</h2>
        <div aria-hidden className="bw-trail w-full" />
      </div>
      <p className="bw-label">
        Sample rows. A real row will look like this. None of these values are
        real.
      </p>
      {/* Phones: the same three rows stacked, band first, so the colors are on screen without scrolling. */}
      <ul
        className="flex flex-col divide-y divide-dashed divide-bw-border rounded-md border border-bw-border bg-bw-surface sm:hidden"
        aria-label={`${caption}: sample rows only, no real data`}
      >
        {rows.map((r, i) => (
          <li
            key={i}
            className="flex flex-col gap-2 px-4 py-3 font-mono text-[0.8125rem] text-bw-text-muted"
          >
            <span className="flex flex-wrap items-center gap-2">
              <span className="bw-label rounded-xs border border-bw-border-strong px-1.5 leading-5">
                Sample
              </span>
              <BandBadge band={r.band} score={r.score} />
            </span>
            <span className="flex flex-wrap gap-x-3 gap-y-1">
              {columns.map((c, j) =>
                c.band || (r.cells[j] ?? "") === "" ? null : (
                  <span key={c.label}>{r.cells[j]}</span>
                ),
              )}
            </span>
          </li>
        ))}
      </ul>
      <div className="hidden sm:block">
        <Table caption={`${caption}: sample rows only, no real data`}>
          <thead>
            <tr>
              {columns.map((c) => (
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
            {rows.map((r, i) => (
              <tr key={i}>
                {columns.map((c, j) => (
                  <Td
                    key={c.label}
                    className={cx(
                      "border-dashed font-mono text-[0.8125rem] text-bw-text-muted",
                      c.numeric && "text-right tabular-nums",
                    )}
                  >
                    <span
                      className={cx(
                        "inline-flex items-center gap-2",
                        c.numeric && "justify-end",
                      )}
                    >
                      {j === 0 ? (
                        <span className="bw-label rounded-xs border border-bw-border-strong px-1.5 leading-5">
                          Sample
                        </span>
                      ) : null}
                      {c.band ? (
                        <BandBadge band={r.band} score={r.score} />
                      ) : (
                        <span>{r.cells[j] ?? ""}</span>
                      )}
                    </span>
                  </Td>
                ))}
              </tr>
            ))}
          </tbody>
        </Table>
      </div>
      <div className="flex flex-col gap-2">
        <p className="max-w-prose text-sm text-bw-text">{next}</p>
        <CopyCommand
          command={command}
          label={commandLabel ?? "Command to run"}
        />
      </div>
    </section>
  );
}
