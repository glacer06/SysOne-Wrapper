// `pnpm eval --org <slug> --set <slug> --version <n> --dataset <name> [--snapshot <id>] [--model <id>]
//            [--repeats <k>] [--provider typesafe|openrouter|vercel] [--transport fixture|sdk] [--data <dir>] [--json]`
//
// Internal (testing.md, Evals); customers use `bandwise eval run`. Offline by default: the fixture
// transport answers from recorded fixtures and deterministic synthetic answers, and the folder store
// reads specs and datasets from --data. `--transport sdk` (or SYSTEM_ONE_TRANSPORT=sdk) makes live
// calls with TYPESAFE_API_KEY or OPENROUTER_API_KEY for the chosen provider.

import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { SystemOneProvider, type SystemOneTransport } from "@bandwise/core";
import { SdkTransport } from "@bandwise/system-one-client";
import type { FixtureTransport } from "@bandwise/system-one-client/fixture";
import { EvalInputError, type EvalReport, runEval } from "./harness.js";
import { BANDS, type BandMetrics } from "./metrics.js";
import { PROVIDER_KEY_ENV, createEvalPorts, evalContext, offlineTransport } from "./ports.js";
import { createFolderEvalStore } from "./store.js";

/** The demo data that ships with this package (org `demo`). */
export const DEFAULT_DATA_DIR = fileURLToPath(new URL("../data/", import.meta.url));

export interface CliIo {
  out: (line: string) => void;
  err: (line: string) => void;
  env: Record<string, string | undefined>;
  now?: () => number;
  newId?: () => string;
  /** Replaces the transport the flags pick. Tests only. */
  transport?: SystemOneTransport;
}

export const USAGE =
  "usage: pnpm eval --org <slug> --set <slug> --version <n> --dataset <name> [--snapshot <id>] [--model <id>] [--repeats <k>]\n" +
  "                 [--provider typesafe|openrouter|vercel] [--transport fixture|sdk] [--data <dir>] [--json]";

const pct = (x: number | null): string => (x === null ? "   n/a" : `${(x * 100).toFixed(1).padStart(5)}%`);
const num = (x: number | null, digits = 3): string => (x === null ? "n/a" : x.toFixed(digits));

function bandLine(name: string, b: BandMetrics): string {
  return `  ${name.padEnd(7)} n=${String(b.decisions).padStart(4)} labeled=${String(b.labeled).padStart(4)} precision=${pct(b.precision)} lower95=${pct(b.lower95)} coverage=${pct(b.coverage)} review=${pct(b.reviewLoad)} ece=${num(b.ece)}`;
}

export function formatReport(r: EvalReport, synthetic: number | null): string[] {
  const m = r.metrics;
  const lines = [
    `eval ${r.record.id}: ${r.record.org}/${r.record.setSlug}@${r.record.version} on ${r.record.model} (${r.record.provider}, ${r.record.transport})`,
    `dataset ${r.record.dataset}, snapshot ${r.snapshot.id} (${r.snapshot.caseIds.length} cases)`,
    `runs: ${m.okRuns} ok, ${m.failedRuns} failed${Object.keys(m.errors).length > 0 ? ` ${JSON.stringify(m.errors)}` : ""}`,
  ];
  if (synthetic !== null && synthetic > 0) {
    lines.push(`note: ${synthetic} System One calls had no recorded fixture and got synthetic answers. Their metrics say nothing about model quality.`);
  }
  const errors = r.lint.filter((l) => l.severity === "error");
  if (errors.length > 0) lines.push(`lint errors: ${errors.map((l) => l.rule).join(", ")}`);
  lines.push("", "gating decisions by band:");
  for (const b of BANDS) lines.push(bandLine(b, m.bands[b]));
  lines.push(`  coverage ${pct(m.coverage)}, review load ${pct(m.reviewLoad)}, ECE ${num(m.ece)}`);
  lines.push("", "reliability (gating):", "  bin          n  confidence  accuracy");
  for (const row of m.reliability.filter((x) => x.n > 0)) {
    lines.push(`  ${row.lo.toFixed(1)}-${row.hi.toFixed(1)}  ${String(row.n).padStart(6)}  ${num(row.meanConfidence).padStart(10)}  ${num(row.accuracy).padStart(8)}`);
  }
  lines.push("", "questions:");
  for (const q of Object.values(m.questions)) {
    const parts = [`accuracy=${pct(q.accuracy)}`];
    if (q.mae !== null) parts.push(`mae=${num(q.mae)}`);
    if (q.brier !== null) parts.push(`brier=${num(q.brier)}`);
    parts.push(`coverage=${pct(q.coverage)}`, `ece=${num(q.ece)}`);
    lines.push(`  ${q.decisionId} (${q.type}${q.gating ? ", gating" : ""}) labeled=${q.labeled} ${parts.join(" ")}`);
    if (q.confusion.labels.length > 0) {
      lines.push(`    confusion (rows expected, columns predicted): ${q.confusion.labels.join(" | ")}`);
      q.confusion.matrix.forEach((row, i) => lines.push(`      ${q.confusion.labels[i]}: ${row.join(" ")}`));
    }
  }
  const c = m.cost;
  lines.push(
    "",
    `cost: $${c.systemOneCostUsd.toFixed(6)} over ${c.calls} calls (${c.inputTokens} input tokens)${c.unpricedRuns > 0 ? `, ${c.unpricedRuns} unpriced runs` : ""}`,
    `latency: p50 ${c.latencyP50Ms ?? "n/a"} ms, p95 ${c.latencyP95Ms ?? "n/a"} ms`,
  );
  if (m.stability !== null) lines.push(`stability: ${pct(m.stability)} over ${r.record.repeats} repeats`);
  return lines;
}

