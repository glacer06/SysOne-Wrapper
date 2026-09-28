import type { Metadata } from "next";
import { privacyEmail, productName } from "~/site";

export const metadata: Metadata = {
  title: "Privacy",
  description: `What ${productName} stores when you request early access, why, and how to have it deleted.`,
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  const mail = `mailto:${privacyEmail}`;
  return (
    <main id="main" className="legal">
      <div className="wrap">
        <article className="legal-body">
          <p className="label">Privacy</p>
          <h1>Privacy notice for early access</h1>
          <p className="dated">Dated 2026-09-28</p>

          <p className="notice">
            This is version 1, written for the early-access list. We will review it before {productName} is
            generally available, and we will change the date above when we do.
          </p>

          <p>
            This page covers this website and the early-access form on it. There is no {productName} account or hosted service
            yet, so there is nothing else to cover.
          </p>

          <h2>What we store</h2>
          <p>When you send the early-access form, we store:</p>
          <ul>
            <li>your email address;</li>
            <li>your name, company, role and what you would like to use it for, if you fill those in;</li>
            <li>the page you signed up from, and the time you signed up;</li>
            <li>
              a salted hash of your IP address. We use it only to limit how often one network can send the form and to spot
              abuse. We do not store the address itself.
            </li>
          </ul>

          <h2>Why we store it</h2>
          <p>
            To contact you about early access: to invite you, to ask about your use case, and to tell you when the cloud opens.
            We do not use it for anything else.
          </p>

          <h2>Who can see it</h2>
          <p>
            Only the people who operate {productName}. The data sits in our Postgres database, hosted by Supabase in the United
            States. We do not sell it, rent it or share it with advertisers.
          </p>

          <h2>How long we keep it</h2>
          <p>Until you ask us to remove it, or until early access ends, whichever comes first.</p>

          <h2>Unsubscribe or delete</h2>
          <p>
            Email <a href={mail}>{privacyEmail}</a> from the address you signed up with and say what you want: stop hearing from
            us, see what we hold, correct it, or delete it. We will do it and reply to confirm.
          </p>

          <h2>Analytics</h2>
          <p>
            This site uses Vercel Web Analytics to count page views. It sets no cookies and does not identify you across sites,
            so there is no cookie banner.
          </p>

          <h2>Contact</h2>
          <p>
            Questions about this notice go to <a href={mail}>{privacyEmail}</a>.
          </p>
        </article>
      </div>
    </main>
  );
}
