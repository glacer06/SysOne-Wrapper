import type { Metadata } from "next";
import { privacyEmail, productName } from "~/site";

export const metadata: Metadata = {
  title: "Privacy",
  description: `What ${productName} stores, who processes it, and how to have it deleted.`,
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  const mail = `mailto:${privacyEmail}`;
  return (
    <main id="main" className="legal">
      <div className="wrap">
        <article className="legal-body">
          <p className="label">Privacy</p>
          <h1>Privacy notice</h1>
          <p className="dated">Dated 2026-10-01</p>

          <p className="notice">
            This is version 2. Version 1 (2026-09-28) covered only the early-access form. This version adds the hosted service
            and Bandwise Gate, and names the companies that process data for us. We will review it again before {productName} is
            generally available, and we will change the date above when we do.
          </p>

          <p>
            This page covers this website, the early-access form, the hosted service at app.bandwise.dev and Bandwise Gate, our
            Claude Code plugin and connector. The hosted service and Bandwise Gate are open only to our own team for now.
          </p>

          <h2>What we store</h2>
          <h3>From the early-access form</h3>
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

          <h3>From the hosted service and Bandwise Gate</h3>
          <p>
            When a hook or a tool asks {productName} a question, such as whether an agent is really done or whether a command
            needs a person, we receive only the fields that question set names. For the done-check that is your request and the
            agent&apos;s last reply. For the action gate it is the tool name, the command or file path, and its description.
            Before anything leaves our server we cut each field to the set&apos;s length limit and replace text that looks like a
            secret, such as API keys, tokens, passwords and private keys, with <code>[redacted]</code>. That replacement is best
            effort, so do not paste secrets into a prompt you would not want checked.
          </p>
          <p>For each run we store:</p>
          <ul>
            <li>the redacted input, unless the set is configured to keep only a hash of it;</li>
            <li>the answers, the confidence band, what it cost and what it saved;</li>
            <li>which account and which token made the call, and when.</li>
          </ul>
          <p>
            We also store your account: your email address, your name, a hash of your password, your two-factor setup and
            hashes of the tokens you create. We never store a token or a password in plain text.
          </p>

          <h2>Why we store it</h2>
          <p>
            Early-access details: to invite you, to ask about your use case, and to tell you when the cloud opens.
          </p>
          <p>
            Run data: to answer the question you asked, to show you what each run cost and saved, and to measure how often the
            answers are right so the thresholds can be tuned. We do not use it to train any model.
          </p>

          <h2>Who can see it</h2>
          <p>
            The people who operate {productName}, and the companies that process data for us. We do not sell it, rent it or
            share it with advertisers.
          </p>

          <h2>Companies that process data for us</h2>
          <ul>
            <li>
              <strong>TypeSafe</strong> runs the System One models that answer every question. It receives the redacted input
              for each run and returns the answer. {productName} is not made or endorsed by TypeSafe.
            </li>
            <li>
              <strong>Supabase</strong> hosts our Postgres database in the United States. Everything we store sits there.
            </li>
            <li>
              <strong>Vercel</strong> hosts this website and app.bandwise.dev, and counts page views (see Analytics).
            </li>
            <li>
              <strong>Anthropic</strong>, only while we test Bandwise Gate on our own team: the same redacted done-check input
              goes to a Claude model too, so we can compare the two answers. We will update this notice before that
              comparison covers anyone outside our team.
            </li>
          </ul>

          <h2>How long we keep it</h2>
          <p>Early-access details: until you ask us to remove them, or until early access ends, whichever comes first.</p>
          <p>
            Run data and accounts: until you ask us to delete them. Automatic deletion after a set number of days is not built
            yet. When it is, this notice will say how many days.
          </p>

          <h2>Unsubscribe or delete</h2>
          <p>
            Email <a href={mail}>{privacyEmail}</a> from the address you signed up with and say what you want: stop hearing from
            us, see what we hold, correct it, or delete it. That covers run data and accounts as well. We will do it and reply
            to confirm.
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
