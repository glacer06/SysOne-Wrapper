// Shared command lines for `pnpm smoke` and `pnpm fixtures:record`. Both need a live key for the
// chosen provider; without one they print why they skipped and exit 0, so CI without secrets stays
// green (testing.md: "Skipped when TYPESAFE_API_KEY is missing").

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { parseArgs } from "node:util";
import {
  type ModelProfile,
  type ModelRoute,
  SEED_MODEL_PROFILES,
  SEED_MODEL_ROUTES,
  SystemOneProvider,
  type SystemOneTransport,
} from "@bandwise/core";
import { SdkTransport } from "@bandwise/system-one-client";
import { BUNDLED_FIXTURES_DIR, type Fixture, loadBundledFixtures } from "@bandwise/system-one-client/fixture";
import { PROVIDER_KEY_ENV } from "../ports.js";
import { RecordPlanError, planRecording, recordFixtures } from "./record.js";
import { runSmoke, smokeList } from "./smoke.js";

/** TypeSafe's machine-readable contract. Fixtures record its info.version. */
export const TYPESAFE_OPENAPI_URL = "https://api.typesafe.ai/openapi.json";

export interface LiveIo {
  out: (line: string) => void;
  err: (line: string) => void;
  env: Record<string, string | undefined>;
  /** Tests replace the SDK transport, the registry rows, the fixture source and the writer. */
  transport?: SystemOneTransport;
  profiles?: readonly ModelProfile[];
  routes?: readonly ModelRoute[];
  fixtures?: readonly Fixture[];
  write?: (path: string, fixture: Fixture) => void;
  fetchOpenapiVersion?: () => Promise<string>;
}

interface Parsed {
  provider: SystemOneProvider;
  model: string | undefined;
  apiKey: string | null;
  envName: string;
}

function parse(command: string, argv: readonly string[], io: LiveIo): Parsed | number {
  let values: { model?: string | undefined; provider?: string | undefined };
  try {
    ({ values } = parseArgs({ args: [...argv], options: { model: { type: "string" }, provider: { type: "string" } }, allowPositionals: false }));
  } catch (e) {
    io.err(`${command}: ${(e as Error).message}`);
    io.err(`usage: pnpm ${command} [--model <id>] [--provider ${SystemOneProvider.options.join("|")}]`);
    return 2;
  }
  const provider = SystemOneProvider.safeParse(values.provider ?? "typesafe");
  if (!provider.success) {
    io.err(`${command}: --provider must be one of ${SystemOneProvider.options.join(", ")}`);
    return 2;
  }
  const envName = PROVIDER_KEY_ENV[provider.data];
  const key = io.env[envName];
  return { provider: provider.data, model: values.model, apiKey: key === undefined || key === "" ? null : key, envName };
}

async function liveOpenapiVersion(): Promise<string> {
  const res = await fetch(TYPESAFE_OPENAPI_URL, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`GET ${TYPESAFE_OPENAPI_URL} returned ${res.status}`);
  const body = (await res.json()) as { info?: { version?: unknown } };
  if (typeof body.info?.version !== "string") throw new Error("openapi.json has no info.version");
  return body.info.version;
}

/** `pnpm smoke`. Exit 0 when every check passed or the key is missing, 1 on a failed check. */
export async function smokeMain(argv: readonly string[], io: LiveIo): Promise<number> {
  const p = parse("smoke", argv, io);
  if (typeof p === "number") return p;
  if (p.apiKey === null) {
    io.out(`smoke skipped: ${p.envName} is not set, so no live ${p.provider} call was made. Set it to run the live smoke test.`);
    return 0;
  }
  const profiles = io.profiles ?? SEED_MODEL_PROFILES;
  const routes = io.routes ?? SEED_MODEL_ROUTES;
  const targets = smokeList(p.provider, profiles, routes, p.model !== undefined ? { model: p.model } : {});
  io.out(`smoke on ${p.provider}: ${targets.map((t) => t.model).join(", ")}`);
  const checks = await runSmoke(targets, { provider: p.provider, apiKey: p.apiKey, transport: io.transport ?? new SdkTransport(), profiles, routes });
  for (const c of checks) io.out(`${c.skipped === true ? "SKIP" : c.ok ? "ok  " : "FAIL"} ${c.model} ${c.check}: ${c.detail}`);
  const failed = checks.filter((c) => !c.ok);
  io.out(failed.length === 0 ? `smoke passed (${checks.length} checks)` : `smoke failed: ${failed.length} of ${checks.length} checks`);
  return failed.length === 0 ? 0 : 1;
}

/** `pnpm fixtures:record`. Exit 0 when every fixture was written or the key is missing. */
export async function recordMain(argv: readonly string[], io: LiveIo): Promise<number> {
  const p = parse("fixtures:record", argv, io);
  if (typeof p === "number") return p;
  if (p.apiKey === null) {
    io.out(`fixtures:record skipped: ${p.envName} is not set, so no ${p.provider} fixture was recorded. The committed fixtures are unchanged.`);
    return 0;
  }
  const profiles = io.profiles ?? SEED_MODEL_PROFILES;
  const routes = io.routes ?? SEED_MODEL_ROUTES;
  let targets;
  try {
    targets = planRecording(io.fixtures ?? loadBundledFixtures(), p.provider, profiles, routes, p.model);
  } catch (e) {
    if (e instanceof RecordPlanError) {
      io.err(`fixtures:record: ${e.message}`);
      return 2;
    }
    throw e;
  }
  const openapiVersion = await (io.fetchOpenapiVersion ?? liveOpenapiVersion)();
  const write =
    io.write ??
    ((path: string, fixture: Fixture): void => {
      const full = join(BUNDLED_FIXTURES_DIR, path);
      mkdirSync(dirname(full), { recursive: true });
      writeFileSync(full, `${JSON.stringify(fixture, null, 2)}\n`);
    });
  const outcome = await recordFixtures(targets, { provider: p.provider, apiKey: p.apiKey, transport: io.transport ?? new SdkTransport(), openapiVersion, write });
  for (const w of outcome.written) io.out(`wrote fixtures/${w}`);
  for (const f of outcome.failed) io.err(`failed ${f.name}: ${f.reason}`);
  io.out(`recorded ${outcome.written.length} of ${targets.length} fixtures on ${p.provider} against openapi.json ${openapiVersion}. Error fixtures stay hand-authored.`);
  return outcome.failed.length === 0 ? 0 : 1;
}
