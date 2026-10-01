"use client";

import { RouteError } from "~/components/observe/route-error";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <RouteError title="Review" error={error} reset={reset} />;
}
