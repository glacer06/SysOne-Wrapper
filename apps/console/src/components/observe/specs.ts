// The specs behind runs, so rulers draw each run at the lines of the version it ran on. Read through
// version.list and version.get like any other page read; nothing here touches the database.
import "server-only";

import type { QuestionSetSpec } from "@bandwise/core";

import { consoleOperation } from "~/server/console-operation";
import type { VersionDetail, VersionSummary } from "~/server/operations/views";

import type { SetDirectory } from "./sets";

/** A version's number and its spec. */
export interface RunSpec {
  version: number;
  spec: QuestionSetSpec;
}

/**
 * Specs by version id for the given runs. A version that cannot be read is left out, and the page
 * says the ruler is not drawn rather than guessing a line. Each set's versions are listed once.
 */
export async function loadSpecs(runs: readonly { setId: string; versionId: string }[], sets: SetDirectory): Promise<Map<string, RunSpec>> {
  const wanted = new Map<string, Set<string>>();
  for (const r of runs) {
    const ids = wanted.get(r.setId) ?? new Set<string>();
    ids.add(r.versionId);
    wanted.set(r.setId, ids);
  }
  const out = new Map<string, RunSpec>();
  await Promise.all(
    [...wanted.entries()].map(async ([setId, versionIds]) => {
      const ref = sets.get(setId)?.slug ?? setId;
      const listed = await consoleOperation("version.list", { ref, limit: "200" });
      if (listed.status !== "ok") return;
      const versions = (listed.output as { data: VersionSummary[] }).data.filter((v) => versionIds.has(v.id));
      await Promise.all(
        versions.map(async (v) => {
          const got = await consoleOperation("version.get", { ref, n: v.version });
          if (got.status === "ok" && "spec" in (got.output as object)) out.set(v.id, { version: v.version, spec: (got.output as VersionDetail).spec });
        }),
      );
    }),
  );
  return out;
}
