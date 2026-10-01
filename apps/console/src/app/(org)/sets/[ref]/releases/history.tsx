"use client";

import type { PointerChannel, SpecDiff } from "@bandwise/core";
import { useState, useTransition } from "react";

import { Badge, Button, InlineAlert, Select, Table, Td, Th } from "~/components/ui";

import { diffAction } from "./actions";
import { SpecDiffView } from "./spec-diff-view";
import { formatTime } from "./stages";

export interface VersionRow {
  version: number;
  publishedAt: string | null;
  byAgent: boolean;
  model: string;
  changelog: string | null;
  interfaceMajor: number;
}

type Side = "draft" | PointerChannel | `${number}`;

/** "3" to 3; draft and channel names stay as they are. */
const toSide = (s: Side) => (s === "draft" || s === "production" || s === "staging" ? s : Number(s));

export function VersionHistory({ setRef, versions, serving, hasDraft }: {
  setRef: string;
  /** Newest first. */
  versions: VersionRow[];
  /** Which channel serves which version number. */
  serving: { channel: PointerChannel; version: number }[];
  hasDraft: boolean;
}) {
  const [busy, start] = useTransition();
  const newest = versions[0]?.version;
  const [from, setFrom] = useState<Side>(versions[1] === undefined ? (hasDraft ? `${newest ?? 1}` : "draft") : `${versions[1].version}`);
  const [to, setTo] = useState<Side>(versions[1] === undefined && hasDraft ? "draft" : `${newest ?? 1}`);
  const [diff, setDiff] = useState<SpecDiff | null>(null);
  const [error, setError] = useState<string | null>(null);

  const options = [
    ...(hasDraft ? [{ value: "draft", label: "Draft" }] : []),
    ...serving.map((s) => ({ value: s.channel, label: `${s.channel === "production" ? "Production" : "Staging"} (v${s.version})` })),
    ...versions.map((v) => ({ value: `${v.version}`, label: `Version ${v.version}` })),
  ];

  function compare(a: Side, b: Side) {
    setFrom(a);
    setTo(b);
    setError(null);
    start(async () => {
      const r = await diffAction({ ref: setRef, from: toSide(a), to: toSide(b) });
      if (r.ok) setDiff(r.data);
      else {
        setDiff(null);
        setError(r.message);
      }
    });
  }

  if (versions.length === 0) {
    return <p className="text-sm text-ink-2">No published versions yet. Publish the draft to create version 1.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <Table caption="Published versions, newest first">
        <thead>
          <tr>
            <Th>Version</Th>
            <Th>Changelog</Th>
            <Th>Model</Th>
            <Th>Published</Th>
            <Th>
              <span className="sr-only">Compare</span>
            </Th>
          </tr>
        </thead>
        <tbody>
          {versions.map((v, i) => {
            const channels = serving.filter((s) => s.version === v.version);
            const previous = versions[i + 1];
            return (
              <tr key={v.version}>
                <Td>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono">v{v.version}</span>
                    {channels.map((c) => (
                      <Badge key={c.channel} tone="signal">
                        {c.channel === "production" ? "Production" : "Staging"}
                      </Badge>
                    ))}
                  </div>
                </Td>
                <Td className="max-w-md">{v.changelog ?? <span className="text-ink-3">No changelog</span>}</Td>
                <Td className="font-mono text-xs whitespace-nowrap">{v.model}</Td>
                <Td className="whitespace-nowrap text-ink-2">
                  {v.publishedAt === null ? "" : formatTime(v.publishedAt)}
                  {v.byAgent ? <span className="ml-2 text-xs text-ink-3">by an agent</span> : null}
                </Td>
                <Td className="text-right">
                  {previous === undefined ? null : (
                    <Button size="sm" variant="ghost" disabled={busy} onClick={() => compare(`${previous.version}`, `${v.version}`)}>
                      Diff v{previous.version} to v{v.version}
                    </Button>
                  )}
                </Td>
              </tr>
            );
          })}
        </tbody>
      </Table>

      <div className="flex flex-col gap-3 rounded-md border border-rule px-4 py-4">
        <h3 className="text-sm font-semibold text-ink">Compare</h3>
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <Select label="From" options={options} value={from} onChange={(e) => setFrom(e.target.value as Side)} disabled={busy} />
          <Select label="To" options={options} value={to} onChange={(e) => setTo(e.target.value as Side)} disabled={busy} />
          <Button onClick={() => compare(from, to)} pending={busy} disabled={from === to}>
            {busy ? "Comparing..." : "Show diff"}
          </Button>
        </div>
        {error === null ? null : <InlineAlert kind="error">{error}</InlineAlert>}
        {diff === null ? null : <SpecDiffView diff={diff} />}
      </div>
    </div>
  );
}
