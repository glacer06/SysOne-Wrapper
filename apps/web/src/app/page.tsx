import type { Metadata } from "next";
import { BandBadge, BandLegend, ConfidenceRuler } from "~/components/confidence-ruler";
import { EarlyAccessForm } from "~/components/early-access-form";
import { BWireframe } from "~/components/b-wireframe";
import { DrawOnView } from "~/components/draw-on-view";
import { SavingsCalculator } from "~/components/savings-calculator";
import { MarkA } from "~/components/site-header";
import { calculatorSetup, systemOneModel } from "~/lib/bill";
import { formatUsd } from "~/lib/format";
import { decisions, policy, question, templateId, templateTitle } from "~/lib/decision-example";
import { heroReceipt, receiptInputTokens } from "~/lib/receipt";
import { groupLabels, typeLabels, useCases, type UseCase } from "~/lib/use-cases";
import { docsUrl, kitUrl, npmPackages, npmUrl, productName, tagline } from "~/site";

export const metadata: Metadata = {
  title: { absolute: `${productName}: small model, heavy lifting` },
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

const answerWord = (d: (typeof decisions)[number]) => (d.value === true ? "yes" : d.value === false ? "no" : "unsure");
const actionWord = (a: "auto" | "review") => (a === "auto" ? "acts" : "a person");

const rulerLabel = `Confidence scale from 0 to 1, split into bands at ${policy.falseAt}, ${policy.falseAt + policy.reviewMargin}, ${(policy.trueAt - policy.reviewMargin).toFixed(1)} and ${policy.trueAt}`;

function Hero() {
  const r = heroReceipt();
  const d = r.decision;
  return (
    <section className="hero" aria-labelledby="hero-title">
      <BWireframe className="hero-bwire" />
      <div className="wrap hero-grid">
        <div className="hero-copy">
          <p className="label">Early access</p>
          <h1 id="hero-title" className="display">
            Small model. Heavy lifting.
          </h1>
          <p className="support">It knows how sure it is.</p>
          <p className="lede">
            {productName} runs your yes-or-no, pick-one and score decisions on TypeSafe&apos;s System One models. Every answer
            comes back with a band, a reason and a cost. You set the lines. Each band gets an action: act, send to a person,
            fall back to a default, or ask a larger LLM. Every run records what it cost and what it saved.
          </p>
          <div className="hero-actions">
            <span className="focus-poly">
              <a className="btn btn-primary" href="#early-access">
                Request early access
              </a>
            </span>
            <a className="btn btn-secondary" href="#kit">
              Get the free kit
            </a>
          </div>
          <p className="hero-status">The hosted cloud is in early access. The kit is free and open source today.</p>
        </div>

        <MarkA width={340} className="hero-mark" />

        <div className="hero-demo">
          <ConfidenceRuler
            policy={policy}
            label={`${rulerLabel}. The answer sits at ${d.noul.toFixed(2)}, in the ${d.band} band.`}
            caption={
              <>
                Example thresholds from the <a href={templateDocs(templateId)}>{templateTitle}</a> template
              </>
            }
            carry={{ score: d.noul }}
            readout={
              <span className="data">
                {d.noul.toFixed(2)} · {d.band.toUpperCase()} · {formatUsd(r.costMicro)}
              </span>
            }
          />

          <article className="decision" aria-label="One decision, read in four parts">
            <div className="decision-inner">
              <p className="decision-input data">
                {d.service} {d.level}: {d.message}
              </p>
              <h2 className="decision-title">{r.state}</h2>
              <dl className="decision-rows">
                <div>
                  <dt>Band</dt>
                  <dd>
                    <BandBadge band={d.band} score={d.noul} /> <span className="muted">leaning {answerWord(d)}</span>
                  </dd>
                </div>
                <div>
                  <dt>Why</dt>
                  <dd>{r.why}</dd>
                </div>
                <div>
                  <dt>Cost</dt>
                  <dd>
                    <span className="data strong">{formatUsd(r.costMicro)}</span> on {systemOneModel.label}. The same call on{" "}
                    {r.comparatorLabel}: <span className="data">{formatUsd(r.comparatorMicro)}</span>.
                  </dd>
                </div>
              </dl>
              <p className="caveat">
                Illustrative. The confidence is not recorded model output. The costs come from our price book for a{" "}
                {receiptInputTokens}-token call, at list prices with no discounts.
              </p>
            </div>
          </article>
        </div>
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
          <h2 id="how-title">One question. One number. One action.</h2>
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
            <p>A System One model such as Jev answers with a confidence. For a yes-or-no question, it is the probability of yes.</p>
          </li>
          <li>
            <span className="num">03</span>
            <h3>Band</h3>
            <p>Your thresholds sort that number into High, Medium or Low. They live in the spec, so a change is a reviewed version.</p>
          </li>
          <li>
            <span className="num">04</span>
            <h3>Action</h3>
            <p>Each band maps to an action: act on its own, send to a person, fall back to a default, or ask a larger LLM.</p>
          </li>
        </ol>

        <div className="example">
          <div>
            <p className="label">
              From the <a href={templateDocs(templateId)}>{templateTitle}</a> template
            </p>
            <p className="example-question">{question}</p>
            <p className="example-policy data">
              trueAt {policy.trueAt} · falseAt {policy.falseAt} · reviewMargin {policy.reviewMargin}
            </p>
            <p className="caveat">
              At {policy.trueAt} and above, the answer is a confident yes and the set pages someone. At {policy.falseAt} and
              below, it is a confident no and the line is only logged. Anything between goes to a queue a person reads during
              working hours. An unsure model never wakes anyone up.
            </p>
          </div>
          <div>
            <ConfidenceRuler
              policy={policy}
              markers={decisions.map((d, i) => ({ value: d.noul, n: i + 1 }))}
              label={rulerLabel}
              caption="Example thresholds, set in the template's spec"
            />
            <BandLegend />
            <ol className="lines">
              {decisions.map((d, i) => (
                <li key={d.service}>
                  <span className="marker data" aria-hidden="true">
                    {i + 1}
                  </span>
                  <p className="log data">
                    <b>
                      {d.service} {d.level}
                    </b>{" "}
                    {d.message}
                  </p>
                  <p className="verdict">
                    <BandBadge band={d.band} score={d.noul} />
                    <span className="data">{answerWord(d)}</span>
                    <span className="data">{actionWord(d.action)}</span>
                    <span className="outcome">{d.outcome}</span>
                  </p>
                </li>
              ))}
            </ol>
            <p className="caveat">
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
            Jev costs <span className="data">{formatUsd(systemOneModel.price.inputPerMtokMicroUsd)}</span> per million input
            tokens, and output is not billed. It scores below the largest models. That is why the bands exist.
          </p>
        </div>
        <div className="bench">
          <div className="table-scroll">
            <table className="data-table">
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
            <p className="caveat">
              A vendor benchmark. The reference answers are the average of two frontier models, not human labels. Source:{" "}
              <a href="https://www.datacamp.com/blog/system-one-models-jev">DataCamp</a>.
            </p>
          </div>
          <div className="prose">
            <p>
              Most answers in a workflow are easy. Let the small model take the ones it is sure of, and send the rest to a
              person or to one of those larger models. TypeSafe reports its models as up to 194x faster and 445x cheaper than
              LLMs on its own workflow evaluations (<a href="https://vercel.com/blog/ai-gateway-jev-model-launch">Vercel blog</a>). That is TypeSafe&apos;s framing, and your numbers will differ.
            </p>
            <p>
              A confidence of 0.8 does not mean the answer is right 80% of the time. It describes how spread out the answer is.
              So {productName} measures accuracy on your own labeled decisions, per band, before a band is allowed to act.
            </p>
            <p>
              New sets start in shadow: they log what they would have done and act on nothing. Controlled lets only the High
              band act. Full turns everything on. A person can pause a set at any stage.
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
            System One calls cost little enough that the number worth watching is how often you escalate to an LLM. Move the
            rate and watch which lane grows.
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
            accuracy. Tune them on your own data before anything acts on its own.
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
            <p className="caveat">
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
          <table className="data-table">
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
          <div className="section-head">
            <p className="label">The free kit</p>
            <h2 id="kit-title">Start on your own machine, for free.</h2>
            <p>
              bandwise-kit is the open part of {productName}: the spec format, the local runner, the CLI, the templates, and a
              Claude Code skill that reads your repository and suggests decisions worth handing to a System One model. It is
              licensed under Apache-2.0.
            </p>
          </div>
          <div className="hero-actions">
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
              <a className="data" href={npmUrl(p.name)}>
                {p.name}
              </a>
              <p>{p.what}</p>
            </li>
          ))}
          <li>
            <a className="data" href={`${docsUrl}/docs/find-decisions`}>
              find-decisions skill
            </a>
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

