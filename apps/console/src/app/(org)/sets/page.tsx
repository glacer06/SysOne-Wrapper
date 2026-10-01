import { OperationFailed } from "~/components/shell/operation-failed";
import { PageHeader } from "~/components/ui";
import { consoleOperation } from "~/server/console-operation";

import { SetsOverview } from "./_components/sets-overview";
import { parseFilter, type SetRow } from "./_components/sets-summary";

export const dynamic = "force-dynamic";

const DAY_MS = 86_400_000;

export default async function SetsPage({ searchParams }: { searchParams: Promise<{ show?: string | string[] }> }) {
  const filter = parseFilter((await searchParams).show);
  const now = new Date();
  const [sets, usage, reviews] = await Promise.all([
    consoleOperation("set.list", { limit: 200 }),
    consoleOperation("usage.get", { from: new Date(now.getTime() - DAY_MS).toISOString(), to: now.toISOString() }),
    consoleOperation("review.list", { status: "open", limit: 200 }),
  ]);
  if (sets.status !== "ok") {
    return (
      <>
        <PageHeader title="Sets" />
        <OperationFailed message={sets.status === "error" ? sets.message : "The set list is not available yet."} />
      </>
    );
  }
  const list = sets.output.data;
  // One newest run per set. D2 has a handful of sets, so a call each is cheap and exact.
  const lastRuns = await Promise.all(
    list.map(async (s) => {
      const r = await consoleOperation("run.list", { set: s.id, limit: 1 });
      const run = r.status === "ok" ? r.output.data[0] : undefined;
      return run === undefined ? null : { at: run.createdAt, band: run.runBand };
    }),
  );
  const spend = new Map(usage.status === "ok" ? usage.output.sets.map((u) => [u.setId, u] as const) : []);
  const open = new Map<string, number>();
  if (reviews.status === "ok") for (const r of reviews.output.data) open.set(r.setId, (open.get(r.setId) ?? 0) + 1);

  const rows: SetRow[] = list.map((s, i) => {
    const channel = (c: "production" | "staging") => {
      const p = s.channels.find((x) => x.channel === c);
      return p === undefined ? null : { version: p.version, stage: p.stage };
    };
    const u = spend.get(s.id);
    return {
      slug: s.slug,
      name: s.name,
      production: channel("production"),
      staging: channel("staging"),
      draft: s.draft?.version ?? null,
      openReviews: open.get(s.id) ?? 0,
      spend24hMicroUsd: u?.systemOneCostMicroUsd ?? 0,
      runs24h: u?.runs ?? 0,
      lastRun: lastRuns[i] ?? null,
    };
  });

  return (
    <>
      <PageHeader title="Sets" />
      <SetsOverview rows={rows} filter={filter} now={now} />
    </>
  );
}
