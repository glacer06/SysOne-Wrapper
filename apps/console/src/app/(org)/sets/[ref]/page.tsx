import Link from "next/link";
import { notFound } from "next/navigation";

import { OperationFailed } from "~/components/shell/coming-soon";
import { EmptyState, PageHeader } from "~/components/ui";
import { requireConsole } from "~/server/auth/console";
import { consoleOperation } from "~/server/console-operation";
import { usesFixtureTransport } from "~/server/run/deps";

import { ChannelStages } from "../_components/channel-stages";
import { DraftEditor } from "./editor/draft-editor";
import type { Finding } from "./editor/spec-edit";

export const dynamic = "force-dynamic";

const EDIT_ROLES = new Set(["owner", "admin", "editor"]);

export default async function SetPage({ params }: { params: Promise<{ ref: string }> }) {
  const ref = decodeURIComponent((await params).ref);
  const { ctx } = await requireConsole();
  const set = await consoleOperation("set.get", { ref });
  if (set.status === "error" && (set.code === "not_found" || set.code === "invalid_request")) notFound();
  if (set.status !== "ok") {
    return (
      <>
        <PageHeader title={ref} />
        <OperationFailed message={set.status === "error" ? set.message : "This set is not available yet."} />
      </>
    );
  }
  const s = set.output;
  const back = (
    <Link href="/sets" className="text-sm text-ink-2 underline-offset-2 hover:text-ink hover:underline">
      All sets
    </Link>
  );
  const header = (
    <>
      <PageHeader
        title={s.name}
        description={
          <>
            <span className="font-mono">{s.slug}</span>
            {s.draft === null ? "" : `, draft v${s.draft.version}`}
            {s.description === null ? null : <span className="mt-1 block">{s.description}</span>}
          </>
        }
        actions={back}
      />
      <div className="mb-6 rounded-md border border-rule bg-paper-raised px-5 py-3">
        <ChannelStages channels={s.channels} />
      </div>
    </>
  );

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
    consoleOperation("run.list", { set: s.id, limit: 8 }),
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
    runs.status === "ok" ? runs.output.data.map((r) => ({ id: r.id, createdAt: r.createdAt, runBand: r.runBand, source: r.source, status: r.status })) : [];

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
      />
    </>
  );
}
