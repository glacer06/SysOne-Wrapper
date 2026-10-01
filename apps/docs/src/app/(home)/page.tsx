import Link from "next/link";
import type { ReactNode } from "react";
import { CodeTabs } from "~/components/code-tabs";
import { SiteNote } from "~/components/site-note";
import { agentLinks, codeSamples, quickLinks, receipt, runResultExample, steps } from "~/lib/home-example";
import { productName } from "~/site";

/** One receipt row: a mono label, the value, and a link to the concept page behind it. */
function ReceiptRow({
  label,
  link,
  title = false,
  children,
}: {
  label: string;
  link: { href: string; label: string };
  /** The state line reads as the card's title, so its label is for screen readers only. */
  title?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={title ? "bw-receipt-row bw-receipt-title" : "bw-receipt-row"}>
      <dt className={title ? "sr-only" : "bw-label"}>{label}</dt>
      <dd>{children}</dd>
      <dd className="bw-receipt-link">
        <Link href={link.href}>
          <span className="bw-u">{link.label}</span>
          <span aria-hidden="true">&rarr;</span>
        </Link>
      </dd>
    </div>
  );
}

export default function HomePage() {
  return (
    <main className="mx-auto flex w-full max-w-[1200px] flex-1 flex-col px-4 py-6 sm:px-6 md:py-10">
      {/* The bench: steps on the left, the code and what came back on the right. */}
      <section className="bw-hero bw-bench" aria-labelledby="home-title">
        <span className="bw-corner-bl" aria-hidden="true" />
        <span className="bw-corner-br" aria-hidden="true" />
        <div className="bw-bench-start">
          <p className="bw-label mb-4">{productName} docs</p>
          <h1 id="home-title" className="bw-display bw-home-title">
            {productName} tells you how sure it was.
          </h1>
          <p className="bw-home-lede">Every answer comes back with a band, a reason and a cost. Three steps to your first check.</p>
          <ol className="bw-steps">
            {steps.map((step, i) => (
              <li key={step.title}>
                <span className="bw-step-num" aria-hidden="true">
                  {i + 1}
                </span>
                <span className="bw-step-body">
                  <span className="bw-step-title">{step.title}</span>
                  <code>{step.command}</code>
                </span>
              </li>
            ))}
          </ol>
          <p className="m-0">
            <Link href="/docs/quickstart" className="bw-text-link">
              <span className="bw-u">Start the quickstart</span>
              <span aria-hidden="true">&rarr;</span>
            </Link>
          </p>
        </div>

        <div className="bw-bench-end">
          <CodeTabs samples={codeSamples} label="Run a check from" />

          <h2 className="bw-label bw-receipt-heading" id="receipt-heading">
            What came back (example receipt)
          </h2>
          {/* The one chamfered element in this region. */}
          <div className="bw-decision-wrap">
            <dl className="bw-receipt" aria-labelledby="receipt-heading">
              <ReceiptRow label="State" link={receipt.links.state} title>
                {receipt.state}
              </ReceiptRow>
              <ReceiptRow label="Band" link={receipt.links.band}>
                <span className={`bw-band bw-band-${receipt.band.tone}`}>
                  {receipt.band.name} <span className="bw-band-score">{receipt.band.score}</span>
                </span>
              </ReceiptRow>
              <ReceiptRow label="Why" link={receipt.links.why}>
                {receipt.why}
              </ReceiptRow>
              <ReceiptRow label="Cost" link={receipt.links.cost}>
                <span className="bw-mono">{receipt.cost.systemOne}</span>, saved about{" "}
                <span className="bw-mono">{receipt.cost.saved}</span>
              </ReceiptRow>
            </dl>
          </div>
          <p className="bw-receipt-note">Example values. Your set&apos;s own thresholds decide the band.</p>

          <details className="bw-raw">
            <summary>
              <svg className="bw-raw-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                <path d="m9 18 6-6-6-6" />
              </svg>
              Show the raw RunResult JSON
            </summary>
            <p className="bw-receipt-note">Trimmed example. The full envelope also carries stages, answers, checks and the version fields.</p>
            <pre tabIndex={0} aria-label="Example RunResult JSON">
              <code>{JSON.stringify(runResultExample, null, 2)}</code>
            </pre>
          </details>
        </div>
      </section>

      {/* The supplied mark A (one file per theme, never redrawn) at the head of the trail. */}
      <div className="bw-trailhead" aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="bw-trailhead-mark bw-hero-mark-light" src="/brand/bandwise-mark-A-light.svg" alt="" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="bw-trailhead-mark bw-hero-mark-dark" src="/brand/bandwise-mark-A-dark.svg" alt="" />
        <div className="bw-trail" />
      </div>

      <nav aria-labelledby="quick-links">
        <h2 id="quick-links" className="bw-label mb-2">
          Quick links
        </h2>
        <ul className="bw-quick">
          {quickLinks.map((q) => (
            <li key={q.href}>
              <Link href={q.href}>
                <span className="bw-quick-title">{q.title}</span>
                <span className="bw-quick-desc">{q.description}</span>
                <span className="bw-quick-arrow" aria-hidden="true">
                  &rarr;
                </span>
              </Link>
            </li>
          ))}
        </ul>
        <p className="bw-agents">
          For agents:{" "}
          {agentLinks.map((a, i) => (
            <span key={a.href}>
              {i > 0 ? <span aria-hidden="true"> · </span> : null}
              <a href={a.href}>{a.label}</a>
            </span>
          ))}
        </p>
      </nav>

      <SiteNote />
    </main>
  );
}
