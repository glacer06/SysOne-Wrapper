// The remote commands over /api/v1: spec pull, push and diff, publish, rollback,
// rollout and report --remote. Request and response shapes follow packages/core/openapi.json.
// Exit codes: 0 ok, 1 error, 2 a diff, 3 an approval is pending.

import { readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import type { CommandOutput } from "../main.js";
import { type ApiClient, type ApiError, type ErrorDetail, path, unquoteEtag } from "./client.js";
import { diffJson } from "./json-diff.js";
import { EXIT, formatApiError, preview } from "./format.js";

export const CHANNELS = ["production", "staging"] as const;
export type Channel = (typeof CHANNELS)[number];
export const STAGES = ["inactive", "shadow", "controlled", "full", "paused"] as const;
export type Stage = (typeof STAGES)[number];

export type RemoteCommand =
  | { kind: "spec-pull"; set: string; out?: string; json: boolean }
  | { kind: "spec-push"; file: string; set?: string; goal?: string; name?: string; ifMatch?: string; json: boolean }
  | { kind: "spec-diff"; file: string; set?: string; version?: number; json: boolean }
  | { kind: "publish"; set: string; channel: Channel; changelog?: string; ifMatch?: string; json: boolean }
  | { kind: "rollback"; set: string; channel: Channel; to?: number; json: boolean }
  | { kind: "rollout"; set: string; stage: Stage; channel: Channel; reason?: string; json: boolean }
  | { kind: "report-remote"; since?: { text: string; ms: number }; set?: string; json: boolean };

export interface RemoteDeps {
  client: ApiClient;
  now?: () => number;
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);

/** The set slug for a spec file: its name without `.spec.json` or `.json`. */
export function slugFromFile(file: string): string {
  return basename(file).replace(/\.spec\.json$|\.json$/, "");
}

const ok = (stdout: string, stderr = ""): CommandOutput => ({ exitCode: EXIT.ok, stdout, stderr });
const json = (value: unknown, exitCode: number = EXIT.ok): CommandOutput => ({ exitCode, stdout: JSON.stringify(value, null, 2), stderr: "" });

function fail(e: ApiError, asJson: boolean): CommandOutput {
  return asJson ? json({ error: e }, EXIT.error) : { exitCode: EXIT.error, stdout: "", stderr: formatApiError(e) };
}

function usageError(message: string, asJson: boolean): CommandOutput {
  return fail({ status: null, code: "invalid_request", message, requestId: null, retryable: false, details: [], gates: [], requiredScope: null, currentEtag: null }, asJson);
}

function readSpecFile(file: string): { ok: true; spec: Record<string, unknown> } | { ok: false; message: string } {
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    return { ok: false, message: `cannot read the spec file ${file}` };
  }
  try {
    const value: unknown = JSON.parse(text);
    return isObj(value) ? { ok: true, spec: value } : { ok: false, message: `the spec file ${file} does not hold a JSON object` };
  } catch {
    return { ok: false, message: `the spec file ${file} is not valid JSON` };
  }
}

/** 202 from a high-risk operation: the approval id and where a person approves it. */
function approvalOutput(body: unknown, baseUrl: string, asJson: boolean, what: string): CommandOutput {
  if (asJson) return json(body, EXIT.approval);
  const a = isObj(body) && isObj(body["approval"]) ? body["approval"] : {};
  const id = typeof a["id"] === "string" ? a["id"] : "unknown";
  const url = typeof a["url"] === "string" ? a["url"] : `${baseUrl}/approvals/${encodeURIComponent(id)}`;
  const lines = [`${what} is waiting for approval ${id}.`, `A person approves it in the console: ${url}`];
  if (typeof a["expiresAt"] === "string") lines.push(`The request expires at ${a["expiresAt"]}.`);
  return { exitCode: EXIT.approval, stdout: lines.join("\n"), stderr: "" };
}

async function draftEtag(client: ApiClient, set: string): Promise<{ ok: true; etag: string } | { ok: false; error: ApiError }> {
  const res = await client.request("GET", path`/sets/${set}/draft`);
  if (!res.ok) return res;
  if (res.etag === null) return { ok: false, error: { status: res.status, code: "bad_response", message: "the server sent the draft without an ETag", requestId: null, retryable: false, details: [], gates: [], requiredScope: null, currentEtag: null } };
  return { ok: true, etag: res.etag };
}

