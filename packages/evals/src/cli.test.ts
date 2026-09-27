import { cpSync, mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sequentialIds, steppingClock } from "@bandwise/core";
import { describe, expect, it } from "vitest";
import { DEFAULT_DATA_DIR, main } from "./cli.js";
import { offlineTransport } from "./ports.js";

function io(env: Record<string, string | undefined> = {}) {
  const out: string[] = [];
  const err: string[] = [];
  return { out, err, io: { out: (l: string) => out.push(l), err: (l: string) => err.push(l), env, now: steppingClock(), newId: sequentialIds() } };
}

function dataCopy(): string {
  const dir = mkdtempSync(join(tmpdir(), "bandwise-evals-"));
  cpSync(DEFAULT_DATA_DIR, dir, { recursive: true, filter: (src) => !/[\\/](snapshots|eval-runs)([\\/]|$)/.test(src) });
  return dir;
}

const BASE = ["--org", "demo", "--set", "ticket-routing", "--version", "1", "--dataset", "tickets"];

describe("pnpm eval", () => {
  it("runs the demo offline with no key and prints the report", async () => {
    const data = dataCopy();
    const t = io();
    expect(await main([...BASE, "--data", data], t.io)).toBe(0);
    const text = t.out.join("\n");
    expect(text).toContain("demo/ticket-routing@1 on jev-1.13.0 (typesafe, fixture)");
    expect(text).toContain("12 cases");
    expect(text).toMatch(/high\s+n=/);
    expect(text).toContain("reliability (gating)");
    expect(text).toContain("confusion (rows expected, columns predicted)");
    expect(text).toMatch(/latency: p50 \d+ ms, p95 \d+ ms/);
    expect(text).toContain("synthetic answers");
    expect(readdirSync(join(data, "demo", "snapshots"))).toHaveLength(1);
    expect(readdirSync(join(data, "demo", "eval-runs"))).toHaveLength(1);
  });

  it("prints JSON with the model and snapshot, and reuses --snapshot", async () => {
    const data = dataCopy();
    const a = io();
    expect(await main([...BASE, "--data", data, "--json"], a.io)).toBe(0);
    const first = JSON.parse(a.out.join("\n")) as { record: { snapshotId: string; model: string }; metrics: { cases: number } };
    expect(first.metrics.cases).toBe(12);
    const b = io();
    expect(await main([...BASE, "--data", data, "--json", "--snapshot", first.record.snapshotId, "--model", "jev-latest", "--repeats", "3"], b.io)).toBe(0);
    const second = JSON.parse(b.out.join("\n")) as { record: { snapshotId: string; model: string; repeats: number } };
    expect(second.record).toMatchObject({ snapshotId: first.record.snapshotId, model: "jev-latest", repeats: 3 });
  });

  it("runs on openrouter fixtures", async () => {
    const t = io();
    expect(await main([...BASE, "--data", dataCopy(), "--provider", "openrouter", "--json"], t.io)).toBe(0);
    const r = JSON.parse(t.out.join("\n")) as { record: { provider: string }; metrics: { okRuns: number } };
    expect(r.record.provider).toBe("openrouter");
    expect(r.metrics.okRuns).toBe(12);
  });

  it("needs the provider key for the live transport, and uses it when set", async () => {
    const missing = io();
    expect(await main([...BASE, "--transport", "sdk"], missing.io)).toBe(2);
    expect(missing.err[0]).toContain("TYPESAFE_API_KEY");
    const orMissing = io({ SYSTEM_ONE_TRANSPORT: "sdk" });
    expect(await main([...BASE, "--provider", "openrouter"], orMissing.io)).toBe(2);
    expect(orMissing.err[0]).toContain("OPENROUTER_API_KEY");

    // With a key, the live path runs. The transport is swapped for fixtures so the test stays offline.
    const live = io({ TYPESAFE_API_KEY: "sk-test" });
    expect(await main([...BASE, "--data", dataCopy(), "--transport", "sdk", "--json"], { ...live.io, transport: offlineTransport() })).toBe(0);
    expect(JSON.parse(live.out.join("\n")).record.transport).toBe("sdk");
  });

  it("rejects bad flags with exit code 2", async () => {
    for (const args of [[], [...BASE, "--provider", "cloudflare"], [...BASE, "--version", "zero"], [...BASE, "--bogus"], [...BASE, "--transport", "http"]]) {
      const t = io();
      expect(await main(args, t.io)).toBe(2);
      expect(t.err.join("\n")).toContain("usage: pnpm eval");
    }
    const unknownSet = io();
    expect(await main(["--org", "demo", "--set", "nope", "--version", "1", "--dataset", "tickets"], unknownSet.io)).toBe(2);
    const help = io();
    expect(await main(["--help"], help.io)).toBe(0);
  });
});
