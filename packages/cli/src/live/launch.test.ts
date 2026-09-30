import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { main } from "../main.js";
import { readReceipts } from "../receipts/index.js";
import { type LaunchCommand, loadProfiles, parseProfiles, runLaunchPrint } from "./index.js";
import { liveTransport } from "./transport.js";

const at = (relative: string): string => fileURLToPath(new URL(relative, import.meta.url));
const SET = at("../../../../.bandwise/sets/launch-profile.json");
const PROFILES = at("../../../../.bandwise/profiles.json");
const KEY = "ts_test_key_for_unit_tests_only_0000";
const ENV = { TYPESAFE_API_KEY: KEY };
const tmp = (): string => mkdtempSync(join(tmpdir(), "bandwise-launch-"));

const OPTIONS = ["light", "standard", "deep", "deep_review", "unclear"];

/** A fetch that answers the launch-profile set with `choice` at `confidence`. */
function answering(choice: string, confidence: number, opts: { delayMs?: number } = {}) {
  const sent: Array<{ state: Record<string, unknown> }> = [];
  const fetch = async (_input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    sent.push(JSON.parse(String(init?.body)) as { state: Record<string, unknown> });
    if (opts.delayMs !== undefined) {
      await new Promise((resolve, reject) => {
        const t = setTimeout(resolve, opts.delayMs);
        init?.signal?.addEventListener("abort", () => {
          clearTimeout(t);
          reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
        });
      });
    }
    const rest = (1 - confidence) / (OPTIONS.length - 1);
    const probabilities = Object.fromEntries(OPTIONS.map((o) => [o, o === choice ? confidence : rest]));
    const body = { model: "jev-1.13.0", answers: { profile: { type: "choice", choice, confidence, probabilities } }, usage: { input_tokens: 300, output_tokens: 20 } };
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json", "x-typesafe-request-id": "req_unit" } });
  };
  return { fetch, sent };
}

const cmd = (over: Partial<LaunchCommand> = {}): LaunchCommand => ({
  setPath: SET,
  profilesPath: PROFILES,
  rollout: "shadow",
  provider: "typesafe",
  // Generous, so a loaded test machine never turns a normal answer into a fallback. The timeout
  // test sets its own.
  timeoutMs: 20_000,
  receiptsPath: join(tmp(), "r.jsonl"),
  task: "Debug why sign-ins fail after the token refresh in production.",
  ...over,
});

describe("the profiles file", () => {
  it("accepts the reviewed file in this repo", () => {
    const p = loadProfiles(PROFILES);
    expect(p.ok && p.value.default).toBe("standard");
    expect(p.ok && Object.keys(p.value.profiles).sort()).toEqual(["deep", "deep_review", "light", "standard"]);
  });

  it("refuses anything but a program, a default and model plus effort per session, naming the field", () => {
    const good = { program: "claude", default: "a", profiles: { a: { sessions: [{ model: "sonnet", effort: "medium" }] } } };
    const field = (raw: unknown): string | null => {
      const r = parseProfiles(raw);
      return r.ok ? null : r.field;
    };
    expect(field(good)).toBeNull();
    expect(field({ ...good, command: "rm -rf /" })).toBe("command");
    expect(field({ ...good, program: "bash" })).toBe("program");
    expect(field({ ...good, default: "b" })).toBe("default");
    expect(field({ ...good, profiles: { "a b": good.profiles.a } })).toBe("profiles.a b");
    expect(field({ ...good, profiles: { a: { sessions: [], flags: "--x" } } })).toBe("profiles.a.flags");
    expect(field({ ...good, profiles: { a: { sessions: [] } } })).toBe("profiles.a.sessions");
    const s = { model: "sonnet", effort: "medium" };
    expect(field({ ...good, profiles: { a: { sessions: [s, s, s] } } })).toBe("profiles.a.sessions");
    expect(field({ ...good, profiles: { a: { sessions: [{ ...s, effort: "ultra" }] } } })).toBe("profiles.a.sessions[0].effort");
    expect(field({ ...good, profiles: { a: { sessions: [{ ...s, model: "sonnet --dangerously-skip-permissions" }] } } })).toBe("profiles.a.sessions[0].model");
    expect(field({ ...good, profiles: { a: { sessions: [{ ...s, permissionMode: "bypass" }] } } })).toBe("profiles.a.sessions[0].permissionMode");
  });
});

