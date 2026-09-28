// The kit's README.md and the short per-package READMEs npm shows. The template list comes from
// the template pack, so the README never drifts from what ships.

export interface ReadmeTemplate {
  id: string;
  title: string;
  job: string;
  questions: string[];
}

const table = (rows: readonly ReadmeTemplate[]): string =>
  [
    "| Template | What it decides | Questions |",
    "|---|---|---|",
    ...rows.map((t) => `| \`${t.id}\` | ${t.job} | ${t.questions.map((q) => `\`${q}\``).join(", ")} |`),
  ].join("\n");

/** The root README of the public kit repository. */
export function kitReadme(templates: readonly ReadmeTemplate[]): string {
  return `# Bandwise kit

Bandwise turns the yes/no, pick-one and score decisions your app sends to an LLM today into small, typed question sets that run on a System One model such as Jev. Each answer comes back with a confidence band and an action, so your code knows when to act on its own and when to ask a person.

Bandwise is an independent product built on TypeSafe's System One models.

This repository is the free, open part of Bandwise, under the Apache License 2.0:

- the question set spec format and the run engine (\`@bandwise/core\`)
- the \`bandwise\` command with a local mode that runs a spec on a state with no network and no key (\`@bandwise/cli\`)
- the transports that call a System One model with your own key, or answer from fixtures (\`@bandwise/system-one-client\`)
- a template pack of ready specs with example states (\`@bandwise/templates\`)
- a Claude Code skill, find-decisions, that finds LLM calls in your code that are really decisions and drafts a spec for each

## Quickstart

You need Node 22 or later.

\`\`\`sh
git clone https://github.com/glacer06/bandwise-kit.git
cd bandwise-kit
npx @bandwise/cli run --local examples/email-triage.spec.json examples/email-triage.state.json
\`\`\`

To work on the kit itself, build from source instead:

\`\`\`sh
pnpm install && pnpm -r build
node packages/cli/dist/bin.js run --local examples/email-triage.spec.json examples/email-triage.state.json
\`\`\`

The output lists every decision with its value, band and action, the overall action, the route, and what the run would cost. Add \`--json\` to get the full result envelope instead.

Local mode makes no network call and needs no key. It answers from recorded fixtures when one matches the request and from synthetic answers otherwise, and it says which. Synthetic answers are not model output: local mode proves that a spec and a state are valid and shows how the bands and actions play out. It does not tell you whether the answers are right.

Try any template the same way:

\`\`\`sh
npx @bandwise/cli run --local \\
  plugins/claude-code/skills/find-decisions/templates/pr-safety-gate.spec.json \\
  plugins/claude-code/skills/find-decisions/templates/pr-safety-gate.state.json
\`\`\`

Other options: \`--provider typesafe|openrouter|vercel\`, \`--rollout shadow|controlled|full|paused\` and \`--channel production|staging\`. Run \`npx @bandwise/cli --help\` for the full usage.

## How a question set works

A question set is one JSON spec. It names the model, describes the input state with a JSON Schema, asks questions in one or more stages, and sets a policy for every question. Later stages can read earlier answers. Routes turn the answers into one output your app branches on, such as \`urgent\` or \`read_later\`.

### Three answer types

| Type | Asks | Answer |
|---|---|---|
| \`noul\` | Does this hold? Yes or no. | The probability of yes, from 0 to 1. |
| \`choice\` | Which one of these options? | The chosen option with a probability for every option. Give every choice a "none of these" option. |
| \`score\` | How much, on a fixed rubric? | A probability-weighted level on an ordered rubric you write. |

Exact rules such as a sender domain, a length or a date comparison do not belong in a question. Put them in the spec's \`checks\` or keep them in code.

### Bands and actions

Every answer lands in a band: \`high\`, \`medium\` or \`low\`. The policy sets the thresholds. For a noul, \`trueAt\` and \`falseAt\` mark a confident yes or no, and \`reviewMargin\` widens them into the medium band. A noul near 0.5 means yes and no are about equally likely, so it lands in the low band with no value. For a choice or a score, the thresholds apply to the answer's confidence.

Each band maps to an action:

| Action | What your app does |
|---|---|
| \`auto\` | Act on the answer. |
| \`review\` | Hold the decision for a person. |
| \`fallback\` | Do what the policy's fallback says: use a fixed value, run another set, or do nothing. |
| \`escalate_to_llm\` | Send this case to the LLM you use today. |

Gating questions decide the run's overall action. The rollout stage limits what may act. In \`full\` every decision takes its policy action. In \`controlled\` only the high band acts, and other gating decisions go to \`review\`. In \`shadow\` and \`paused\` nothing acts and every decision comes back as \`fallback\`. If the model is unavailable, the spec's \`onUnavailable\` rule applies instead, and it defaults to \`review\`.

Confidence is the spread of the model's answer, not the chance of being right. Treat the template thresholds as starting points and tune them on 20 to 50 labeled examples from your own data.

## Templates

The template pack (\`@bandwise/templates\`) ships ${templates.length} specs. Each has two or three example states and one borderline case per question. The same specs, with one example state each, sit in \`plugins/claude-code/skills/find-decisions/templates/\`.

${table(templates)}

\`\`\`ts
import { TEMPLATES, getTemplate } from "@bandwise/templates";

const triage = getTemplate("email-triage");
console.log(triage?.spec.stages[0]?.questions);
\`\`\`

The templates are checked to run. They are not measured for accuracy.

## The find-decisions skill for Claude Code

find-decisions scans a repository for LLM calls whose output is used as a decision: compared to fixed strings, parsed as yes or no, compared to a cutoff, or used to pick from a list. It classifies each one as noul, choice or score, flags poor fits, ranks the rest, drafts a spec from the closest template for the top candidates, validates each draft with \`bandwise run --local\` when the CLI is installed, and writes a short report to \`bandwise/find-decisions-report.md\`. It runs on your machine and never sends code anywhere.

Install it into a project:

\`\`\`sh
mkdir -p .claude/skills
cp -R /path/to/bandwise-kit/plugins/claude-code/skills/find-decisions .claude/skills/
\`\`\`

Or into your user folder to use it in every project: copy the same folder to \`~/.claude/skills/\`. Then ask Claude Code to "find decisions in this repo".

## Calling a model with your own key

\`@bandwise/core\` runs a spec through ports you provide, and \`@bandwise/system-one-client\` provides the transport. \`SdkTransport\` calls TypeSafe directly, or OpenRouter or the Vercel AI Gateway, with a key you hold. Keep that key on your server. Never put it in a browser bundle or paste it into a chat tool.

## Bandwise Cloud

The kit runs one spec at a time on your machine. Bandwise Cloud is the optional hosted product around it: versioned sets with rollout and rollback, a review queue for decisions held for a person, a savings ledger that records what every run cost against the LLM it replaced, and calibration of thresholds on your own labels. Nothing in the kit needs it. See https://www.bandwise.dev.

## Development

\`\`\`sh
pnpm install
pnpm lint && pnpm typecheck && pnpm test && pnpm build
pnpm bandwise run --local examples/email-triage.spec.json examples/email-triage.state.json
\`\`\`

See \`CONTRIBUTING.md\`. Report security problems privately, as \`SECURITY.md\` describes.

## License

Apache License 2.0. See \`LICENSE\` and \`NOTICE\`.
`;
}

