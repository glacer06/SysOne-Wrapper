"use client";

import { RouteError } from "~/components/shell/route-error";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <RouteError title="Sets" error={error} reset={reset} hint="Your saved work is safe." />;
}