describe("bandwise launch --print", () => {
  it("in shadow prints the default and records what the set picked, never the task", async () => {
    const { fetch, sent } = answering("deep", 0.95);
    const c = cmd();
    const out = await runLaunchPrint(c, { env: ENV, transport: () => liveTransport({ fetch }) });
    expect(out.exitCode).toBe(0);
    expect(JSON.parse(out.stdout)).toEqual({ profile: "standard", sessions: [{ model: "sonnet", effort: "medium" }], picked: "deep", rollout: "shadow" });
    expect(out.stderr).toBe("");
    expect(sent[0]?.state).toEqual({ task: c.task });
    const { receipts } = readReceipts(c.receiptsPath);
    expect(receipts[0]).toMatchObject({ set: "launch-profile", source: "launch", rollout: "shadow", acted: false, launch: { profile: "standard", picked: "deep" } });
    expect(readFileSync(c.receiptsPath, "utf8")).not.toContain("sign-ins");
  });

  it("in controlled uses a high band pick, and only that", async () => {
    const high = await runLaunchPrint(cmd({ rollout: "controlled" }), { env: ENV, transport: () => liveTransport({ fetch: answering("deep_review", 0.95).fetch }) });
    expect(JSON.parse(high.stdout)).toEqual({
      profile: "deep_review",
      sessions: [
        { model: "opus", effort: "high" },
        { model: "sonnet", effort: "medium" },
      ],
      picked: "deep_review",
      rollout: "controlled",
    });
    const medium = await runLaunchPrint(cmd({ rollout: "controlled" }), { env: ENV, transport: () => liveTransport({ fetch: answering("deep", 0.55).fetch }) });
    expect(JSON.parse(medium.stdout)).toMatchObject({ profile: "standard", picked: "deep" });
    // light needs a higher bar than the other options.
    const light = await runLaunchPrint(cmd({ rollout: "controlled" }), { env: ENV, transport: () => liveTransport({ fetch: answering("light", 0.75).fetch }) });
    expect(JSON.parse(light.stdout)).toMatchObject({ profile: "standard", picked: "light" });
  });

  it("treats an answer that is not a profile id as no pick", async () => {
    const out = await runLaunchPrint(cmd({ rollout: "controlled" }), { env: ENV, transport: () => liveTransport({ fetch: answering("unclear", 0.95).fetch }) });
    expect(JSON.parse(out.stdout)).toMatchObject({ profile: "standard", picked: null });
  });

  it("sends the task through the same redaction as the hooks", async () => {
    const { fetch, sent } = answering("standard", 0.9);
    const secret = ["sk-", "ant-", "abcdefghijklmnopqrstuvwxyz0123456789"].join("");
    await runLaunchPrint(cmd({ task: `Rotate the key ${secret} in the config` }), { env: ENV, transport: () => liveTransport({ fetch }) });
    expect(JSON.stringify(sent[0]?.state)).not.toContain(secret);
  });

  it("falls back to the default, and says why, with no key, no task, a bad set or a timeout", async () => {
    const none = answering("deep", 0.95);
    const noKey = await runLaunchPrint(cmd({ rollout: "controlled" }), { env: {}, transport: () => liveTransport({ fetch: none.fetch }) });
    expect(JSON.parse(noKey.stdout)).toMatchObject({ profile: "standard", picked: null });
    expect(noKey.stderr).toBe('bandwise launch: TYPESAFE_API_KEY is not set; using the default profile "standard".');
    expect(none.sent).toHaveLength(0);

    const empty = await runLaunchPrint(cmd({ task: "  " }), { env: ENV, transport: () => liveTransport({ fetch: none.fetch }) });
    expect(empty.stderr).toContain("no task was given");

    const badSet = await runLaunchPrint(cmd({ setPath: join(tmp(), "missing.json") }), { env: ENV, transport: () => liveTransport({ fetch: none.fetch }) });
    expect(badSet.exitCode).toBe(0);
    expect(badSet.stderr).toContain("could not be loaded");

    const c = cmd({ rollout: "controlled", timeoutMs: 100 });
    const slow = await runLaunchPrint(c, { env: ENV, transport: () => liveTransport({ fetch: answering("deep", 0.95, { delayMs: 2000 }).fetch }) });
    expect(JSON.parse(slow.stdout)).toMatchObject({ profile: "standard" });
    expect(slow.stderr).toContain("did not answer within 100 ms");
    expect(readReceipts(c.receiptsPath).receipts[0]).toMatchObject({ status: "timeout", launch: { profile: "standard", picked: null } });
  });

  it("refuses an invalid profiles file, naming the field", async () => {
    const path = join(tmp(), "profiles.json");
    writeFileSync(path, JSON.stringify({ program: "claude", default: "a", profiles: { a: { sessions: [{ model: "sonnet", effort: "ultra" }] } } }));
    const out = await runLaunchPrint(cmd({ profilesPath: path }), { env: ENV, transport: () => liveTransport({ fetch: answering("deep", 0.95).fetch }) });
    expect(out).toMatchObject({ exitCode: 1, stdout: "" });
    expect(out.stderr).toContain("profiles.a.sessions[0].effort");
  });

  it("from the command line: --print only, the task from --task or stdin", async () => {
    const noPrint = await main(["launch", "--task", "x"]);
    expect(noPrint.exitCode).toBe(1);
    expect(noPrint.stderr).toContain("only bandwise launch --print");

    const base = ["launch", "--print", "--set", SET, "--profiles", PROFILES, "--rollout", "controlled", "--timeout-ms", "20000", "--receipts", join(tmp(), "r.jsonl")];
    const flag = await main([...base, "--task", "Rename foo to bar everywhere"], { env: ENV, fetch: answering("light", 0.95).fetch });
    expect(JSON.parse(flag.stdout)).toMatchObject({ profile: "light", sessions: [{ model: "sonnet", effort: "low" }] });

    const piped = answering("deep", 0.95);
    const stdin = await main(base, { env: ENV, fetch: piped.fetch, stdin: async () => "Design the new billing schema" });
    expect(JSON.parse(stdin.stdout)).toMatchObject({ profile: "deep" });
    expect(piped.sent[0]?.state).toEqual({ task: "Design the new billing schema" });
  });

  it("prints the default when live mode cannot load", async () => {
    const out = await main(["launch", "--print", "--profiles", PROFILES, "--task", "x"], {
      loadLive: async () => {
        throw new Error("Cannot find package '@typesafe-ai/sdk'");
      },
    });
    expect(out.exitCode).toBe(0);
    expect(JSON.parse(out.stdout)).toMatchObject({ profile: "standard", picked: null });
    expect(out.stderr).toContain("live mode could not load");
  });
});
