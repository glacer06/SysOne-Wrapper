import { OperationPage } from "~/components/shell/operation-page";

export default function RunsPage() {
  return (
    <OperationPage
      title="Runs"
      description="Every run of every set: the band, the action taken, latency and cost."
      operation="run.list"
      coming={<>A runs explorer filtered by set, version, channel, band and action, with each run&apos;s answers and confidence.</>}
      cli="pnpm bandwise report --since 7d"
      empty={{
        title: "No runs yet",
        body: <>Runs show up here once a hook or an app calls a set on app.bandwise.dev with a Bandwise token.</>,
      }}
    />
  );
}
