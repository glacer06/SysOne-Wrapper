import Link from "next/link";
import { SiteNote } from "~/components/site-note";
import { productName, tagline } from "~/site";

export default function HomePage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-6 py-16">
      <h1 className="mb-4 text-3xl font-bold">{productName}</h1>
      <p className="mb-6 text-fd-muted-foreground">{tagline}</p>
      <p className="flex gap-4">
        <Link href="/docs" className="font-medium underline">
          Read the docs
        </Link>
        <Link href="/docs/quickstart" className="font-medium underline">
          Quickstart
        </Link>
      </p>
      <SiteNote />
    </main>
  );
}
