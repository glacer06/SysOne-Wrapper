"use client";

import { useEffect, useId, useState } from "react";
import type { Bill, BillInput, CalculatorSetup } from "~/lib/bill";
import { DAYS_PER_MONTH, formatUsd } from "~/lib/format";
import { productName } from "~/site";

type Period = "daily" | "monthly";
type ComputeBill = (input: BillInput) => Bill;

const toNumber = (raw: string) => {
  const n = Number(raw.replace(/[,\s_]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

const sameInput = (a: BillInput, b: BillInput) =>
  a.decisionsPerDay === b.decisionsPerDay &&
  a.inputTokensPerDecision === b.inputTokensPerDecision &&
  a.escalationRate === b.escalationRate &&
  a.comparatorId === b.comparatorId;

export function SavingsCalculator({ setup }: { setup: CalculatorSetup }) {
  const id = useId();
  const [decisions, setDecisions] = useState(setup.defaults.decisionsPerDay.toLocaleString("en-US"));
  const [tokens, setTokens] = useState(setup.defaults.inputTokensPerDecision.toLocaleString("en-US"));
  const [ratePct, setRatePct] = useState(Math.round(setup.defaults.escalationRate * 100));
  const [comparatorId, setComparatorId] = useState(setup.defaults.comparatorId);
  const [period, setPeriod] = useState<Period>("monthly");
  // Core's bill math, loaded as its own chunk once the page is interactive.
  const [compute, setCompute] = useState<ComputeBill | null>(null);

  useEffect(() => {
    let live = true;
    void import("~/lib/bill").then((m) => {
      if (live) setCompute(() => m.computeBill);
    });
    return () => {
      live = false;
    };
  }, []);

  const decisionsN = toNumber(decisions);
  const tokensN = toNumber(tokens);
  const tokensTooMany = tokensN > setup.maxInputTokens;
  const input: BillInput = {
    decisionsPerDay: decisionsN,
    inputTokensPerDecision: tokensN,
    escalationRate: ratePct / 100,
    comparatorId,
  };
  const bill = compute !== null ? compute(input) : sameInput(input, setup.defaults) ? setup.initial : null;
  const pending = bill === null;
  const shown = bill ?? setup.initial;
  const comparator = setup.comparators.find((c) => c.id === comparatorId) ?? setup.comparators[0];
  const view = shown[period];
  const scale = Math.max(view.totalMicro, view.allLlmMicro, 1);
  const share = (micro: number) => `${((micro / scale) * 100).toFixed(3)}%`;
  const difference = view.allLlmMicro - view.totalMicro;
  const per = period === "daily" ? "a day" : "a month";

  return (
    <div className="calc">
      <form className="calc-inputs" aria-label="Your workload" onSubmit={(e) => e.preventDefault()}>
        <div className="field">
          <label htmlFor={`${id}-decisions`}>Decisions per day</label>
          <input
            id={`${id}-decisions`}
            className="input mono"
            inputMode="numeric"
            autoComplete="off"
            value={decisions}
            onChange={(e) => setDecisions(e.target.value)}
            onBlur={() => setDecisions(Math.max(0, Math.round(decisionsN)).toLocaleString("en-US"))}
          />
        </div>
        <div className="field">
          <label htmlFor={`${id}-tokens`}>Input tokens per decision</label>
          <input
            id={`${id}-tokens`}
            className="input mono"
            inputMode="numeric"
            autoComplete="off"
            aria-describedby={`${id}-tokens-hint`}
            aria-invalid={tokensTooMany}
            value={tokens}
            onChange={(e) => setTokens(e.target.value)}
            onBlur={() => setTokens(Math.max(0, Math.round(tokensN)).toLocaleString("en-US"))}
          />
          <p id={`${id}-tokens-hint`} className={tokensTooMany ? "field-error" : "hint"}>
            {tokensTooMany
              ? `One call takes at most ${setup.maxInputTokens.toLocaleString("en-US")} tokens of state and question, so the estimate uses that.`
              : "The state plus the questions. A log line with some context is a few hundred; a pull request diff can be thousands."}
          </p>
        </div>
        <div className="field">
          <label htmlFor={`${id}-rate`}>Escalation rate</label>
          <div className="range-row">
            <input
              id={`${id}-rate`}
              type="range"
              min={0}
              max={100}
              step={1}
              value={ratePct}
              aria-describedby={`${id}-rate-hint`}
              aria-valuetext={`${ratePct} percent of decisions go to an LLM`}
              onChange={(e) => setRatePct(Number(e.target.value))}
            />
            <output htmlFor={`${id}-rate`} className="rate-out">
              {ratePct}%
            </output>
          </div>
          <p id={`${id}-rate-hint`} className="hint">
            The share of decisions your policy sends to a larger LLM. This is the number that moves the bill.
          </p>
        </div>
        <div className="field">
          <label htmlFor={`${id}-comparator`}>LLM for escalations and comparison</label>
          <select id={`${id}-comparator`} className="select" value={comparatorId} onChange={(e) => setComparatorId(e.target.value)}>
            {setup.comparators.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
      </form>

      <div className="calc-out" aria-busy={pending}>
        <div className="period-tabs" role="group" aria-label="Show costs per">
          {(["daily", "monthly"] as const).map((p) => (
            <button key={p} type="button" aria-pressed={period === p} onClick={() => setPeriod(p)}>
              {p === "daily" ? "Per day" : "Per month"}
            </button>
          ))}
        </div>

        <div className={`bars${pending ? " is-pending" : ""}`}>
          <div className="bar-row">
            <div className="bar-head">
              <span className="bar-name">With {productName} and System One</span>
              <span className="bar-total">{formatUsd(view.totalMicro)}</span>
            </div>
            <div className="bar-track" aria-hidden="true">
              <div className="bar-seg seg-s1" style={{ flexBasis: share(view.systemOneMicro) }} title={`System One: ${formatUsd(view.systemOneMicro)}`} />
              {view.escalationMicro > 0 ? (
                <div className="bar-seg seg-esc" style={{ flexBasis: share(view.escalationMicro) }} title={`LLM escalations: ${formatUsd(view.escalationMicro)}`} />
              ) : null}
            </div>
            <p className="bar-parts">
              <span>
                <i className="swatch seg-s1" aria-hidden="true" /> System One <b>{formatUsd(view.systemOneMicro)}</b>
              </span>
              <span>
                <i className="swatch seg-esc" aria-hidden="true" /> LLM escalations <b>{formatUsd(view.escalationMicro)}</b>
              </span>
              <span>{shown.escalationsPerDay.toLocaleString("en-US")} LLM calls a day</span>
            </p>
          </div>
          <div className="bar-row">
            <div className="bar-head">
              <span className="bar-name">Every decision sent to {comparator?.label}</span>
              <span className="bar-total">{formatUsd(view.allLlmMicro)}</span>
            </div>
            <div className="bar-track" aria-hidden="true">
              <div className="bar-seg seg-llm" style={{ flexBasis: share(view.allLlmMicro) }} title={`All LLM: ${formatUsd(view.allLlmMicro)}`} />
            </div>
          </div>
        </div>

        <p className="calc-verdict" aria-live="polite">
          {pending ? (
            <>Working out your numbers.</>
          ) : difference > 0 ? (
            <>
              Estimated difference: <strong>{formatUsd(difference)}</strong> {per}. Most of what you still pay is the{" "}
              {view.escalationMicro >= view.systemOneMicro ? "escalation lane" : "System One lane"}.
            </>
          ) : (
            <>At this escalation rate the two cost about the same. Lower the rate before you expect savings.</>
          )}
        </p>

        <ul className="assumptions">
          <li>
            An estimate, not a quote. Prices come from the price book in our model registry: {setup.systemOne.label} at{" "}
            {formatUsd(setup.systemOne.price.inputPerMtokMicroUsd)} per million input tokens with output not billed, and{" "}
            {comparator?.label} at {formatUsd(comparator?.price.inputPerMtokMicroUsd ?? 0)} per million input tokens and{" "}
            {formatUsd(comparator?.price.outputPerMtokMicroUsd ?? 0)} per million output tokens. Check current prices with each
            provider.
          </li>
          <li>
            Every decision runs on System One first. An escalated decision also pays for one LLM call on the same state, with{" "}
            {setup.outputTokensPerLlmCall} output tokens, the default estimate in our savings math.
          </li>
          <li>A month is {DAYS_PER_MONTH} days. {productName}&apos;s own fees are not included; pricing is not public yet.</li>
          <li>
            It says nothing about accuracy. Whether a small model is right often enough for your task is something to measure on
            your own labeled examples.
          </li>
        </ul>
      </div>
    </div>
  );
}
