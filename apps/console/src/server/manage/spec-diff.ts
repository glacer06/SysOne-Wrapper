// Spec hashes, ETags and the SpecDiff of version.diff and the dry-run previews. Pure.

import {
  comparePointers,
  diffInterface,
  hashJson,
  interfaceOf,
  type QuestionSetSpec,
  type SetInterface,
  type SpecChange,
  type SpecDiff,
} from "@bandwise/core";

/** question_set_versions.spec_hash, which is also the draft ETag. */
export function specHash(spec: QuestionSetSpec): string {
  return `sha256:${hashJson(spec)}`;
}

/** An If-Match or ETag header value without W/ and quotes. */
export function bareEtag(header: string): string {
  const v = header.trim().replace(/^W\//, "");
  return v.length >= 2 && v.startsWith('"') && v.endsWith('"') ? v.slice(1, -1) : v;
}

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

const pointer = (path: readonly string[]) => path.map((s) => "/" + s.replaceAll("~", "~0").replaceAll("/", "~1")).join("");
const isObject = (v: unknown): v is Record<string, Json> => v !== null && typeof v === "object" && !Array.isArray(v);

function walk(a: Json | undefined, b: Json | undefined, path: string[], out: SpecChange[]): void {
  if (a === undefined && b === undefined) return;
  if (a === undefined) {
    out.push({ path: pointer(path), op: "add", after: b as Json });
    return;
  }
  if (b === undefined) {
    out.push({ path: pointer(path), op: "remove", before: a });
    return;
  }
  if (isObject(a) && isObject(b)) {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) walk(a[k], b[k], [...path, k], out);
    return;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    for (let i = 0; i < Math.max(a.length, b.length); i++) walk(a[i], b[i], [...path, String(i)], out);
    return;
  }
  if (hashJson(a) !== hashJson(b)) out.push({ path: pointer(path), op: "replace", before: a, after: b });
}

const EMPTY_INTERFACE: SetInterface = { inputSchema: {}, questions: [], composites: [], routeOutputs: [] };

/**
 * What changed from one spec to another, by JSON Pointer, plus the interface diff. A null `from`
 * (a channel's first publish) is one add at the root.
 */
export function diffSpecs(from: { label: string; spec: QuestionSetSpec | null }, to: { label: string; spec: QuestionSetSpec }): SpecDiff {
  const changes: SpecChange[] = [];
  // Round-trip through JSON so optional keys left undefined do not count as changes.
  const json = (v: unknown) => (v === null ? undefined : (JSON.parse(JSON.stringify(v)) as Json));
  walk(json(from.spec), json(to.spec), [], changes);
  changes.sort((x, y) => comparePointers(x.path, y.path));
  const before = from.spec === null ? EMPTY_INTERFACE : interfaceOf(from.spec);
  return { from: from.label, to: to.label, changes, interface: diffInterface(before, interfaceOf(to.spec)) };
}
