"use client";

import { RouteError } from "~/components/observe/route-error";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <RouteError title="Savings" error={error} reset={reset} />;
}