function positiveInt(name: string, v: string | undefined): number | undefined {
  if (v === undefined) return undefined;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1) throw new EvalInputError(`--${name} must be a positive whole number`);
  return n;
}

/** Run the CLI. Returns the exit code: 0 ok, 1 eval failed, 2 bad input. */
export async function main(argv: readonly string[], io: CliIo): Promise<number> {
  let values;
  try {
    ({ values } = parseArgs({
      args: [...argv],
      options: {
        org: { type: "string" },
        set: { type: "string" },
        version: { type: "string" },
        dataset: { type: "string" },
        snapshot: { type: "string" },
        model: { type: "string" },
        repeats: { type: "string" },
        provider: { type: "string" },
        transport: { type: "string" },
        data: { type: "string" },
        json: { type: "boolean" },
        help: { type: "boolean" },
      },
      allowPositionals: false,
    }));
  } catch (e) {
    io.err((e as Error).message);
    io.err(USAGE);
    return 2;
  }
  if (values.help === true) {
    io.out(USAGE);
    return 0;
  }
  try {
    const missing = (["org", "set", "version", "dataset"] as const).filter((k) => values[k] === undefined);
    if (missing.length > 0) throw new EvalInputError(`missing --${missing.join(", --")}`);
    const provider = SystemOneProvider.safeParse(values.provider ?? "typesafe");
    if (!provider.success) throw new EvalInputError("--provider must be typesafe, openrouter or vercel");
    const transportKind = values.transport ?? io.env["SYSTEM_ONE_TRANSPORT"] ?? "fixture";
    if (transportKind !== "fixture" && transportKind !== "sdk") throw new EvalInputError("--transport must be fixture or sdk");

    let transport: SystemOneTransport;
    let fixture: FixtureTransport | null = null;
    const keys: Partial<Record<SystemOneProvider, string>> = {};
    if (transportKind === "sdk") {
      const envName = PROVIDER_KEY_ENV[provider.data];
      const key = io.env[envName];
      if (key === undefined || key === "") {
        throw new EvalInputError(`--transport sdk on ${provider.data} needs ${envName}. Drop --transport to run offline on fixtures.`);
      }
      keys[provider.data] = key;
      transport = io.transport ?? new SdkTransport();
    } else {
      // The fixture transport never sends anything, so the key is a placeholder.
      keys[provider.data] = "fixture";
      fixture = offlineTransport();
      transport = io.transport ?? fixture;
    }

    const now = io.now ?? Date.now;
    const newId = io.newId ?? ((): string => globalThis.crypto.randomUUID());
    const report = await runEval(
      {
        org: values.org as string,
        set: values.set as string,
        version: positiveInt("version", values.version) as number,
        dataset: values.dataset as string,
        ...(values.snapshot !== undefined ? { snapshotId: values.snapshot } : {}),
        ...(values.model !== undefined ? { model: values.model } : {}),
        ...(values.repeats !== undefined ? { repeats: positiveInt("repeats", values.repeats) as number } : {}),
        provider: provider.data,
      },
      {
        store: createFolderEvalStore(values.data ?? io.env["BANDWISE_EVALS_DIR"] ?? DEFAULT_DATA_DIR),
        ports: createEvalPorts({ transport, keys, clock: now, newId }),
        ctx: evalContext(),
        transportKind,
        now,
        newId,
      },
    );
    const synthetic = fixture === null || io.transport !== undefined ? null : fixture.calls.filter((c) => c.fixture === null).length;
    if (values.json === true) io.out(JSON.stringify({ ...report, syntheticCalls: synthetic }, null, 2));
    else for (const line of formatReport(report, synthetic)) io.out(line);
    return report.record.status === "succeeded" ? 0 : 1;
  } catch (e) {
    if (e instanceof EvalInputError) {
      io.err(`eval: ${e.message}`);
      io.err(USAGE);
      return 2;
    }
    throw e;
  }
}
