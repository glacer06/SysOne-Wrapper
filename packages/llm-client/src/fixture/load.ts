// Loading LLM fixtures from disk. The bundled set lives in packages/llm-client/fixtures.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { LlmFixture } from "./fixture.js";

/** The bundled fixtures folder (src/fixture and dist/fixture both sit two levels below the package). */
export const BUNDLED_LLM_FIXTURES_DIR = fileURLToPath(new URL("../../fixtures/", import.meta.url));

/** Every `*.json` fixture under `dir`, recursively, validated. */
export function loadLlmFixturesFromDir(dir: string): LlmFixture[] {
  const out: LlmFixture[] = [];
  for (const entry of readdirSync(dir).sort()) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      out.push(...loadLlmFixturesFromDir(path));
      continue;
    }
    if (!entry.endsWith(".json")) continue;
    const parsed = LlmFixture.safeParse(JSON.parse(readFileSync(path, "utf8")));
    if (!parsed.success) throw new Error(`invalid LLM fixture ${path}: ${parsed.error.issues.map((i) => i.message).join("; ")}`);
    out.push(parsed.data);
  }
  return out;
}

/** The fixtures that ship with this package. */
export function loadBundledLlmFixtures(): LlmFixture[] {
  return loadLlmFixturesFromDir(BUNDLED_LLM_FIXTURES_DIR);
}
