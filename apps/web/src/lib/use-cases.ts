// The template pack as the landing page lists it. Titles, jobs and questions are copied from
// packages/templates/src/templates (the site imports only core, so keep them in step by hand).

export interface UseCase {
  id: string;
  title: string;
  job: string;
  /** One real question from the spec. */
  asks: string;
  types: ReadonlyArray<"noul" | "choice" | "score">;
  group: "engineering" | "inbox" | "agents" | "revenue";
}

export const useCases: readonly UseCase[] = [
  {
    id: "pr-safety-gate",
    title: "PR safety gate",
    job: "Decide whether a pull request is safe to merge without a human reviewer.",
    asks: "Does `pr.diff` delete tests, skip tests, loosen assertions, or lower a coverage or lint threshold?",
    types: ["noul"],
    group: "engineering",
  },
  {
    id: "error-triage",
    title: "Error triage",
    job: "Decide which team owns a new error tracker issue, how much it hurts users, and whether the latest release caused it.",
    asks: "Is `issue` likely caused by one of the changes shipped in the latest release, listed in `release.changes`?",
    types: ["choice", "score", "noul"],
    group: "engineering",
  },
  {
    id: "security-finding-triage",
    title: "Security finding triage",
    job: "Decide whether a static analysis finding is reachable from user input, and how bad it is in context.",
    asks: "Can data an outside user controls reach the flagged code in `finding` (rule `finding.rule` in `finding.file`), judged from the code and data flow in `finding.context`?",
    types: ["noul", "score"],
    group: "engineering",
  },
  {
    id: "log-line-pager",
    title: "Log-line pager",
    job: "Decide whether one log line needs a human now, so only real problems page someone.",
    asks: "Does this log line show a problem that a person on call should look at right now, because users, data, or money are affected or soon will be?",
    types: ["noul"],
    group: "engineering",
  },
  {
    id: "inbound-email-routing",
    title: "Inbound email routing",
    job: "Send each email that reaches a shared address to the right queue, and flag the ones that need a human reply today.",
    asks: "Which team should handle `email`, judged by what the sender wants? It arrived at the shared address `email.to`.",
    types: ["choice", "noul"],
    group: "inbox",
  },
  {
    id: "email-triage",
    title: "Email triage",
    job: "Decide whether an email needs the recipient soon, and what kind of message it is.",
    asks: "What will it cost the recipient to ignore `email` for a week?",
    types: ["noul", "score", "choice"],
    group: "inbox",
  },
  {
    id: "wake-gate",
    title: "Wake gate",
    job: "Decide whether an event should wake a sleeping agent now, later, or not at all.",
    asks: "An agent is asleep and waiting for something specific. Given this new event, what should happen to the agent?",
    types: ["choice"],
    group: "agents",
  },
  {
    id: "context-pruner",
    title: "Context pruner",
    job: "Decide, item by item, whether an agent's context item still matters for the current task, and drop the rest unchanged.",
    asks: "An agent is working on `task`. Would the agent need `item` in its context to finish that task correctly?",
    types: ["noul"],
    group: "agents",
  },
  {
    id: "lead-event-scoring",
    title: "Lead and event scoring",
    job: "Score how ready an account is to buy from its recent product events, and pick the next sales action.",
    asks: "Given the recent product `events` of this `account`, which sales action fits best right now?",
    types: ["score", "choice"],
    group: "revenue",
  },
];

export const groupLabels: Record<UseCase["group"], string> = {
  engineering: "Engineering",
  inbox: "Shared inboxes",
  agents: "Agents",
  revenue: "Revenue",
};

export const typeLabels: Record<UseCase["types"][number], string> = {
  noul: "yes or no",
  choice: "pick one",
  score: "score",
};
