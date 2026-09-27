// Eval datasets and snapshots (testing.md, Evals; data-model.md, datasets, dataset_cases and
// dataset_snapshots). A case is `{ state, expected }`, where `expected` maps a decision id to the
// labeled answer: an option key for a choice, true or false for a noul, a level index for a score,
// and a level ("high", "medium", "low") for a composite.

import { JsonValue, hashJson } from "@bandwise/core";
import { z } from "zod";

export const DatasetSplit = z.enum(["drafting", "calibration", "test"]);
export type DatasetSplit = z.infer<typeof DatasetSplit>;

/** One case as a file or the database holds it. `id` defaults to a hash of the state. */
export const EvalCaseInput = z.strictObject({
  id: z.string().min(1).optional(),
  state: JsonValue,
  expected: z.record(z.string().min(1), JsonValue),
  tags: z.array(z.string().min(1)).optional(),
  split: DatasetSplit.optional(),
});
export type EvalCaseInput = z.infer<typeof EvalCaseInput>;

export interface EvalCase {
  id: string;
  state: unknown;
  expected: Record<string, unknown>;
  tags: string[];
  split: DatasetSplit | null;
}

export interface Dataset {
  name: string;
  cases: EvalCase[];
}

/** A frozen list of case ids. The regression gate scores champion and candidate on the same one. */
export interface DatasetSnapshot {
  id: string;
  dataset: string;
  caseIds: string[];
  snapshotHash: string;
  createdAt: string;
}

export function normalizeCase(input: EvalCaseInput): EvalCase {
  return {
    id: input.id ?? `case_${hashJson(input.state).slice(0, 16)}`,
    state: input.state,
    expected: input.expected,
    tags: input.tags ?? [],
    split: input.split ?? null,
  };
}

/** Parse a dataset from JSON Lines (one case per line) or a JSON array. Throws with the line number. */
export function parseDataset(name: string, text: string): Dataset {
  const trimmed = text.trim();
  const raw: Array<{ line: number; value: unknown }> = [];
  if (trimmed.startsWith("[")) {
    const arr = JSON.parse(trimmed) as unknown[];
    arr.forEach((value, i) => raw.push({ line: i + 1, value }));
  } else {
    text.split(/\r?\n/).forEach((l, i) => {
      if (l.trim() === "") return;
      try {
        raw.push({ line: i + 1, value: JSON.parse(l) });
      } catch {
        throw new Error(`dataset ${name}, line ${i + 1}: not valid JSON`);
      }
    });
  }
  const cases = raw.map(({ line, value }) => {
    const parsed = EvalCaseInput.safeParse(value);
    if (!parsed.success) {
      throw new Error(`dataset ${name}, case ${line}: ${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`);
    }
    return normalizeCase(parsed.data);
  });
  const seen = new Set<string>();
  for (const c of cases) {
    if (seen.has(c.id)) throw new Error(`dataset ${name}: case id ${c.id} is used twice`);
    seen.add(c.id);
  }
  return { name, cases };
}

/** The content hash of a snapshot: case ids with the hash of each case's state and labels. */
export function snapshotHash(cases: readonly EvalCase[]): string {
  return hashJson(
    [...cases]
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
      .map((c) => ({ id: c.id, state: hashJson(c.state), expected: hashJson(c.expected) })),
  );
}

/** Freeze the dataset's current cases. `id` and `createdAt` come from the caller. */
export function takeSnapshot(dataset: Dataset, id: string, createdAt: string): DatasetSnapshot {
  return {
    id,
    dataset: dataset.name,
    caseIds: dataset.cases.map((c) => c.id).sort(),
    snapshotHash: snapshotHash(dataset.cases),
    createdAt,
  };
}

/**
 * The dataset's cases a snapshot names, in snapshot order. Throws when a case is gone or changed,
 * since scoring a different set of cases under the same snapshot id would break the regression gate.
 */
export function casesForSnapshot(dataset: Dataset, snapshot: DatasetSnapshot): EvalCase[] {
  if (snapshot.dataset !== dataset.name) throw new Error(`snapshot ${snapshot.id} belongs to dataset ${snapshot.dataset}, not ${dataset.name}`);
  const byId = new Map(dataset.cases.map((c) => [c.id, c]));
  const cases = snapshot.caseIds.map((id) => {
    const c = byId.get(id);
    if (c === undefined) throw new Error(`snapshot ${snapshot.id} names case ${id}, which is no longer in dataset ${dataset.name}`);
    return c;
  });
  if (snapshotHash(cases) !== snapshot.snapshotHash) {
    throw new Error(`snapshot ${snapshot.id}: a case changed since the snapshot was taken`);
  }
  return cases;
}
