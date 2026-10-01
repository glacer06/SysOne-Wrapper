import { OperationPage } from "~/components/shell/operation-page";

export default function SavingsPage() {
  return (
    <OperationPage
      title="Savings"
      description="What System One cost per set, and what the same decisions would have cost on an LLM."
      operation="usage.get"
      coming={<>Spend, estimated savings and LLM calls avoided per set and per day, from the savings ledger.</>}
      cli="pnpm bandwise report --since 7d"
      empty={{
        title: "Nothing to count yet",
        body: <>Savings add up from hosted runs. The first run of a set starts its ledger.</>,
      }}
    />
  );
}
