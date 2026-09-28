import type { Metadata } from "next";
import { BandLegend, BandRuler, bandClass } from "~/components/band-ruler";
import { EarlyAccessForm } from "~/components/early-access-form";
import { SavingsCalculator } from "~/components/savings-calculator";
import { calculatorSetup, systemOneModel } from "~/lib/bill";
import { formatUsd } from "~/lib/format";
import { decisions, policy, question, templateId, templateTitle } from "~/lib/decision-example";
import { groupLabels, typeLabels, useCases, type UseCase } from "~/lib/use-cases";
import { docsUrl, kitUrl, npmPackages, npmUrl, productName, tagline } from "~/site";

export const metadata: Metadata = {
  title: { absolute: `${productName}: confidence bands for System One decisions` },
  description: tagline,
};

const templateDocs = (id: string) => `${docsUrl}/docs/templates/${id}`;

/** Inline `code` spans in template questions. */
function WithCode({ text }: { text: string }) {
  return (
    <>
      {text.split(/(`[^`]+`)/g).map((part, i) =>
        part.startsWith("`") ? <code key={i}>{part.slice(1, -1)}</code> : <span key={i}>{part}</span>,
      )}
    </>
  );
}

const bandWord = (d: (typeof decisions)[number]) =>
  d.value === true ? `${d.band}, yes` : d.value === false ? `${d.band}, no` : `${d.band}, unsure`;

