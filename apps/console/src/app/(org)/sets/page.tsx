import Link from "next/link";

import { formatWhen } from "~/components/format";
import { OperationFailed } from "~/components/shell/operation-failed";
import { EmptyState, PageHeader, Table, Td, Th } from "~/components/ui";
import { consoleOperation } from "~/server/console-operation";

import { ChannelStage } from "./_components/channel-stages";

export const dynamic = "force-dynamic";

const DESCRIPTION = "Question sets, the version each channel serves, and where each channel stands in rollout.";

export default async function SetsPage() {
  const sets = await consoleOperation("set.list", { limit: 200 });
  if (sets.status !== "ok") {
    return (
      <>
        <PageHeader title="Sets" description={DESCRIPTION} />
        <OperationFailed message={sets.status === "error" ? sets.message : "The set list is not available yet."} />
      </>
    );
  }
  const rows = sets.output.data;
  const now = new Date();
  // One newest run per set. D2 has a handful of sets, so a call each is cheap and exact.
  const lastRuns = await Promise.all(
    rows.map(async (s) => {
      const r = await consoleOperation("run.list", { set: s.id, limit: 1 });
      return r.status === "ok" ? (r.output.data[0]?.createdAt ?? null) : null;
    }),
  );

  return (
    <>
      <PageHeader title="Sets" description={DESCRIPTION} />
      {rows.length === 0 ? (
        <EmptyState title="No sets yet">
          Push a spec from the repo with <code className="font-mono text-xs">bandwise spec push</code>, or run the
          bootstrap script for the internal org. Each set shows up here with its draft and channels.
        </EmptyState>
      ) : (
        <Table caption="Question sets">
          <thead>
            <tr>
              <Th>Set</Th>
              <Th>Production</Th>
              <Th>Staging</Th>
              <Th>Draft</Th>
              <Th>Last run</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s, i) => {
              const last = lastRuns[i] ?? null;
              return (
                <tr key={s.id} className="hover:bg-bw-surface-sunken">
                  <Td>
                    <Link href={`/sets/${encodeURIComponent(s.slug)}`} className="font-medium text-bw-text underline-offset-2 hover:underline">
                      {s.name}
                    </Link>
                    <div className="font-mono text-xs text-bw-text-muted">{s.slug}</div>
                  </Td>
                  <Td>
                    <ChannelStage channel="production" pointer={s.channels.find((c) => c.channel === "production")} />
                  </Td>
                  <Td>
                    <ChannelStage channel="staging" pointer={s.channels.find((c) => c.channel === "staging")} />
                  </Td>
                  <Td>{s.draft === null ? <span className="text-bw-text-muted">None</span> : <span className="font-mono tabular-nums">v{s.draft.version}</span>}</Td>
                  <Td>
                    {last === null ? (
                      <span className="text-bw-text-muted">No runs yet</span>
                    ) : (
                      <time dateTime={last} title={last}>
                        {formatWhen(last, now)}
                      </time>
                    )}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
    </>
  );
}