/** The brand moment: the lockup on the dark ground, the B drawn as a trail behind it. */
function BrandMoment() {
  const r = heroReceipt();
  const d = r.decision;
  return (
    <section className="brand-moment" data-theme="dark" aria-label={productName}>
      <span className="bracket bracket-tl" aria-hidden="true" />
      <span className="bracket bracket-tr" aria-hidden="true" />
      <span className="bracket bracket-bl" aria-hidden="true" />
      <span className="bracket bracket-br" aria-hidden="true" />
      <DrawOnView className="brand-moment-stage">
        <BWireframe className="brand-moment-bwire" revealId="brand-moment-reveal" />
        {/* The section is always on the dark ground, so it always takes the lockup made for dark. */}
        <picture className="brand-moment-lockup">
          <img
            src="/brand/bandwise-lockup-horizontal-A-dark.svg"
            alt={productName}
            width={680}
            height={Math.round((680 * 744) / 2168)}
          />
        </picture>
      </DrawOnView>
      <p className="brand-moment-line data">
        band={d.band} score={d.noul.toFixed(2)} cost={formatUsd(r.costMicro)}
      </p>
    </section>
  );
}

function EarlyAccess() {
  return (
    <section className="section access" id="early-access" aria-labelledby="access-title">
      <div className="wrap access-grid">
        <div className="section-head">
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
      <BrandMoment />
      <EarlyAccess />
    </main>
  );
}
