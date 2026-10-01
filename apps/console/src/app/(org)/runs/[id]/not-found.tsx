import Link from "next/link";

import { EmptyState } from "~/components/ui";

export default function RunNotFound() {
  return (
    <EmptyState
      title="No such run"
      action={
        <Link href="/runs" className="bw-hit text-sm text-bw-text underline underline-offset-2">
          Back to all runs
        </Link>
      }
    >
      There is no run with this id in your org. Check the id, or find the run in the list.
    </EmptyState>
  );
}
