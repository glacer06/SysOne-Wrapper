// The committed TypeSafe contract snapshots (testing.md, Contract watch; system-one-models.md
// section 6). The nightly contract watch diffs the live documents against these; re-snapshot them
// in the PR that adapts to a change.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/** packages/system-one-client/contract (src/ and dist/ both sit one level below the package). */
export const CONTRACT_SNAPSHOT_DIR = fileURLToPath(new URL("../contract/", import.meta.url));

/** Where each watched document lives, and its snapshot file. */
export const CONTRACT_SOURCES = {
  openapi: { url: "https://api.typesafe.ai/openapi.json", file: "typesafe-openapi.json" },
  llms_txt: { url: "https://docs.typesafe.ai/llms.txt", file: "typesafe-llms.txt" },
  models_md: { url: "https://docs.typesafe.ai/models.md", file: "typesafe-models.md" },
} as const;

export type ContractSource = keyof typeof CONTRACT_SOURCES;

/** The snapshot text of each watched document. */
export function loadContractSnapshots(dir: string = CONTRACT_SNAPSHOT_DIR): Record<ContractSource, string> {
  const read = (s: ContractSource): string => readFileSync(join(dir, CONTRACT_SOURCES[s].file), "utf8");
  return { openapi: read("openapi"), llms_txt: read("llms_txt"), models_md: read("models_md") };
}
