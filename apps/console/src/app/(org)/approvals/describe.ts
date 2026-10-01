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

const CHANNEL = (v: unknown) => (str(v) === "staging" ? "staging" : "production");

/** What the agent wants to do, as one plain sentence with the set and channel it touches. */
export function requestSentence(opId: string, input: Record<string, unknown>): string {
  const ref = setRefOf(input);
  const on = ref === null ? "" : ` on ${ref}`;
  switch (opId) {
    case "set.publish":
      return `Publish the draft${on} to ${CHANNEL(input["channel"])}.`;
    case "channel.promote":
      return `Promote what staging serves${on} to production.`;
    case "rollout.change": {
      const to = str(input["stage"]);
      const label = to !== undefined && to in STAGE_LABEL ? STAGE_LABEL[to as RolloutStage] : (to ?? "another stage");
      return `Move ${CHANNEL(input["channel"])}${on} to ${label}.`;
    }
    case "set.update":
      return `Change the settings${on}.`;
    case "agent_token.create":
      return "Create a new agent token.";
    case "app_token.create":
      return "Create a new app token.";
    case "settings.update":
      return "Change the org's settings.";
    case "experiment.start":
      return `Start an experiment${on}.`;
    case "experiment.promote":
      return `Promote an experiment's challenger${on}.`;
    default:
      return `Run ${opId}${on}.`;
  }
}

/** How the change is undone if it turns out wrong. Moves toward safety never wait for approval. */
export function undoNote(opId: string): string {
  switch (opId) {
    case "set.publish":
    case "channel.promote":
    case "experiment.promote":
      return "Published versions can be rolled back in one step, and rollback never waits for approval.";
    case "rollout.change":
      return "The stage can be moved back or paused at any time, and those moves never wait for approval.";
    case "agent_token.create":
    case "app_token.create":
      return "A token can be revoked at any time.";
    default:
      return "Every change is on the audit log, and moves toward safety never wait for approval.";
  }
}

export type TrailState = "done" | "current" | "todo";

export interface TrailStep {
  label: string;
  /** "2026-10-01 07:05 UTC", or null for a step with no time of its own. */
  at: string | null;
  detail: string;
  state: TrailState;
}

type RequestStatus = "pending" | "approved" | "rejected" | "expired" | "executed";

const DECIDED: Record<Exclude<RequestStatus, "pending">, string> = {
  approved: "Approved. It runs as the agent's token.",
  executed: "Approved, and it ran.",
  rejected: "Denied. Nothing ran.",
  expired: "Expired without a decision. Nothing ran.",
};

/** The request's trail: proposed, waiting, decided. */
export function trailSteps(
  item: { status: RequestStatus; createdAt: string; expiresAt: string; decidedAt?: string; requestedBy: { name?: string; tokenName?: string } },
  now: Date,
  time: (iso: string) => string,
): TrailStep[] {
  const by = item.requestedBy.tokenName === undefined ? "an agent token" : `the token "${item.requestedBy.tokenName}"`;
  const proposed: TrailStep = { label: "Proposed", at: time(item.createdAt), detail: `${item.requestedBy.name ?? "A member"}, through ${by}.`, state: "done" };
  if (item.status === "pending") {
    return [
      proposed,
      { label: "Waiting on a person", at: null, detail: `Anyone whose role can decide it, which includes you. Expires ${timeLeft(item.expiresAt, now)}.`, state: "current" },
      { label: "Decided", at: null, detail: "Nothing runs until then.", state: "todo" },
    ];
  }
  const at = item.status === "expired" ? item.expiresAt : item.decidedAt;
  return [
    proposed,
    { label: "Waited", at: null, detail: "Held for a person.", state: "done" },
    { label: "Decided", at: at === undefined ? null : time(at), detail: DECIDED[item.status], state: "current" },
  ];
}
