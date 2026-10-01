"use client";

import { RouteError } from "~/components/shell/route-error";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <RouteError title="Approvals" error={error} reset={reset} />;
}