async function specPull(cmd: Extract<RemoteCommand, { kind: "spec-pull" }>, { client }: RemoteDeps): Promise<CommandOutput> {
  const res = await client.request("GET", path`/sets/${cmd.set}/draft`);
  if (!res.ok) return fail(res.error, cmd.json);
  if (cmd.out === undefined) return cmd.json ? json({ set: cmd.set, etag: res.etag, spec: res.body }) : ok(JSON.stringify(res.body, null, 2), `draft etag ${res.etag ?? "none"}`);
  try {
    writeFileSync(cmd.out, `${JSON.stringify(res.body, null, 2)}\n`);
  } catch {
    return usageError(`cannot write ${cmd.out}`, cmd.json);
  }
  return cmd.json ? json({ set: cmd.set, etag: res.etag, path: cmd.out }) : ok(`Wrote the ${cmd.set} draft to ${cmd.out} (etag ${res.etag ?? "none"}).`);
}

async function specPush(cmd: Extract<RemoteCommand, { kind: "spec-push" }>, { client }: RemoteDeps): Promise<CommandOutput> {
  const file = readSpecFile(cmd.file);
  if (!file.ok) return usageError(file.message, cmd.json);
  const set = cmd.set ?? slugFromFile(cmd.file);
  let created = false;
  let etag = cmd.ifMatch;
  if (etag === undefined) {
    let current = await draftEtag(client, set);
    if (!current.ok && current.error.code === "not_found") {
      if (cmd.goal === undefined) return usageError(`set ${set} was not found. To create it, pass --goal <goalId> (and --name <text>)`, cmd.json);
      const made = await client.request("POST", "/sets", { body: { slug: set, name: cmd.name ?? set, goalId: cmd.goal } });
      if (!made.ok) return fail(made.error, cmd.json);
      created = true;
      current = await draftEtag(client, set);
    }
    if (!current.ok) return fail(current.error, cmd.json);
    etag = current.etag;
  }
  const put = await client.request("PUT", path`/sets/${set}/draft`, { body: file.spec, ifMatch: etag });
  if (!put.ok) return fail(put.error, cmd.json);
  const newEtag = isObj(put.body) && typeof put.body["etag"] === "string" ? unquoteEtag(put.body["etag"]) : put.etag;

  // The push already landed. Lints are advice here; publish refuses a draft with lint errors.
  const lint = await client.request("POST", path`/sets/${set}/draft/validate`, { body: {} });
  const lintOk = lint.ok && isObj(lint.body);
  const errors = lintOk && Array.isArray((lint.body as Record<string, unknown>)["errors"]) ? ((lint.body as Record<string, unknown>)["errors"] as ErrorDetail[]) : [];
  const warnings = lintOk && Array.isArray((lint.body as Record<string, unknown>)["warnings"]) ? ((lint.body as Record<string, unknown>)["warnings"] as ErrorDetail[]) : [];
  if (cmd.json) return json({ set, created, etag: newEtag, lint: lint.ok ? { errors, warnings } : { error: lint.error } });

  const lines = [`${created ? `Created set ${set} and pushed` : "Pushed"} ${cmd.file} to the ${set} draft (etag ${newEtag ?? "none"}).`];
  if (!lint.ok) return ok(lines.join("\n"), `Could not read the lint results:\n${formatApiError(lint.error)}`);
  lines.push(`Lint: ${errors.length} error${errors.length === 1 ? "" : "s"}, ${warnings.length} warning${warnings.length === 1 ? "" : "s"}.`);
  for (const d of [...errors, ...warnings]) lines.push(`  ${d.severity ?? "error"} ${d.rule} at ${d.path || "/"}: ${d.message}`);
  if (errors.length > 0) lines.push("Publish refuses this draft until the errors are fixed.");
  return ok(lines.join("\n"));
}

