import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "~/components/ui";

import { ReleasesPanel } from "./panel";

export const metadata: Metadata = { title: "Releases · Bandwise console" };

export default async function ReleasesPage({ params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params;
  const setRef = decodeURIComponent(ref);
  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-2 text-sm text-ink-3">
        <Link href="/sets" className="hover:text-ink">
          Sets
        </Link>
        <span aria-hidden> / </span>
        <Link href={`/sets/${encodeURIComponent(setRef)}`} className="font-mono hover:text-ink">
          {setRef}
        </Link>
      </nav>
      <PageHeader title="Releases" description="Publish the draft, move a channel through rollout, and roll back when something looks wrong." />
      <ReleasesPanel setRef={setRef} />
    </>
  );
}
