"use client";

import { RouteError } from "~/components/shell/route-error";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <RouteError title="Releases" error={error} reset={reset} hint="The CLI reaches the same operations, so bandwise rollback and bandwise rollout keep working." />;
}
