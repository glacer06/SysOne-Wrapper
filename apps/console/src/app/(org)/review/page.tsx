import { OperationPage } from "~/components/shell/operation-page";

export default function ReviewPage() {
  return (
    <OperationPage
      title="Review"
      description="Medium and low band decisions waiting for a person, and audit samples to label."
      operation="review.list"
      coming={<>A review queue: the state, the answer and its confidence, and one keystroke to agree or correct. Each resolution becomes a labeled case.</>}
      empty={{
        title: "Nothing to review",
        body: <>Decisions land here when a set&apos;s policy sends a band to review. In shadow every decision is logged, none waits.</>,
      }}
    />
  );
}
