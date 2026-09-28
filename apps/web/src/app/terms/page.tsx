import type { Metadata } from "next";
import Link from "next/link";
import { independenceNote, kitUrl, privacyEmail, productName } from "~/site";

export const metadata: Metadata = {
  title: "Terms",
  description: `Short terms for the ${productName} website and early-access list.`,
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  const mail = `mailto:${privacyEmail}`;
  return (
    <main id="main" className="legal">
      <div className="wrap">
        <article className="legal-body">
          <p className="label">Terms</p>
          <h1>Early-access terms</h1>
          <p className="dated">Dated 2026-09-28</p>

          <p className="notice">
            This is version 1, written for the early-access list. We will review it before {productName} is
            generally available. The terms for the hosted service will be separate and will come before anyone pays for it.
          </p>

          <h2>No service yet</h2>
          <p>
            Joining the early-access list does not give you an account, a service or a price. It means we may contact you about
            early access. We may invite people in any order, and we may change or stop the early-access program.
          </p>

          <h2>The free kit</h2>
          <p>
            The <a href={kitUrl}>bandwise-kit</a> and the npm packages published from it are licensed under the Apache License,
            Version 2.0. That license, not this page, governs your use of them.
          </p>

          <h2>No warranty</h2>
          <p>
            This website and everything on it are provided as they are, without any warranty. The savings calculator gives
            estimates from list prices, not a quote. Benchmark figures on this site are other companies&apos; published numbers,
            with their caveats beside them.
          </p>

          <h2>Independence</h2>
          <p>{independenceNote}</p>

          <h2>Your data</h2>
          <p>
            What we store from the early-access form, and how to have it deleted, is in the <Link href="/privacy">privacy
            notice</Link>.
          </p>

          <h2>Contact</h2>
          <p>
            Write to <a href={mail}>{privacyEmail}</a>.
          </p>
        </article>
      </div>
    </main>
  );
}
