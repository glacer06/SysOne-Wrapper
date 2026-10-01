import { notFound } from "next/navigation";

import { OperationFailed } from "~/components/shell/operation-failed";
import { EmptyState, PageHeader } from "~/components/ui";
import { requireConsole } from "~/server/auth/console";
import { consoleOperation } from "~/server/console-operation";
import { usesFixtureTransport } from "~/server/run/deps";

import { SetHeader } from "../_components/set-header";
import { DraftEditor } from "./editor/draft-editor";
import { collectScores, type RecentScores } from "./editor/recent-scores";
import { type Finding, listQuestions, type Spec } from "./editor/spec-edit";

export const dynamic = "force-dynamic";

const EDIT_ROLES = new Set(["owner", "admin", "editor"]);
/** How many recent runs the rulers plot. Each one is a run.get, so the number stays small until a scores read lands. */
const PLOTTED_RUNS = 40;

export default async function SetPage({ params }: { params: Promise<{ ref: string }> }) {
  const ref = decodeURIComponent((await params).ref);
  const { ctx } = await requireConsole();
  const set = await consoleOperation("set.get", { ref });
  if (set.status === "error" && (set.code === "not_found" || set.code === "invalid_request")) notFound();
  if (set.status !== "ok") {
    return (
      <>
        <PageHeader crumbs={[{ href: "/sets", label: "Sets" }]} title={ref} />
        <OperationFailed message={set.status === "error" ? set.message : "This set is not available yet."} />
      </>
    );
  }
  const s = set.output;
  const header = <SetHeader set={s} />;

  if (s.draft === null) {
    return (
      <>
        {header}
        <EmptyState title="No open draft">
          Every published version is immutable, so edits start from a draft. Push a spec with{" "}
          <code className="font-mono text-xs">bandwise spec push {s.slug}</code> to open one.
        </EmptyState>
      </>
    );
  }

  const [draft, lint, runs] = await Promise.all([
    consoleOperation("draft.get", { ref: s.id }),
    consoleOperation("draft.validate", { ref: s.id }),
    consoleOperation("run.list", { set: s.id, limit: PLOTTED_RUNS }),
  ]);
  if (draft.status !== "ok") {
    return (
      <>
        {header}
        <OperationFailed message={draft.status === "error" ? draft.message : "The draft is not available yet."} />
      </>
    );
  }
  const findings: Finding[] | null = lint.status === "ok" ? [...lint.output.errors, ...lint.output.warnings] : null;
  const recentRuns =
    runs.status === "ok" ? runs.output.data.slice(0, 8).map((r) => ({ id: r.id, createdAt: r.createdAt, runBand: r.runBand, source: r.source, status: r.status })) : [];

  // The rulers plot the answers of recent runs (run.get, as the Runs page reads them) and compare
  // the draft with what production serves, or staging when production has nothing yet.
  const serving = s.channels.find((c) => c.channel === "production") ?? s.channels.find((c) => c.channel === "staging");
  const [details, version] = await Promise.all([
    runs.status === "ok" ? Promise.all(runs.output.data.map((r) => consoleOperation("run.get", { id: r.id }))) : Promise.resolve(null),
    serving === undefined ? Promise.resolve(null) : consoleOperation("version.get", { ref: s.id, n: serving.version }),
  ]);
  const recentScores: RecentScores | null =
    details === null ? null : collectScores(details.flatMap((d) => (d.status === "ok" ? [d.output.answers] : [])), listQuestions(draft.output));
  const published: { label: string; spec: Spec } | null =
    serving !== undefined && version !== null && version.status === "ok" && "spec" in version.output ? { label: `v${serving.version}`, spec: version.output.spec } : null;

  return (
    <>
      {header}
      <DraftEditor
        slug={s.slug}
        draftVersion={s.draft.version}
        initialSpec={draft.output}
        initialEtag={draft.etag ?? s.draft.etag}
        initialFindings={findings}
        canEdit={ctx.actor.type === "user" && EDIT_ROLES.has(ctx.actor.role)}
        recentRuns={recentRuns}
        synthetic={usesFixtureTransport()}
        recentScores={recentScores}
        published={published}
      />
    </>
  );
}