async function specDiff(cmd: Extract<RemoteCommand, { kind: "spec-diff" }>, { client }: RemoteDeps): Promise<CommandOutput> {
  const file = readSpecFile(cmd.file);
  if (!file.ok) return usageError(file.message, cmd.json);
  const set = cmd.set ?? slugFromFile(cmd.file);
  const against = cmd.version === undefined ? "draft" : `version ${cmd.version}`;
  const res = await client.request("GET", cmd.version === undefined ? path`/sets/${set}/draft` : path`/sets/${set}/versions/${cmd.version}`);
  if (!res.ok) return fail(res.error, cmd.json);
  // version.get may wrap the spec with version fields; the draft is the spec itself.
  const server = cmd.version !== undefined && isObj(res.body) && isObj(res.body["spec"]) ? res.body["spec"] : res.body;
  const changes = diffJson(server, file.spec);
  const exitCode = changes.length > 0 ? EXIT.diff : EXIT.ok;
  if (cmd.json) return json({ set, against, file: cmd.file, changes }, exitCode);
  if (changes.length === 0) return ok(`${cmd.file} matches the ${set} ${against}.`);
  const lines = [`${cmd.file} differs from the ${set} ${against} in ${changes.length} place${changes.length === 1 ? "" : "s"} (- server, + file):`];
  for (const c of changes) {
    if (c.op === "add") lines.push(`  + ${c.path}: ${preview(c.after)}`);
    else if (c.op === "remove") lines.push(`  - ${c.path}: ${preview(c.before)}`);
    else lines.push(`  ~ ${c.path}: ${preview(c.before)} -> ${preview(c.after)}`);
  }
  return { exitCode, stdout: lines.join("\n"), stderr: "" };
}

async function publish(cmd: Extract<RemoteCommand, { kind: "publish" }>, { client }: RemoteDeps): Promise<CommandOutput> {
  let etag = cmd.ifMatch;
  if (etag === undefined) {
    const current = await draftEtag(client, cmd.set);
    if (!current.ok) return fail(current.error, cmd.json);
    etag = current.etag;
  }
  const body = { channel: cmd.channel, changelog: cmd.changelog ?? "Published with bandwise publish." };
  const res = await client.request("POST", path`/sets/${cmd.set}/publish`, { body, ifMatch: etag });
  if (!res.ok) return fail(res.error, cmd.json);
  if (res.status === 202) return approvalOutput(res.body, client.baseUrl, cmd.json, `Publishing ${cmd.set} to ${cmd.channel}`);
  if (cmd.json) return json(res.body);
  const b = isObj(res.body) ? res.body : {};
  const lines = [`Published ${cmd.set} version ${String(b["version"] ?? "?")} to ${cmd.channel}.`];
  if (typeof b["experimentId"] === "string") lines.push(`It runs as the challenger in experiment ${b["experimentId"]}; the channel stays on the current version.`);
  return ok(lines.join("\n"));
}

async function rollback(cmd: Extract<RemoteCommand, { kind: "rollback" }>, { client }: RemoteDeps): Promise<CommandOutput> {
  const res = await client.request("POST", path`/sets/${cmd.set}/channels/${cmd.channel}/rollback`, { body: cmd.to === undefined ? {} : { toVersion: cmd.to } });
  if (!res.ok) return fail(res.error, cmd.json);
  if (res.status === 202) return approvalOutput(res.body, client.baseUrl, cmd.json, `Rolling back ${cmd.set} on ${cmd.channel}`);
  if (cmd.json) return json(res.body);
  const b = isObj(res.body) ? res.body : {};
  const to = typeof b["version"] === "number" ? b["version"] : cmd.to;
  return ok(`Rolled back ${cmd.set} on ${cmd.channel}${to !== undefined ? ` to version ${to}` : ""}.`);
}

async function rollout(cmd: Extract<RemoteCommand, { kind: "rollout" }>, { client }: RemoteDeps): Promise<CommandOutput> {
  const body = { stage: cmd.stage, reason: cmd.reason ?? "Changed with bandwise rollout." };
  const res = await client.request("PUT", path`/sets/${cmd.set}/channels/${cmd.channel}/rollout`, { body });
  if (!res.ok) return fail(res.error, cmd.json);
  if (res.status === 202) return approvalOutput(res.body, client.baseUrl, cmd.json, `Moving ${cmd.set} ${cmd.channel} to ${cmd.stage}`);
  return cmd.json ? json(res.body) : ok(`${cmd.set} ${cmd.channel} is now ${cmd.stage}.`);
}

/** Most run pages `report --remote` reads. */
const MAX_RUN_PAGES = 10;

interface RemoteSetSummary {
  set: string;
  runs: number;
  failed: number;
  bands: { high: number; medium: number; low: number };
  auto: number;
  systemOneCostUsd: number;
  savingsUsd: number;
}

const num = (x: unknown): number => (typeof x === "number" && Number.isFinite(x) ? x : 0);
const round6 = (n: number): number => Math.round(n * 1e6) / 1e6;

