import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { OperationFailed } from "~/components/shell/operation-failed";
import { PageHeader } from "~/components/ui";
import { consoleOperation } from "~/server/console-operation";

import { SetHeader } from "../../_components/set-header";
import { ReleasesPanel } from "./panel";

export const metadata: Metadata = { title: "Releases · Bandwise console" };

export default async function ReleasesPage({ params }: { params: Promise<{ ref: string }> }) {
  const setRef = decodeURIComponent((await params).ref);
  const set = await consoleOperation("set.get", { ref: setRef });
  if (set.status === "error" && (set.code === "not_found" || set.code === "invalid_request")) notFound();
  if (set.status !== "ok") {
    return (
      <>
        <PageHeader crumbs={[{ href: "/sets", label: "Sets" }]} title={setRef} />
        <OperationFailed message={set.status === "error" ? set.message : "The set could not load."} />
      </>
    );
  }
  return (
    <>
      <SetHeader set={set.output} />
      <p className="mb-6 max-w-prose text-sm text-bw-text-muted">Publish the draft, move a channel through rollout, and roll back when something looks wrong.</p>
      <ReleasesPanel setRef={setRef} set={set.output} />
    </>
  );
}
