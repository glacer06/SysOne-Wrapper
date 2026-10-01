// URL search params to operation inputs for the runs, savings and review pages. Filters live in the
// URL, so a filtered view can be bookmarked or shared and works without script. Unknown or bad
// values are dropped rather than failing the page.

import { Action, Band, Channel, ReviewItemKind, ReviewItemStatus, RunRecordSource, RunStatus } from "@bandwise/core";
import type { z } from "zod";

export type SearchParams = Record<string, string | string[] | undefined>;

/** The first value of a param, or undefined. */
export function param(sp: SearchParams, key: string): string | undefined {
  const v = sp[key];
  const s = Array.isArray(v) ? v[0] : v;
  return s === undefined || s === "" ? undefined : s;
}

function pick<T extends string>(schema: z.ZodType<T>, value: string | undefined): T | undefined {
  if (value === undefined) return undefined;
  const parsed = schema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

export const RANGES = [
  { value: "1h", label: "Last hour", ms: 3_600_000 },
  { value: "24h", label: "Last 24 hours", ms: 86_400_000 },
  { value: "7d", label: "Last 7 days", ms: 7 * 86_400_000 },
  { value: "30d", label: "Last 30 days", ms: 30 * 86_400_000 },
  { value: "90d", label: "Last 90 days", ms: 90 * 86_400_000 },
] as const;

export type RangeValue = (typeof RANGES)[number]["value"] | "all";

export function rangeOf(sp: SearchParams, fallback: RangeValue): RangeValue {
  const v = param(sp, "range");
  return v === "all" || RANGES.some((r) => r.value === v) ? (v as RangeValue) : fallback;
}

/** The start of a range, or undefined for all time. */
export function rangeStart(range: RangeValue, now: Date): Date | undefined {
  const r = RANGES.find((x) => x.value === range);
  return r === undefined ? undefined : new Date(now.getTime() - r.ms);
}

const SLUG = /^[a-z0-9][a-z0-9_-]{0,127}$/i;
const CURSOR = /^[0-9a-f-]{36}$/i;

/** run.list input from the runs page URL. */
export function runListInput(sp: SearchParams, now: Date) {
  const input: Record<string, string> = { limit: "50" };
  const set = param(sp, "set");
  if (set !== undefined && SLUG.test(set)) input["set"] = set;
  const channel = pick(Channel, param(sp, "channel"));
  if (channel !== undefined) input["channel"] = channel;
  const status = pick(RunStatus, param(sp, "status"));
  if (status !== undefined) input["status"] = status;
  const source = pick(RunRecordSource, param(sp, "source"));
  if (source !== undefined) input["source"] = source;
  const band = pick(Band, param(sp, "band"));
  if (band !== undefined) input["band"] = band;
  const action = pick(Action, param(sp, "action"));
  if (action !== undefined) input["action"] = action;
  const from = rangeStart(rangeOf(sp, "7d"), now);
  if (from !== undefined) input["from"] = from.toISOString();
  const cursor = param(sp, "cursor");
  if (cursor !== undefined && CURSOR.test(cursor)) input["cursor"] = cursor;
  return input;
}

/** review.list input from the review page URL. The queue opens on what needs a person. */
export function reviewListInput(sp: SearchParams) {
  const input: Record<string, string> = { limit: "50" };
  const status = param(sp, "status");
  if (status !== "any") input["status"] = pick(ReviewItemStatus, status) ?? "open";
  const kind = pick(ReviewItemKind, param(sp, "kind"));
  if (kind !== undefined) input["kind"] = kind;
  const band = pick(Band, param(sp, "band"));
  if (band !== undefined) input["band"] = band;
  const set = param(sp, "set");
  if (set !== undefined && SLUG.test(set)) input["set"] = set;
  const cursor = param(sp, "cursor");
  if (cursor !== undefined && CURSOR.test(cursor)) input["cursor"] = cursor;
  return input;
}

/** The same page with some params changed; undefined removes one. A filter change drops the cursor. */
export function hrefWith(path: string, sp: SearchParams, changes: Record<string, string | undefined>): string {
  const out = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    const s = Array.isArray(v) ? v[0] : v;
    if (s !== undefined && s !== "" && k !== "cursor") out.set(k, s);
  }
  for (const [k, v] of Object.entries(changes)) {
    if (v === undefined) out.delete(k);
    else out.set(k, v);
  }
  const q = out.toString();
  return q === "" ? path : `${path}?${q}`;
}

/** True when any filter other than the range is set. */
export function hasFilters(sp: SearchParams, keys: readonly string[]): boolean {
  return keys.some((k) => param(sp, k) !== undefined);
}
