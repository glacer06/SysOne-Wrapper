// Contract watch (testing.md; system-one-models.md section 6). Nightly: diff TypeSafe's
// openapi.json, llms.txt and models.md against the committed snapshots in
// packages/system-one-client/contract. A change emits contract.changed, alerts the platform admin
// and opens an issue. The fix is a PR that adapts the code, re-records fixtures if the version
// moved, and re-snapshots the documents.

import { hashJson } from "@bandwise/core";
import { CONTRACT_SOURCES, type ContractSource } from "@bandwise/system-one-client";
import type { AlertSink, EventSink, HttpFetch, IssueSink, JobSteps } from "./ports";
import { inlineSteps } from "./ports";

/** One change. JSON values, as contract.changed carries them. */
export type ContractChange =
  | { kind: "info_version"; from: string | null; to: string | null }
  | { kind: "path_added" | "path_removed"; operation: string }
  | { kind: "schema_added" | "schema_removed" | "schema_changed"; schema: string }
  | { kind: "question_type_added" | "question_type_removed"; type: string }
  | { kind: "document_changed"; fromHash: string; toHash: string }
  | { kind: "line_added" | "line_removed"; line: string }
  | { kind: "truncated"; more: number };

/** Line changes kept per document; the rest is summarized. */
export const MAX_LINE_CHANGES = 50;

type Json = Record<string, unknown>;
const HTTP_METHODS = ["get", "put", "post", "delete", "options", "head", "patch", "trace"];

function operations(doc: Json): Set<string> {
  const out = new Set<string>();
  const paths = (doc["paths"] ?? {}) as Record<string, Json>;
  for (const [path, item] of Object.entries(paths)) {
    for (const m of Object.keys(item ?? {})) if (HTTP_METHODS.includes(m)) out.add(`${m.toUpperCase()} ${path}`);
  }
  return out;
}

function schemas(doc: Json): Record<string, unknown> {
  return ((doc["components"] as Json | undefined)?.["schemas"] ?? {}) as Record<string, unknown>;
}

function questionTypes(doc: Json): Set<string> {
  const q = schemas(doc)["Question"] as { discriminator?: { mapping?: Record<string, unknown> } } | undefined;
  return new Set(Object.keys(q?.discriminator?.mapping ?? {}));
}

function version(doc: Json): string | null {
  const v = (doc["info"] as Json | undefined)?.["version"];
  return typeof v === "string" ? v : null;
}

const sorted = (s: Iterable<string>): string[] => [...s].sort();

/** Structural diff of two openapi.json documents. Empty when they are equal. */
export function diffOpenapi(before: Json, after: Json): ContractChange[] {
  const changes: ContractChange[] = [];
  if (version(before) !== version(after)) changes.push({ kind: "info_version", from: version(before), to: version(after) });
  const [ob, oa] = [operations(before), operations(after)];
  for (const op of sorted(oa)) if (!ob.has(op)) changes.push({ kind: "path_added", operation: op });
  for (const op of sorted(ob)) if (!oa.has(op)) changes.push({ kind: "path_removed", operation: op });
  const [sb, sa] = [schemas(before), schemas(after)];
  for (const name of sorted(Object.keys(sa))) {
    if (!Object.hasOwn(sb, name)) changes.push({ kind: "schema_added", schema: name });
    else if (hashJson(sb[name]) !== hashJson(sa[name])) changes.push({ kind: "schema_changed", schema: name });
  }
  for (const name of sorted(Object.keys(sb))) if (!Object.hasOwn(sa, name)) changes.push({ kind: "schema_removed", schema: name });
  const [qb, qa] = [questionTypes(before), questionTypes(after)];
  for (const t of sorted(qa)) if (!qb.has(t)) changes.push({ kind: "question_type_added", type: t });
  for (const t of sorted(qb)) if (!qa.has(t)) changes.push({ kind: "question_type_removed", type: t });
  const [hb, ha] = [hashJson(before), hashJson(after)];
  if (changes.length === 0 && hb !== ha) changes.push({ kind: "document_changed", fromHash: hb, toHash: ha });
  return changes;
}

function lines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.trim() !== "");
}

