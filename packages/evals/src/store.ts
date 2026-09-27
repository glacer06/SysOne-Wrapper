// Where the eval harness reads versions and datasets and writes snapshots and eval runs.
//
// The harness only sees the EvalStore port. Two implementations ship here: an in-memory store for
// tests, and a folder store for `pnpm eval` offline. The Postgres store (dataset_cases,
// dataset_snapshots, eval_runs through withTenant) belongs to the console, which may import
// @sysone/db; this package may not (architecture.md, Packages and boundaries).
//
// Folder layout under the root:
//   <org>/sets/<set>/v<n>.json       a QuestionSetSpec
//   <org>/datasets/<name>.jsonl      one { id?, state, expected, tags?, split? } per line
//   <org>/snapshots/<id>.json        a DatasetSnapshot (written by the harness)
//   <org>/eval-runs/<id>.json        an EvalRunRecord (written by the harness)

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type QuestionSetSpec, type SystemOneProvider, hashJson, parseSpec } from "@sysone/core";
import { type Dataset, type DatasetSnapshot, parseDataset } from "./dataset.js";
import type { EvalMetrics } from "./metrics.js";

export interface StoredVersion {
  setSlug: string;
  setId: string;
  version: number;
  versionId: string;
  spec: QuestionSetSpec;
  interfaceMajor: number;
  interfaceHash: string;
}

/** One `eval_runs` row (data-model.md): it records the model and the snapshot. */
export interface EvalRunRecord {
  id: string;
  org: string;
  setSlug: string;
  setId: string;
  version: number;
  versionId: string;
  dataset: string;
  snapshotId: string;
  /** The model the eval ran on: the version's own, or --model. */
  model: string;
  /** Whether --model replaced the version's model. */
  modelOverride: boolean;
  provider: SystemOneProvider;
  repeats: number | null;
  transport: "fixture" | "sdk";
  status: "succeeded" | "failed";
  metrics: EvalMetrics;
  costMicroUsd: number;
  startedAt: string;
  finishedAt: string;
}

export interface EvalStore {
  getVersion(org: string, set: string, version: number): Promise<StoredVersion | null>;
  getDataset(org: string, name: string): Promise<Dataset | null>;
  getSnapshot(org: string, id: string): Promise<DatasetSnapshot | null>;
  saveSnapshot(org: string, snapshot: DatasetSnapshot): Promise<void>;
  saveEvalRun(record: EvalRunRecord): Promise<void>;
}

/** A uuid-shaped id derived from a name, so folder-store sets get stable ids. */
export function stableUuid(name: string): string {
  const h = hashJson(name);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-7${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

function versionFromSpec(org: string, set: string, version: number, spec: QuestionSetSpec): StoredVersion {
  return {
    setSlug: set,
    setId: stableUuid(`set:${org}/${set}`),
    version,
    versionId: stableUuid(`version:${org}/${set}@${version}`),
    spec,
    interfaceMajor: 1,
    interfaceHash: hashJson(spec).slice(0, 16),
  };
}

// ---------------------------------------------------------------------------
// In memory

export interface MemoryEvalStore extends EvalStore {
  readonly snapshots: DatasetSnapshot[];
  readonly evalRuns: EvalRunRecord[];
}

export function createMemoryEvalStore(seed: {
  versions?: Array<{ org: string; set: string; version: number; spec: QuestionSetSpec }>;
  datasets?: Array<{ org: string; dataset: Dataset }>;
}): MemoryEvalStore {
  const versions = new Map((seed.versions ?? []).map((v) => [`${v.org}/${v.set}@${v.version}`, versionFromSpec(v.org, v.set, v.version, v.spec)]));
  const datasets = new Map((seed.datasets ?? []).map((d) => [`${d.org}/${d.dataset.name}`, d.dataset]));
  const snapshots: DatasetSnapshot[] = [];
  const snapshotOrg = new Map<string, string>();
  const evalRuns: EvalRunRecord[] = [];
  return {
    snapshots,
    evalRuns,
    async getVersion(org, set, version) {
      return versions.get(`${org}/${set}@${version}`) ?? null;
    },
    async getDataset(org, name) {
      return datasets.get(`${org}/${name}`) ?? null;
    },
    async getSnapshot(org, id) {
      return snapshotOrg.get(id) === org ? (snapshots.find((s) => s.id === id) ?? null) : null;
    },
    async saveSnapshot(org, snapshot) {
      snapshots.push(snapshot);
      snapshotOrg.set(snapshot.id, org);
    },
    async saveEvalRun(record) {
      evalRuns.push(record);
    },
  };
}

// ---------------------------------------------------------------------------
// Folder

const SLUG = /^[a-z0-9][a-z0-9_-]*$/;

function safe(what: string, value: string): string {
  if (!SLUG.test(value)) throw new Error(`${what} "${value}" must be a slug (lowercase letters, digits, - and _)`);
  return value;
}

function readJsonFile(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

export function createFolderEvalStore(root: string): EvalStore {
  const orgDir = (org: string): string => join(root, safe("org", org));
  return {
    async getVersion(org, set, version) {
      const path = join(orgDir(org), "sets", safe("set", set), `v${version}.json`);
      if (!existsSync(path)) return null;
      const parsed = parseSpec(readJsonFile(path));
      if (!parsed.ok) {
        throw new Error(`${path} is not a valid spec: ${parsed.details.map((d) => `${d.path} ${d.message}`).join("; ")}`);
      }
      return versionFromSpec(org, set, version, parsed.spec);
    },
    async getDataset(org, name) {
      const dir = join(orgDir(org), "datasets");
      for (const file of [`${safe("dataset", name)}.jsonl`, `${name}.json`]) {
        const path = join(dir, file);
        if (existsSync(path)) return parseDataset(name, readFileSync(path, "utf8"));
      }
      return null;
    },
    async getSnapshot(org, id) {
      const path = join(orgDir(org), "snapshots", `${safe("snapshot", id)}.json`);
      return existsSync(path) ? (readJsonFile(path) as DatasetSnapshot) : null;
    },
    async saveSnapshot(org, snapshot) {
      const dir = join(orgDir(org), "snapshots");
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, `${safe("snapshot", snapshot.id)}.json`), `${JSON.stringify(snapshot, null, 2)}\n`);
    },
    async saveEvalRun(record) {
      const dir = join(orgDir(record.org), "eval-runs");
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, `${safe("eval run", record.id)}.json`), `${JSON.stringify(record, null, 2)}\n`);
    },
  };
}
