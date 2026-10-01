"use client";

import { type KeyboardEvent, useEffect, useId, useRef, useState } from "react";
import { type CodeSample, copyText } from "~/lib/home-example";

/**
 * Tabbed code block with Copy. WAI-ARIA tabs: roving tabindex, Left and Right arrows move and select,
 * Home and End jump to the ends. Without JavaScript the first panel shows.
 */
export function CodeTabs({ samples, label }: { samples: readonly CodeSample[]; label: string }) {
  const base = useId();
  const [selected, setSelected] = useState(0);
  const [copied, setCopied] = useState<string | null>(null);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    if (copied === null) return;
    const t = setTimeout(() => setCopied(null), 2000);
    return () => clearTimeout(t);
  }, [copied]);

  function select(i: number) {
    const n = (i + samples.length) % samples.length;
    setSelected(n);
    tabs.current[n]?.focus();
  }

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    const moves: Record<string, number> = { ArrowRight: selected + 1, ArrowLeft: selected - 1, Home: 0, End: samples.length - 1 };
    const next = moves[e.key];
    if (next === undefined) return;
    e.preventDefault();
    select(next);
  }

  async function copy(sample: CodeSample) {
    try {
      await navigator.clipboard.writeText(copyText(sample));
      setCopied(sample.id);
    } catch {
      setCopied(null);
    }
  }

  const current = samples[selected];

  return (
    <div className="bw-codetabs">
      <div className="bw-codetabs-bar">
        <div role="tablist" aria-label={label} className="bw-codetabs-list">
          {samples.map((s, i) => (
            <button
              key={s.id}
              ref={(el) => {
                tabs.current[i] = el;
              }}
              type="button"
              role="tab"
              id={`${base}-tab-${s.id}`}
              aria-controls={`${base}-panel-${s.id}`}
              aria-selected={i === selected}
              tabIndex={i === selected ? 0 : -1}
              className="bw-codetabs-tab"
              onClick={() => setSelected(i)}
              onKeyDown={onKeyDown}
            >
              {s.label}
            </button>
          ))}
        </div>
        {current === undefined ? null : (
          <button type="button" className="bw-codetabs-copy" onClick={() => void copy(current)} aria-label={`Copy the ${current.label} code`}>
            {copied === current.id ? "Copied" : "Copy"}
          </button>
        )}
      </div>
      {samples.map((s, i) => (
        <div
          key={s.id}
          role="tabpanel"
          id={`${base}-panel-${s.id}`}
          aria-labelledby={`${base}-tab-${s.id}`}
          hidden={i !== selected}
          className="bw-codetabs-panel"
        >
          {/* The pre scrolls on its own, so it takes focus for keyboard scrolling. */}
          <pre tabIndex={0} aria-label={`${s.label} code`}>
            <code>
              {s.code.split("\n").map((line, j) => (
                <span key={j} className="bw-codetabs-line">
                  {line.startsWith("$ ") ? (
                    <>
                      <span className="bw-codetabs-prompt" aria-hidden="true">
                        ${" "}
                      </span>
                      {line.slice(2)}
                    </>
                  ) : (
                    line
                  )}
                  {"\n"}
                </span>
              ))}
            </code>
          </pre>
          <p className="bw-codetabs-note">{s.note}</p>
        </div>
      ))}
      <p className="sr-only" aria-live="polite">
        {copied === null ? "" : "Copied to the clipboard."}
      </p>
    </div>
  );
}