/** Added and removed lines of a text document, order-insensitive, capped at MAX_LINE_CHANGES. */
export function diffText(before: string, after: string): ContractChange[] {
  const count = (xs: string[]): Map<string, number> => {
    const m = new Map<string, number>();
    for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1);
    return m;
  };
  const [b, a] = [lines(before), lines(after)];
  const [cb, ca] = [count(b), count(a)];
  const all: ContractChange[] = [];
  for (const l of a) {
    const n = cb.get(l) ?? 0;
    if (n > 0) cb.set(l, n - 1);
    else all.push({ kind: "line_added", line: l });
  }
  for (const l of b) {
    const n = ca.get(l) ?? 0;
    if (n > 0) ca.set(l, n - 1);
    else all.push({ kind: "line_removed", line: l });
  }
  if (all.length <= MAX_LINE_CHANGES) return all;
  return [...all.slice(0, MAX_LINE_CHANGES), { kind: "truncated", more: all.length - MAX_LINE_CHANGES }];
}

export interface ContractWatchDeps {
  fetch: HttpFetch;
  /** Snapshot text per document (loadContractSnapshots in system-one-client). */
  snapshots: Record<ContractSource, string>;
  events: EventSink;
  alerts: AlertSink;
  issues: IssueSink;
  steps?: JobSteps;
}

export interface ContractWatchResult {
  changed: Partial<Record<ContractSource, ContractChange[]>>;
  failed: Partial<Record<ContractSource, string>>;
}

const FILE_LABEL: Record<ContractSource, string> = { openapi: "openapi.json", llms_txt: "llms.txt", models_md: "models.md" };

function diffSource(source: ContractSource, snapshot: string, live: string): ContractChange[] {
  if (source === "openapi") return diffOpenapi(JSON.parse(snapshot) as Json, JSON.parse(live) as Json);
  return diffText(snapshot, live);
}

function issueBody(source: ContractSource, changes: readonly ContractChange[]): string {
  const url = CONTRACT_SOURCES[source].url;
  return [
    `The nightly contract watch found ${changes.length} change(s) in ${url} against packages/system-one-client/contract/${CONTRACT_SOURCES[source].file}.`,
    "",
    "```json",
    JSON.stringify(changes, null, 2),
    "```",
    "",
    "Next steps: read the change against the live docs, adapt system-one-api-contract.md and the code, run pnpm fixtures:record if info.version moved, and update the snapshot in the same PR.",
  ].join("\n");
}

export async function contractWatch(deps: ContractWatchDeps): Promise<ContractWatchResult> {
  const steps = deps.steps ?? inlineSteps;
  const result: ContractWatchResult = { changed: {}, failed: {} };
  for (const source of Object.keys(CONTRACT_SOURCES) as ContractSource[]) {
    const { url } = CONTRACT_SOURCES[source];
    let changes: ContractChange[];
    try {
      const live = await steps.run(`fetch:${source}`, async () => {
        const res = await deps.fetch(url, { method: "GET" });
        if (!res.ok) throw new Error(`GET ${url} returned ${res.status}`);
        return res.text();
      });
      changes = diffSource(source, deps.snapshots[source], live);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      result.failed[source] = message;
      await deps.alerts.alert("contract_fetch_failed", `Contract watch could not read ${url}: ${message}`, { source });
      continue;
    }
    if (changes.length === 0) continue;
    result.changed[source] = changes;
    await deps.events.emit({ type: "contract.changed", orgId: null, subject: { type: "contract", id: source }, data: { source, changes } });
    await deps.alerts.alert("contract_changed", `TypeSafe's ${FILE_LABEL[source]} changed (${changes.length} change(s)).`, { source });
    const versionChange = changes.find((c) => c.kind === "info_version");
    const title =
      versionChange !== undefined && versionChange.kind === "info_version"
        ? `TypeSafe contract changed: openapi.json ${versionChange.from ?? "?"} to ${versionChange.to ?? "?"}`
        : `TypeSafe contract changed: ${FILE_LABEL[source]}`;
    await deps.issues.open({ title, body: issueBody(source, changes) });
  }
  return result;
}
