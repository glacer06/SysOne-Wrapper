// What the model sees from a check tool (ADR-021 section 2): the answer, the band, the reason, what
// the rollout allows and one cost line. The run id and the receipt detail go in _meta, which hosts
// keep from the model. No pricing, no upgrade prompts, no ids in the text.

import type { RunResult } from "@bandwise/core/contracts";

import type { JsonObject, ToolResult } from "./protocol.js";

/** The criteria text the set gives a question's chosen option, or undefined. */
export type ExplainAnswer = (questionId: string, value: unknown) => string | undefined;

/** A short dollar amount: two significant digits under a cent, cents above. */
export function formatUsd(usd: number): string {
  if (usd === 0) return "$0";
  if (Math.abs(usd) >= 0.01) return `$${usd.toFixed(2)}`;
  const short = String(Number(usd.toPrecision(2)));
  return `$${short.includes("e") ? usd.toFixed(8) : short}`;
}

function rolloutLine(rollout: string, acting: boolean): string {
  if (rollout === "controlled" || rollout === "full") {
    return acting ? `Rollout: ${rollout}. This answer is reliable enough to act on.` : `Rollout: ${rollout}. The band is not high enough to act on alone, so verify first or ask the person.`;
  }
  return `Rollout: ${rollout}. This answer is advice only in this stage. Nothing was blocked.`;
}

/**
 * Format one check run. `label` names the check in the text ("done-check"). A run that failed
 * comes back as an error result that tells the model to carry on without the check.
 */
export function formatCheckResult(result: RunResult, label: string, explain: ExplainAnswer): ToolResult {
  const meta: JsonObject = { "bandwise/runId": result.runId, "bandwise/setId": result.setId, "bandwise/version": result.version };
  if (result.status !== "ok") {
    return {
      content: [{ type: "text", text: `The Bandwise ${label} could not be completed (${result.error?.code ?? result.status}). Carry on as you would without it.` }],
      isError: true,
      _meta: meta,
    };
  }

  const decisions = Object.entries(result.decisions).filter(([, d]) => d.relevant && d.value !== null);
  const lines: string[] = [];
  const answers: JsonObject = {};
  for (const [id, d] of decisions) {
    answers[id] = { value: d.value, band: d.band };
    lines.push(`${id}: ${String(d.value)} (${d.band} band)`);
    const why = explain(id, d.value);
    if (why !== undefined) lines.push(`Why: ${why}`);
  }
  if (decisions.length === 0) lines.push("No question applied to this input, so there is nothing to act on.");

  const acting = result.overallAction === "auto" && result.runBand === "high";
  const head = `Bandwise ${label}: ${result.route === null ? "no route" : result.route} (${result.runBand} band).`;
  const cost = `This check cost ${formatUsd(result.cost.systemOneCostUsd ?? 0)} and saved about ${formatUsd(result.cost.savingsUsd)}.`;
  const text = [head, ...lines, rolloutLine(result.rollout, acting), cost].join("\n");

  return {
    content: [{ type: "text", text }],
    structuredContent: { route: result.route, band: result.runBand, rollout: result.rollout, answers, actOnIt: acting && (result.rollout === "controlled" || result.rollout === "full") },
    _meta: meta,
  };
}

/** Any operation result, as JSON text for the model and as structured content. */
export function formatOperationResult(output: unknown): ToolResult {
  const structured: JsonObject = typeof output === "object" && output !== null && !Array.isArray(output) ? (output as JsonObject) : { result: output };
  return { content: [{ type: "text", text: JSON.stringify(output, null, 2) }], structuredContent: structured };
}

/** A refusal or a bad input, as a tool error the model can read and recover from. */
export function toolError(message: string): ToolResult {
  return { content: [{ type: "text", text: message }], isError: true };
}
