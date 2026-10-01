import { OperationPage } from "~/components/shell/operation-page";

export default function SetsPage() {
  return (
    <OperationPage
      title="Sets"
      description="Question sets, their versions, and where each channel stands in rollout."
      operation="set.list"
      coming={
        <>
          The set list with each channel&apos;s version and rollout stage, a question editor with a form and a JSON view,
          threshold sliders with a live preview on sample state, and publish, history and one-click rollback. Each calls
          the same operation as the CLI.
        </>
      }
      empty={{
        title: "No sets yet",
        body: <>Push a spec from the repo with the CLI, or create a set here once the editor lands.</>,
      }}
    />
  );
}