function Hero() {
  const first = decisions[0];
  return (
    <section className="hero" aria-labelledby="hero-title">
      <div className="wrap hero-grid">
        <div>
          <p className="label">Early access</p>
          <h1 id="hero-title" style={{ marginTop: "var(--s-4)" }}>
            Let a small model make the call. Know when it should not.
          </h1>
          <p className="lede">
            {productName} runs your yes or no, pick-one and score decisions on TypeSafe&apos;s System One models, reads how sure
            each answer is, and turns that into an action: act, send to a person, fall back, or ask a larger LLM. Every run
            records what it cost and what it saved.
          </p>
          <div className="hero-actions">
            <a className="btn btn-primary" href="#early-access">
              Request early access
            </a>
            <a className="btn btn-secondary" href="#kit">
              Get the free kit
            </a>
          </div>
          <p className="hero-status">The hosted cloud is in early access. The kit is free and open source today.</p>
        </div>
        {first ? (
          <div className="readout" aria-label="One decision from the log-line pager template">
            <div className="readout-title">
              <span>{templateId}</span>
              <span style={{ color: "var(--ink-3)" }}>illustrative run</span>
            </div>
            <dl>
              <dt>Log line</dt>
              <dd>
                {first.service} {first.level}: {first.message}
              </dd>
              <dt>Question</dt>
              <dd className="question-text">{question}</dd>
              <dt>Confidence</dt>
              <dd>
                {first.noul.toFixed(2)} that the answer is yes
                <BandRuler policy={policy} markers={[{ value: first.noul, n: 1 }]} label="Confidence scale" showReads={false} />
              </dd>
              <dt>Band</dt>
              <dd>
                <span className="chip">
                  <i className={`swatch ${bandClass[first.band]}`} aria-hidden="true" />
                  {bandWord(first)}
                </span>
              </dd>
              <dt>Action</dt>
              <dd>
                <span className="chip chip-signal">{first.action}</span> {first.outcome}
              </dd>
            </dl>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function HowItWorks() {
  return (
    <section className="section" id="how" aria-labelledby="how-title">
      <div className="wrap">
        <div className="section-head">
          <p className="label">How a decision flows</p>
          <h2 id="how-title">One question, one number, one action.</h2>
        </div>
        <ol className="flow-steps">
          <li>
            <span className="num">01</span>
            <h3>Question</h3>
            <p>You write it once in a versioned spec, with the answers it may give: yes or no, one option from a list, or a level on a rubric.</p>
          </li>
          <li>
            <span className="num">02</span>
            <h3>Confidence</h3>
            <p>A System One model such as Jev answers with a confidence. For a yes or no question it is the probability of yes.</p>
          </li>
          <li>
            <span className="num">03</span>
            <h3>Band</h3>
            <p>Your thresholds sort that number into high, medium or low. The thresholds live in the spec, so changing them is a reviewed version.</p>
          </li>
          <li>
            <span className="num">04</span>
            <h3>Action</h3>
            <p>Each band maps to an action: act on its own, send to a person, fall back to a default, or escalate to a larger LLM.</p>
          </li>
        </ol>

        <div className="example">
          <div>
            <p className="label">
              From the <a href={templateDocs(templateId)}>{templateTitle}</a> template
            </p>
            <p className="example-question">{question}</p>
            <p className="example-policy">
              trueAt {policy.trueAt}, falseAt {policy.falseAt}, review margin {policy.reviewMargin}
            </p>
            <p className="caveat" style={{ marginTop: "var(--s-5)" }}>
              Above 0.8 the answer is a confident yes and the set pages someone. Below 0.2 it is a confident no and the line is
              only logged. Anything in between goes to a queue a person reads during working hours, so an unsure model never
              wakes anyone up.
            </p>
          </div>
          <div>
            <BandRuler
              policy={policy}
              markers={decisions.map((d, i) => ({ value: d.noul, n: i + 1 }))}
              label={`Confidence scale from 0 to 1 split into bands at ${policy.falseAt}, ${policy.falseAt + policy.reviewMargin}, ${policy.trueAt - policy.reviewMargin} and ${policy.trueAt}`}
            />
            <BandLegend />
            <ol className="lines">
              {decisions.map((d, i) => (
                <li key={d.service}>
                  <span className="marker" aria-hidden="true">
                    {i + 1}
                  </span>
                  <p className="log">
                    <b>
                      {d.service} {d.level}
                    </b>{" "}
                    {d.message}
                  </p>
                  <p className="verdict">
                    <span className="chip">{d.noul.toFixed(2)}</span>
                    <span className="chip">
                      <i className={`swatch ${bandClass[d.band]}`} aria-hidden="true" />
                      {bandWord(d)}
                    </span>
                    <span className={`chip${d.action === "auto" ? " chip-signal" : ""}`}>{d.action}</span>
                    <span className="outcome">{d.outcome}</span>
                  </p>
                </li>
              ))}
            </ol>
            <p className="caveat" style={{ marginTop: "var(--s-4)" }}>
              The confidence values are illustrative, not recorded model output. The bands and actions are what the
              template&apos;s policy does with them.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function WhySmall() {
  return (
    <section className="section" id="why" aria-labelledby="why-title">
      <div className="wrap">
        <div className="section-head">
          <p className="label">Why a small model</p>
          <h2 id="why-title">Cheap and fast, at mid-tier accuracy.</h2>
          <p>
            Jev costs {formatUsd(systemOneModel.price.inputPerMtokMicroUsd)} per million input tokens, and output is not billed. It scores below
            the largest models. That is exactly why the bands exist.
          </p>
        </div>
        <div className="bench">
          <div className="table-scroll">
            <table className="data">
              <caption>TypeSafe&apos;s 4-workflow benchmark, as summarized by DataCamp (2026-09-27)</caption>
              <thead>
                <tr>
                  <th scope="col">Model</th>
                  <th scope="col" className="num">
                    Score
                  </th>
                  <th scope="col" className="num">
                    Cost per case
                  </th>
                  <th scope="col" className="num">
                    Time per case
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr className="self">
                  <td>Jev</td>
                  <td className="num">67.8%</td>
                  <td className="num">about $0.0004</td>
                  <td className="num">0.4 s</td>
                </tr>
                <tr>
                  <td>GPT-5.6 Terra</td>
                  <td className="num">67.9%</td>
                  <td className="num">$0.0304</td>
                  <td className="num">10.1 s</td>
                </tr>
                <tr>
                  <td>Claude Opus 5</td>
                  <td className="num">73.1%</td>
                  <td className="num">$0.1761</td>
                  <td className="num">37.8 s</td>
                </tr>
                <tr>
                  <td>GPT-5.6 Sol</td>
                  <td className="num">74.1%</td>
                  <td className="num">$0.0836</td>
                  <td className="num">23.3 s</td>
                </tr>
              </tbody>
            </table>
            <p className="caveat" style={{ marginTop: "var(--s-3)" }}>
              A vendor benchmark. The reference answers are the average of two frontier models, not human labels. Source:{" "}
              <a href="https://www.datacamp.com/blog/system-one-models-jev">DataCamp</a>.
            </p>
          </div>
          <div className="prose">
            <p>
              Most of the answers in a workflow are easy. Let the small model take the ones it is sure of, and send the rest to a
              person or to one of those larger models. TypeSafe reports its models as up to 194x faster and 445x cheaper than
              LLMs on its own workflow evaluations (<a href="https://vercel.com/blog/ai-gateway-jev-model-launch">Vercel blog</a>). That is TypeSafe&apos;s framing, and your numbers will differ.
            </p>
            <p>
              A confidence of 0.8 does not mean the answer is right 80% of the time. It describes how spread out the answer is.
              So {productName} measures accuracy on your own labeled decisions, per band, before a band is allowed to act.
            </p>
            <p>
              New sets start in shadow: they log what they would have done and act on nothing. Controlled lets only the high band
              act. Full turns everything on. A person can pause a set at any stage.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function Calculator() {
  return (
    <section className="section" id="calculator" aria-labelledby="calc-title">
      <div className="wrap">
        <div className="section-head">
          <p className="label">Savings calculator</p>
          <h2 id="calc-title">The bill, split where it grows.</h2>
          <p>
            System One calls are cheap enough that the part worth watching is how often you escalate to an LLM. Move the rate
            and watch which lane grows.
          </p>
        </div>
        <SavingsCalculator setup={calculatorSetup()} />
      </div>
    </section>
  );
}

function UseCases() {
  const groups = (Object.keys(groupLabels) as Array<UseCase["group"]>).map((g) => ({
    g,
    items: useCases.filter((u) => u.group === g),
  }));
  return (
    <section className="section" id="templates" aria-labelledby="templates-title">
      <div className="wrap">
        <div className="section-head">
          <p className="label">Templates</p>
          <h2 id="templates-title">Nine decisions to start from.</h2>
          <p>
            Each template is a working spec with example and borderline states. They are checked to run, not measured for
            accuracy, so tune them on your own data before anything acts on its own.
          </p>
        </div>
        <div className="cases">
          {groups.map(({ g, items }) => (
            <div className="case-group" key={g}>
              <h3>{groupLabels[g]}</h3>
              <ul className="case-list">
                {items.map((u) => (
                  <li className="case" key={u.id}>
                    <div>
                      <p className="case-title">
                        <a href={templateDocs(u.id)}>{u.title}</a>
                      </p>
                      <p className="case-job">{u.job}</p>
                    </div>
                    <p className="case-asks">
                      <span className="label">Asks</span>
                      <WithCode text={u.asks} />
                    </p>
                    <p className="case-types" aria-label="Question types">
                      {u.types.map((t) => (
                        <span className="chip" key={t}>
                          {typeLabels[t]}
                        </span>
                      ))}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Headless() {
  return (
    <section className="section" id="headless" aria-labelledby="headless-title">
      <div className="wrap">
        <div className="section-head">
          <p className="label">Headless first</p>
          <h2 id="headless-title">The console, the terminal and your agents share one API.</h2>
          <p>
            Every capability in the console is an operation you can also call from the command line, the HTTP API or an MCP
            client. No setting hides behind a screen.
          </p>
        </div>
        <div className="headless">
          <div>
            <pre className="terminal" tabIndex={0} aria-label="Terminal example">
              <code>
                <span className="comment"># Run a template on your machine. No account, no key, no network.</span>
                {"\n"}
                <span className="prompt">$ </span>npx @bandwise/cli run --local log-line-pager.spec.json line.json
                {"\n\n"}
                <span className="comment"># Same run as a shadow rollout, as JSON for a script or an agent.</span>
                {"\n"}
                <span className="prompt">$ </span>npx @bandwise/cli run --local log-line-pager.spec.json line.json \{"\n"}
                {"    "}--rollout shadow --json
              </code>
            </pre>
            <p className="caveat" style={{ marginTop: "var(--s-3)" }}>
              It prints each decision with its band and action, the System One cost and the estimated savings. Local mode answers
              from fixtures, so use it to check your spec and wiring, not accuracy.
            </p>
          </div>
          <ul className="surfaces">
            <li>
              <span className="surface-name">
                bandwise CLI <span className="status now">Local mode today</span>
              </span>
              <p>Runs specs on your machine now. Commands to publish, roll out and run evals arrive with the cloud.</p>
            </li>
            <li>
              <span className="surface-name">
                HTTP API <span className="status">With the cloud</span>
              </span>
              <p>
                Call a published set by ID or slug from any backend. Every run returns the same envelope with bands, actions,
                cost and savings.
              </p>
            </li>
            <li>
              <span className="surface-name">
                MCP server <span className="status">With the cloud</span>
              </span>
              <p>Let Claude Code or another agent read set health, draft changes and propose rollouts.</p>
            </li>
            <li>
              <span className="surface-name">
                Approvals <span className="status">With the cloud</span>
              </span>
              <p>
                Agents propose, people approve. Publishing or widening a rollout waits for a human. Pausing and rolling back never
                wait.
              </p>
            </li>
          </ul>
        </div>
      </div>
    </section>
  );
}

function Providers() {
  return (
    <section className="section" id="providers" aria-labelledby="providers-title">
      <div className="wrap">
        <div className="section-head">
          <p className="label">Providers</p>
          <h2 id="providers-title">Choose how each set reaches the model.</h2>
          <p>
            Pick the route per organization and per set. Model keys stay on our servers and never reach a browser or a customer
            tool.
          </p>
        </div>
        <div className="table-scroll">
          <table className="data">
            <thead>
              <tr>
                <th scope="col">Route</th>
                <th scope="col">Status</th>
                <th scope="col">Notes</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>TypeSafe, direct</td>
                <td>
                  <span className="status now">Supported</span>
                </td>
                <td>The default route, with pinned model versions for controlled and full rollout.</td>
              </tr>
              <tr>
                <td>Vercel AI Gateway</td>
                <td>
                  <span className="status now">Supported</span>
                </td>
                <td>Sets on this route stay in shadow until the gateway offers a pinned model version.</td>
              </tr>
              <tr>
                <td>OpenRouter</td>
                <td>
                  <span className="status">Planned</span>
                </td>
                <td>Proposed as a further route. Not available yet.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function Kit() {
  return (
    <section className="section" id="kit" aria-labelledby="kit-title">
      <div className="wrap kit">
        <div>
          <div className="section-head" style={{ marginBottom: "var(--s-6)" }}>
            <p className="label">The free kit</p>
            <h2 id="kit-title">Start on your own machine, for free.</h2>
            <p>
              bandwise-kit is the open part of {productName}: the spec format, the local runner, the CLI, the templates, and a
              Claude Code skill that reads your repository and suggests decisions worth handing to a System One model. It is
              licensed under Apache-2.0.
            </p>
          </div>
          <div className="hero-actions" style={{ marginTop: 0 }}>
            <a className="btn btn-secondary" href={kitUrl}>
              bandwise-kit on GitHub
            </a>
            <a className="btn btn-secondary" href={`${docsUrl}/docs/quickstart`}>
              Read the quickstart
            </a>
          </div>
        </div>
        <ul className="pkg-list">
          {npmPackages.map((p) => (
            <li key={p.name}>
              <a href={npmUrl(p.name)}>{p.name}</a>
              <p>{p.what}</p>
            </li>
          ))}
          <li>
            <a href={`${docsUrl}/docs/find-decisions`}>find-decisions skill</a>
            <p>
              Runs in Claude Code inside your repository and drafts specs for the decisions it finds. It sends nothing to any
              service.
            </p>
          </li>
        </ul>
      </div>
    </section>
  );
}

function EarlyAccess() {
  return (
    <section className="section access" id="early-access" aria-labelledby="access-title">
      <div className="wrap access-grid">
        <div className="section-head" style={{ marginBottom: 0 }}>
          <p className="label">Early access</p>
          <h2 id="access-title">Request early access to the cloud.</h2>
          <p>
            The hosted {productName} adds versioned sets, rollout stages, review queues and a ledger of what every run cost and
            saved. We are starting with a small group of design partners. Pricing is not public yet.
          </p>
        </div>
        <EarlyAccessForm />
      </div>
    </section>
  );
}

export default function Home() {
  return (
    <main id="main">
      <Hero />
      <HowItWorks />
      <WhySmall />
      <Calculator />
      <UseCases />
      <Headless />
      <Providers />
      <Kit />
      <EarlyAccess />
    </main>
  );
}