const PACKAGE_BLURBS: Record<string, string> = {
  core: "The Bandwise question set spec format, lints and run engine. Pure TypeScript with no I/O: contracts (zod), the spec compiler, the stage runner, the confidence router, and cost and savings math.",
  "system-one-client":
    "Transports for Bandwise runs: `SdkTransport` calls a System One model through TypeSafe, OpenRouter or the Vercel AI Gateway with your own key, and `FixtureTransport` (from `@bandwise/system-one-client/fixture`) answers from recorded fixtures with no network.",
  templates: "The Bandwise template pack: ready question set specs, each with example states and a borderline case per question.",
  cli: "The `bandwise` command. `bandwise run --local spec.json state.json` runs a question set spec on a state with no network and no key.",
};

/** The short README npm shows on a package page. */
export function packageReadme(dir: string, name: string): string {
  const blurb = PACKAGE_BLURBS[dir];
  if (blurb === undefined) throw new Error(`kit export: no README blurb for packages/${dir}`);
  const usage =
    dir === "cli"
      ? "\n```sh\nnpx @bandwise/cli run --local spec.json state.json\nnpx @bandwise/cli --help\n```\n"
      : `\n\`\`\`sh\nnpm install ${name}\n\`\`\`\n`;
  return `# ${name}

${blurb}

Bandwise is an independent product built on TypeSafe's System One models.
${usage}
Documentation: https://docs.bandwise.dev. Source, examples and the template list: https://github.com/glacer06/bandwise-kit.

Apache License 2.0.
`;
}
