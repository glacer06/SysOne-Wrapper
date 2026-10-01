import { OperationPage } from "~/components/shell/operation-page";

export default function ApprovalsPage() {
  return (
    <OperationPage
      title="Approvals"
      description="High-risk changes an agent asked for. Nothing runs until a person approves it."
      operation="approval.list"
      coming={<>Pending agent requests with the exact change, who asked and why, and approve or reject. Moves toward safety never wait here.</>}
      empty={{
        title: "No requests waiting",
        body: <>When an agent token asks to publish, promote or widen a rollout, the request waits here for you.</>,
      }}
    />
  );
}