/** Sum run summaries per set. Fields a summary lacks count as zero. */
export function summarizeRuns(rows: readonly unknown[]): RemoteSetSummary[] {
  const bySet = new Map<string, RemoteSetSummary>();
  for (const row of rows) {
    if (!isObj(row)) continue;
    const name = [row["set"], row["setSlug"], row["setId"]].find((v): v is string => typeof v === "string") ?? "unknown";
    const s = bySet.get(name) ?? { set: name, runs: 0, failed: 0, bands: { high: 0, medium: 0, low: 0 }, auto: 0, systemOneCostUsd: 0, savingsUsd: 0 };
    s.runs++;
    if (row["status"] !== "ok") s.failed++;
    const band = row["runBand"];
    if (band === "high" || band === "medium" || band === "low") s.bands[band]++;
    if (row["overallAction"] === "auto") s.auto++;
    const cost = isObj(row["cost"]) ? row["cost"] : row;
    s.systemOneCostUsd = round6(s.systemOneCostUsd + num(cost["systemOneCostUsd"]));
    s.savingsUsd = round6(s.savingsUsd + num(cost["savingsUsd"]));
    bySet.set(name, s);
  }
  return [...bySet.values()].sort((a, b) => a.set.localeCompare(b.set));
}

async function reportRemote(cmd: Extract<RemoteCommand, { kind: "report-remote" }>, { client, now = Date.now }: RemoteDeps): Promise<CommandOutput> {
  const from = cmd.since === undefined ? undefined : new Date(now() - cmd.since.ms).toISOString();
  const usage = await client.request("GET", "/usage");
  if (!usage.ok) return fail(usage.error, cmd.json);
  const rows: unknown[] = [];
  let cursor: string | undefined;
  let truncated = false;
  for (let page = 0; ; page++) {
    const res = await client.request("GET", "/runs", { query: { set: cmd.set, from, limit: 100, cursor } });
    if (!res.ok) return fail(res.error, cmd.json);
    const b = isObj(res.body) ? res.body : {};
    if (Array.isArray(b["data"])) rows.push(...(b["data"] as unknown[]));
    cursor = typeof b["nextCursor"] === "string" ? b["nextCursor"] : undefined;
    if (cursor === undefined) break;
    if (page + 1 >= MAX_RUN_PAGES) {
      truncated = true;
      break;
    }
  }
  const sets = summarizeRuns(rows);
  if (cmd.json) return json({ since: cmd.since?.text ?? null, from: from ?? null, set: cmd.set ?? null, runs: { count: rows.length, truncated, sets }, usage: usage.body });

  const lines = [`Bandwise report from ${new URL(client.baseUrl).host}${cmd.since !== undefined ? `, last ${cmd.since.text}` : ""}${cmd.set !== undefined ? `, set ${cmd.set}` : ""}.`];
  if (sets.length === 0) lines.push("No runs.");
  for (const s of sets) {
    lines.push(
      `${s.set}: ${s.runs} run${s.runs === 1 ? "" : "s"} (${s.failed} failed), bands high ${s.bands.high} / medium ${s.bands.medium} / low ${s.bands.low}, auto ${s.auto}, System One $${s.systemOneCostUsd.toFixed(6)}, savings $${s.savingsUsd.toFixed(6)}`,
    );
  }
  if (truncated) lines.push(`Only the first ${rows.length} runs were read. Narrow it with --since or --set.`);
  if (isObj(usage.body) && Object.keys(usage.body).length > 0) {
    lines.push("Usage and savings (org rollup):");
    for (const [k, v] of Object.entries(usage.body)) lines.push(`  ${k}: ${typeof v === "object" && v !== null ? preview(v, 120) : String(v)}`);
  }
  return ok(lines.join("\n"));
}

/** Run one remote command. */
export async function runRemoteCommand(cmd: RemoteCommand, deps: RemoteDeps): Promise<CommandOutput> {
  switch (cmd.kind) {
    case "spec-pull":
      return specPull(cmd, deps);
    case "spec-push":
      return specPush(cmd, deps);
    case "spec-diff":
      return specDiff(cmd, deps);
    case "publish":
      return publish(cmd, deps);
    case "rollback":
      return rollback(cmd, deps);
    case "rollout":
      return rollout(cmd, deps);
    case "report-remote":
      return reportRemote(cmd, deps);
  }
}
