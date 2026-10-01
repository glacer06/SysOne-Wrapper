import Link from "next/link";

import { EmptyState } from "~/components/ui";

export default function SetNotFound() {
  return (
    <EmptyState
      title="No such set"
      action={
        <Link href="/sets" className="bw-hit text-sm text-bw-text underline underline-offset-2">
          Back to all sets
        </Link>
      }
    >
      There is no set with this slug in your org, or it was archived.
    </EmptyState>
  );
}
