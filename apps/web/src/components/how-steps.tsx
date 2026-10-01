"use client";

import { useEffect, useState, type ReactNode } from "react";

export interface HowStep {
  title: string;
  body: ReactNode;
}

export interface CodeLine {
  text: string;
  /** The steps that outline this line, and the tag shown at its right edge. */
  steps?: readonly number[];
  tag?: string;
}

/**
 * Three step rows and one code block. Picking a step outlines the lines of the code block that it
 * explains, and the counter reads [ n / 3 ]. Without JavaScript every step's text shows and the
 * last step's lines stay outlined.
 */
export function HowSteps({
  steps,
  code,
  codeLabel,
  initial,
}: {
  steps: readonly HowStep[];
  code: readonly CodeLine[];
  codeLabel: string;
  initial: number;
}) {
  const [active, setActive] = useState(initial);
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);

  return (
    <div className="how">
      <div className="how-steps">
        <p className="how-counter data" aria-live="polite">
          <span className="visually-hidden">Step </span>[ {active} / {steps.length} ]
        </p>
        <ol className="how-list">
          {steps.map((s, i) => {
            const n = i + 1;
            const on = n === active;
            return (
              <li key={s.title} className={`how-step${on ? " is-active" : ""}`}>
                <button type="button" className="how-step-btn" aria-pressed={on} onClick={() => setActive(n)}>
                  <span className="how-step-num data">{String(n).padStart(2, "0")}</span>
                  <span className="how-step-title">{s.title}</span>
                </button>
                <div className="how-step-body" hidden={ready && !on}>
                  {s.body}
                </div>
              </li>
            );
          })}
        </ol>
      </div>
      <figure className="how-code">
        <figcaption className="label">{codeLabel}</figcaption>
        <pre className="terminal how-terminal" tabIndex={0} aria-label={codeLabel}>
          <code>
            {code.map((l, i) => {
              const lit = l.steps?.includes(active) ?? false;
              return (
                <span key={i} className={`code-line${lit ? " is-lit" : ""}`}>
                  {l.text}
                  {lit && l.tag ? <span className="code-tag">{l.tag}</span> : null}
                  {"\n"}
                </span>
              );
            })}
          </code>
        </pre>
      </figure>
    </div>
  );
}
