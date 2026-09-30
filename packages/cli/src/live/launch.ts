// `bandwise launch --print` (ADR-020 Amendment 1): run the launch-profile set on a task and print
// the profile to start the agent with. It starts nothing. Hosts that start their own sessions (the
// Agent SDK, CI, cloud sessions) read the JSON.
//
// The set can only pick a profile id from the reviewed profiles file. In shadow the default is
// always used and the receipt records the pick. Any Bandwise problem (no key, a set that will not
// load, an error, a timeout) prints the default and one line on stderr saying so. The one refusal is
// a profiles file that breaks its schema, because that means the reviewed file is wrong.

import type { SystemOneProvider, SystemOneTransport } from "@bandwise/core";
import type { CommandOutput } from "../main.js";
import { type Receipt, appendReceipt, specHash } from "../receipts/index.js";
import { loadSpec } from "../runner/index.js";
import { readProviderKey } from "./key.js";
import { type LaunchSession, type Profiles, launchFallback, loadProfiles } from "./profiles.js";
import { failureReceipt } from "./receipt-from-result.js";
import { shapeState } from "./redact.js";
import { runLiveSpec, setSlug } from "./run-live.js";

/** The question in the launch-profile set whose answer is a profile id. */
export const LAUNCH_QUESTION = "profile";

export const LAUNCH_ROLLOUTS = ["shadow", "controlled", "full"] as const;
export type LaunchRollout = (typeof LAUNCH_ROLLOUTS)[number];

export const DEFAULT_LAUNCH_TIMEOUT_MS = 3_000;

export interface LaunchCommand {
  setPath: string;
  profilesPath: string;
  rollout: LaunchRollout;
  provider: SystemOneProvider;
  timeoutMs: number;
  receiptsPath: string;
  task: string;
}

export interface LaunchDeps {
  env?: Readonly<Record<string, string | undefined>>;
  transport: () => SystemOneTransport;
  now?: () => number;
  /** Tests replace the receipt writer. */
  writeReceipt?: (path: string, receipt: Receipt) => void;
}

/** What `--print` writes: the profile to use, its sessions, what the set picked, and the rollout. */
export interface LaunchPick {
  profile: string;
  sessions: LaunchSession[];
  picked: string | null;
  rollout: LaunchRollout;
}

const print = (profiles: Profiles, profile: string, picked: string | null, rollout: LaunchRollout): LaunchPick => ({
  profile,
  sessions: profiles.profiles[profile]?.sessions ?? [],
  picked,
  rollout,
});

/** Run the set on the task and print the profile. Never throws. */
export async function runLaunchPrint(cmd: LaunchCommand, deps: LaunchDeps): Promise<CommandOutput> {
  const profiles = loadProfiles(cmd.profilesPath);
  if (!profiles.ok) return { exitCode: 1, stdout: "", stderr: `error launch_profiles_invalid: ${profiles.message}` };
  const p = profiles.value;
  const fallback = (reason: string): CommandOutput => launchFallback(p, cmd.rollout, reason);

  const key = readProviderKey(cmd.provider, deps.env);
  if (!key.ok) return fallback(`${key.envName} is not set`);
  const loaded = loadSpec(cmd.setPath);
  if (!loaded.ok) return fallback(`the set ${cmd.setPath} could not be loaded (${loaded.code})`);
  if (cmd.task.trim() === "") return fallback("no task was given");

  const now = deps.now ?? Date.now;
  const started = now();
  const write = deps.writeReceipt ?? appendReceipt;
  const meta = { set: setSlug(cmd.setPath), specHash: specHash(loaded.value.text), modelRequested: loaded.value.spec.model };
  const record = (receipt: Receipt, launch: NonNullable<Receipt["launch"]>): void => {
    try {
      write(cmd.receiptsPath, { ...receipt, launch });
    } catch {
      // A receipt that cannot be written never stops a launch.
    }
  };
  const failed = (status: string, reason: string): CommandOutput => {
    record(
      failureReceipt({ ...meta, source: "launch", provider: cmd.provider, at: new Date(now()).toISOString(), acted: false, rollout: cmd.rollout, status, latencyMs: now() - started }),
      { profile: p.default, picked: null },
    );
    return fallback(reason);
  };

  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<"timeout">((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve("timeout");
    }, cmd.timeoutMs);
  });
  try {
    const state = shapeState({ task: cmd.task }, loaded.value.spec.input.schema, []);
    const run = runLiveSpec(
      { spec: loaded.value, set: meta.set, state, provider: cmd.provider, rollout: cmd.rollout, source: "launch", signal: controller.signal },
      { ...(deps.env !== undefined ? { env: deps.env } : {}), transport: deps.transport(), now },
    );
    const outcome = await Promise.race([run, timedOut]);
    if (outcome === "timeout") return failed("timeout", `the set did not answer within ${cmd.timeoutMs} ms`);
    if (!outcome.ok) return failed(outcome.code, `the set failed (${outcome.code})`);
    const decision = outcome.result.decisions[LAUNCH_QUESTION];
    const value = decision?.value;
    // Only a profile id in the reviewed file counts as a pick. `unclear` or anything else is none.
    const picked = typeof value === "string" && Object.hasOwn(p.profiles, value) ? value : null;
    // Core's effective action carries the rollout: never auto in shadow, only the high band in controlled.
    const use = picked !== null && outcome.result.status === "ok" && decision?.effectiveAction === "auto" ? picked : p.default;
    record(outcome.receipt(use !== p.default), { profile: use, picked });
    if (outcome.result.status !== "ok") return fallback(`the set answered with ${outcome.result.error?.code ?? outcome.result.status}`);
    return { exitCode: 0, stdout: JSON.stringify(print(p, use, picked, cmd.rollout)), stderr: "" };
  } catch {
    return failed("error", "the set failed");
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
