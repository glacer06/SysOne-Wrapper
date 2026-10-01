// The template pack as the landing page lists it. Titles and questions are copied from
// packages/templates/src/templates (the site imports only core, so keep them in step by hand).
// The job line is a short label for the card, not the template's own description.

export interface UseCase {
  id: string;
  title: string;
  /** One short line, under about 12 words. */
  job: string;
  /** One real question from the spec. */
  asks: string;
  types: ReadonlyArray<"noul" | "choice" | "score">;
  group: "review" | "ops" | "inbox" | "agents";
}

export const useCases: readonly UseCase[] = [
  {
    id: "pr-safety-gate",
    title: "PR safety gate",
    job: "Is this pull request safe to merge without a reviewer?",
    asks: "Does `pr.diff` delete tests, skip tests, loosen assertions, or lower a coverage or lint threshold?",
    types: ["noul"],
    group: "review",
  },
  {
    id: "security-finding-triage",
    title: "Security finding triage",
    job: "Is this scanner finding reachable, and how bad is it?",
    asks: "Can data an outside user controls reach the flagged code in `finding` (rule `finding.rule` in `finding.file`), judged from the code and data flow in `finding.context`?",
    types: ["noul", "score"],
    group: "review",
  },
  {
    id: "error-triage",
    title: "Error triage",
    job: "Who owns this error, and did the last release cause it?",
    asks: "Is `issue` likely caused by one of the changes shipped in the latest release, listed in `release.changes`?",
    types: ["choice", "score", "noul"],
    group: "ops",
  },
  {
    id: "log-line-pager",
    title: "Log-line pager",
    job: "Does this log line need a person on call now?",
    asks: "Does this log line show a problem that a person on call should look at right now, because users, data, or money are affected or soon will be?",
    types: ["noul"],
    group: "ops",
  },
  {
    id: "inbound-email-routing",
    title: "Inbound email routing",
    job: "Which queue gets this email, and does it need a reply today?",
    asks: "Which team should handle `email`, judged by what the sender wants? It arrived at the shared address `email.to`.",
    types: ["choice", "noul"],
    group: "inbox",
  },
  {
    id: "email-triage",
    title: "Email triage",
    job: "Does this email need the recipient soon?",
    asks: "What will it cost the recipient to ignore `email` for a week?",
    types: ["noul", "score", "choice"],
    group: "inbox",
  },
  {
    id: "lead-event-scoring",
    title: "Lead and event scoring",
    job: "How ready is this account to buy, and what next?",
    asks: "Given the recent product `events` of this `account`, which sales action fits best right now?",
    types: ["score", "choice"],
    group: "inbox",
  },
  {
    id: "wake-gate",
    title: "Wake gate",
    job: "Should this event wake the agent now, later or never?",
    asks: "An agent is asleep and waiting for something specific. Given this new event, what should happen to the agent?",
    types: ["choice"],
    group: "agents",
  },
  {
    id: "context-pruner",
    title: "Context pruner",
    job: "Does the agent still need this item for its task?",
    asks: "An agent is working on `task`. Would the agent need `item` in its context to finish that task correctly?",
    types: ["noul"],
    group: "agents",
  },
];

export const groupLabels: Record<UseCase["group"], string> = {
  review: "Code review",
  ops: "Ops and alerts",
  inbox: "Inbox and leads",
  agents: "Agent control",
};

export const typeLabels: Record<UseCase["types"][number], string> = {
  noul: "yes or no",
  choice: "pick one",
  score: "score",
};
