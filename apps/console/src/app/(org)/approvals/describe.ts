// How the Approvals inbox names a request and why it waited for a person. The conditions mirror
// the risk functions in server/operations (management-api.md, Approvals; security.md). Pure.

import type { RolloutStage } from "@bandwise/core";

import { STAGE_LABEL } from "../sets/[ref]/releases/stages";

const OPERATION_LABEL: Record<string, string> = {
  "set.publish": "Publish the draft",
  "channel.promote": "Promote staging to production",
  "rollout.change": "Change the rollout stage",
  "set.update": "Change set settings",
  "agent_token.create": "Create an agent token",
  "app_token.create": "Create an app token",
  "settings.update": "Change org settings",
  "experiment.start": "Start an experiment",
  "experiment.promote": "Promote an experiment's challenger",
};

export function operationLabel(opId: string): string {
  return OPERATION_LABEL[opId] ?? opId;
}

/** What the inbox knows about the set a request touches, from set.get. */
export interface SetFacts {
  protected: boolean;
  stages: Partial<Record<"production" | "staging", RolloutStage>>;
}

const str = (v: unknown) => (typeof v === "string" ? v : undefined);

/** One sentence: why this call needed a person instead of running at once. */
export function riskReason(opId: string, input: Record<string, unknown>, set: SetFacts | null): string {
  switch (opId) {
    case "set.publish":
    case "channel.promote": {
      if (input["skipExperiment"] !== undefined) return "It skips the champion and challenger experiment on a live set.";
      if (set?.protected === true) return "The set is protected, so every production release needs a person.";
      const stage = set?.stages.production;
      if (stage === "controlled" || stage === "full") {
        return `Production is ${STAGE_LABEL[stage]}, so the new version acts on live decisions as soon as it is published.`;
      }
      return "A production release on a live or protected set needs a person.";
    }
    case "rollout.change": {
      const channel = str(input["channel"]) === "staging" ? "staging" : "production";
      const from = set?.stages[channel];
      const to = str(input["stage"]);
      if (from === "paused") return `It lifts the pause on ${channel}.`;
      if (to === "full") return `It moves ${channel} to Full, where every decision acts by policy.`;
      return `It moves ${channel} to Controlled, where high band decisions start to act.`;
    }
    case "set.update":
      return "It moves the set's storage to a less private mode.";
    case "agent_token.create":
    case "app_token.create":
      return "The new token could change org data.";
    case "settings.update":
      return "It touches PII mode, retention, or the approval setting.";
    case "experiment.start":
      return "It sends more than 25 percent of runs to the challenger.";
    default:
      return "Agents need a person to approve this operation.";
  }
}

/** The set a request names, if any. */
export function setRefOf(input: Record<string, unknown>): string | null {
  return str(input["ref"]) ?? null;
}

/** "in 6 days", "in 3 hours", "in 12 minutes", or "now". */
export function timeLeft(expiresAt: string, now: Date): string {
  const ms = new Date(expiresAt).getTime() - now.getTime();
  if (!(ms > 60_000)) return "now";
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `in ${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `in ${hours} ${hours === 1 ? "hour" : "hours"}`;
  const days = Math.floor(hours / 24);
  return `in ${days} days`;
}
