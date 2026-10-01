import Link from "next/link";
import { SiteNote } from "~/components/site-note";
import { productName } from "~/site";

const bands = [
  { name: "High", action: "Ship it. The answer acts on its own.", tone: "high" },
  { name: "Medium", action: "Get evidence. Send it to review, or fall back to your existing path.", tone: "medium" },
  { name: "Low", action: "Ask a person. We don't know, and a person should look.", tone: "low" },
] as const;

export default function HomePage() {
  return (
    <main className="mx-auto flex w-full max-w-[1200px] flex-1 flex-col justify-center px-4 py-8 sm:px-6 md:py-14">
      <section className="bw-hero">
        <span className="bw-corner-bl" aria-hidden="true" />
        <span className="bw-corner-br" aria-hidden="true" />
        <div className="flex flex-col-reverse items-start gap-8 md:flex-row md:items-center md:justify-between md:gap-12">
          <div>
            <p className="bw-label mb-4">{productName} docs</p>
            <h1 className="bw-display mb-6 max-w-[18ch] text-[clamp(2rem,1.2rem+4vw,4rem)]">
              {productName} tells you how sure it was.
            </h1>
            <p className="mb-8 max-w-[68ch] text-lg text-fd-muted-foreground">
              Versioned question sets over TypeSafe&apos;s System One models. Every answer comes back with a band, a reason
              and a cost. Here is how to read them, set them up and run them.
            </p>
            <p className="bw-home-links flex flex-wrap gap-3">
              <span className="bw-focus-poly">
                <Link href="/docs/quickstart" className="bw-primary">
                  Quickstart
                </Link>
              </span>
              <Link href="/docs">Read the docs</Link>
            </p>
          </div>
          <div className="shrink-0" aria-hidden="true">
            {/* The supplied trail ant (mark A), one file per theme. Never redrawn or recolored. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="bw-hero-mark bw-hero-mark-light" src="/brand/bandwise-mark-A-light.svg" alt="" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="bw-hero-mark bw-hero-mark-dark" src="/brand/bandwise-mark-A-dark.svg" alt="" />
          </div>
        </div>
        <div className="bw-trail mt-10" aria-hidden="true" />
      </section>

      <ul className="mt-12 grid list-none gap-4 p-0 md:grid-cols-3">
        {bands.map((band) => (
          <li key={band.name} className="border border-fd-border bg-fd-card p-5" style={{ borderRadius: "var(--bw-radius-md)" }}>
            <p className="bw-label mb-3" style={{ color: `var(--bw-${band.tone}-text)` }}>
              {band.name}
            </p>
            <p className="m-0">{band.action}</p>
          </li>
        ))}
      </ul>

      <SiteNote />
    </main>
  );
}
