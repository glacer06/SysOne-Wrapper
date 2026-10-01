import { notFound } from "next/navigation";

import { loadSets } from "~/components/observe/sets";
import { loadSpecs } from "~/components/observe/specs";
import { OperationFailed } from "~/components/shell/operation-failed";
import { PageHeader } from "~/components/ui";
import { consoleOperation } from "~/server/console-operation";
import type { RunDetail } from "~/server/operations/views";

import { RunDetailView } from "./run-detail";

export default async function RunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [sets, res] = await Promise.all([loadSets(), consoleOperation("run.get", { id })]);
  // A mistyped or truncated id, or a run this org does not have: the not-found page, not an error.
  if (res.status === "error" && (res.code === "not_found" || res.code === "invalid_request")) notFound();
  if (res.status !== "ok") {
    return (
      <>
        <PageHeader crumbs={[{ href: "/runs", label: "Runs" }]} title="Run" />
        <OperationFailed message={res.status === "error" ? res.message : "Runs are not served yet."} />
      </>
    );
  }
  const run = res.output as RunDetail;
  // The ruler draws the lines of the version this run used, read through version.get.
  const specs = await loadSpecs([run], sets);
  return <RunDetailView run={run} sets={sets} spec={specs.get(run.versionId) ?? null} />;
}
