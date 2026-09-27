// Reads the generated OpenAPI document from packages/core/openapi.json at build time. The docs
// site never keeps its own copy. Platform admin operations are left out: customers cannot call
// them. Tags get display names so the API pages have readable titles.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/** packages/core/openapi.json, from the docs app directory (the cwd of next and vitest). */
export const OPENAPI_PATH = resolve(process.cwd(), "../../packages/core/openapi.json");

/** The HTTP API goes live in this phase. Earlier operations get their route then. */
export const API_LIVE_PHASE = "3";

type HttpMethod = "get" | "put" | "post" | "delete" | "patch" | "head" | "options" | "trace";

export interface ApiOperation {
  operationId?: string;
  summary?: string;
  description?: string;
  tags?: string[];
  "x-bandwise-phase"?: string;
  [key: string]: unknown;
}

export interface ApiDocument {
  openapi: string;
  info: { title: string; version: string; description?: string };
  paths: Record<string, Partial<Record<HttpMethod, ApiOperation>> & Record<string, unknown>>;
  tags?: Array<{ name: string; description?: string; "x-displayName"?: string }>;
  [key: string]: unknown;
}

const METHODS: readonly HttpMethod[] = ["get", "put", "post", "delete", "patch", "head", "options", "trace"];

const TAG_NAMES: Record<string, string> = {
  set: "Question sets",
  run: "Runs",
  usage: "Usage",
  browser_token: "Browser tokens",
  project: "Projects",
  goal: "Goals",
  template: "Templates",
  draft: "Drafts",
  version: "Versions",
  channel: "Channels",
  release: "Releases",
  rollout: "Rollout",
  experiment: "Experiments",
  dataset: "Datasets",
  eval: "Evals",
  job: "Jobs",
  review: "Review",
  feedback: "Feedback",
  health: "Set health",
  policy: "Policies",
  proposal: "Proposals",
  studio: "Definition Studio",
  model: "Models",
  app: "Apps",
  app_token: "App tokens",
  opportunity: "Opportunities",
  binding: "App bindings",
  report: "Reports",
  alert: "Alerts",
  audit: "Audit log",
  event: "Events",
  webhook: "Webhooks",
  actor: "Current actor",
  portfolio: "Portfolio",
  org: "Organizations",
  approval: "Approvals",
  agent_token: "Agent tokens",
  member: "Members",
  key: "System One keys",
  settings: "Settings",
  price_book: "Price book",
  plugin: "Plugins",
};

/** A readable title for a tag: the map above, else the tag with underscores as spaces. */
export function tagDisplayName(tag: string): string {
  const known = TAG_NAMES[tag];
  if (known !== undefined) return known;
  const words = tag.replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Operations only platform staff can call. They are not part of the customer API. */
export function isPlatformOperation(op: ApiOperation): boolean {
  return (op.tags ?? []).some((t) => t.startsWith("platform"));
}

/** Every operation in the document, in path order. */
export function listOperations(doc: ApiDocument): Array<{ path: string; method: HttpMethod; op: ApiOperation }> {
  const out: Array<{ path: string; method: HttpMethod; op: ApiOperation }> = [];
  for (const [path, item] of Object.entries(doc.paths)) {
    for (const method of METHODS) {
      const op = item[method];
      if (op !== undefined) out.push({ path, method, op });
    }
  }
  return out;
}

/** The customer document: platform operations removed and tags named. Does not change the input. */
export function customerDocument(raw: ApiDocument): ApiDocument {
  const paths: ApiDocument["paths"] = {};
  const tags = new Set<string>();
  for (const [path, item] of Object.entries(raw.paths)) {
    const kept: Record<string, unknown> = {};
    let hasOperation = false;
    for (const [key, value] of Object.entries(item)) {
      if ((METHODS as readonly string[]).includes(key)) {
        const op = value as ApiOperation;
        if (isPlatformOperation(op)) continue;
        hasOperation = true;
        for (const t of op.tags ?? []) tags.add(t);
      }
      kept[key] = value;
    }
    if (hasOperation) paths[path] = kept as ApiDocument["paths"][string];
  }
  return {
    ...raw,
    paths,
    tags: [...tags].map((name) => ({ name, "x-displayName": tagDisplayName(name) })),
  };
}

/** Read and prepare the document. Throws if the file is missing or not an OpenAPI 3 document. */
export function loadApiDocument(path: string = OPENAPI_PATH): ApiDocument {
  const raw = JSON.parse(readFileSync(path, "utf8")) as ApiDocument;
  if (typeof raw.openapi !== "string" || !raw.openapi.startsWith("3.") || typeof raw.paths !== "object") {
    throw new Error(`${path} is not an OpenAPI 3 document`);
  }
  return customerDocument(raw);
}

let cached: ApiDocument | null = null;

/** loadApiDocument() for the default path, read once per process. */
export function apiDocument(): ApiDocument {
  cached ??= loadApiDocument();
  return cached;
}

const PHASE_ORDER = ["0", "1", "2", "3", "3b", "4", "4b", "5", "6", "7"];

function phaseRank(phase: string): number {
  const i = PHASE_ORDER.indexOf(phase);
  return i === -1 ? PHASE_ORDER.length : i;
}

/** The phase an operation is callable over HTTP: its own phase, but never before the API is live. */
export function availableFrom(op: ApiOperation): string {
  const phase = op["x-bandwise-phase"] ?? API_LIVE_PHASE;
  return phaseRank(phase) < phaseRank(API_LIVE_PHASE) ? API_LIVE_PHASE : phase;
}

/** "Phase 3", or "Phases 3 to 4b" when a group spans phases. */
export function phaseLabel(ops: readonly ApiOperation[]): string {
  const phases = [...new Set(ops.map(availableFrom))].sort((a, b) => phaseRank(a) - phaseRank(b));
  if (phases.length === 0) return `Phase ${API_LIVE_PHASE}`;
  if (phases.length === 1) return `Phase ${phases[0]}`;
  return `Phases ${phases[0]} to ${phases[phases.length - 1]}`;
}

/** Look up operations by path and method. Unknown items are skipped. */
export function findOperations(
  doc: ApiDocument,
  items: ReadonlyArray<{ path: string; method: string }>,
): Array<{ path: string; method: string; op: ApiOperation }> {
  const out: Array<{ path: string; method: string; op: ApiOperation }> = [];
  for (const { path, method } of items) {
    const op = doc.paths[path]?.[method.toLowerCase() as HttpMethod];
    if (op !== undefined) out.push({ path, method: method.toUpperCase(), op });
  }
  return out;
}
