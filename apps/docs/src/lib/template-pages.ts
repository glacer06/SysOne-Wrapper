// The Templates section, rendered from @bandwise/templates so the pages never drift from the pack.
// test/templates.test.ts checks the committed pages against this output; run
// `pnpm --filter @bandwise/docs generate:templates` after changing a template.

import { specQuestions } from "@bandwise/core";
import { TEMPLATES, type Template } from "@bandwise/templates";

/** Escape MDX syntax in prose, leaving inline code spans alone. */
export function mdxText(text: string): string {
  return text
    .split(/(`[^`]*`)/)
    .map((part) => (part.startsWith("`") ? part : part.replace(/[{}<>]/g, (c) => `\\${c}`)))
    .join("");
}

/** A one-line cell for a Markdown table. */
function cell(text: string): string {
  return mdxText(text).replace(/\|/g, "\\|").replace(/\n/g, " ");
}

const json = (value: unknown): string => JSON.stringify(value, null, 2);

function instructionText(instructions: unknown): string {
  if (typeof instructions === "string") return instructions;
  if (instructions !== null && typeof instructions === "object" && !Array.isArray(instructions)) {
    const q = (instructions as Record<string, unknown>)["question"];
    if (typeof q === "string") return q;
  }
  return JSON.stringify(instructions);
}

function answerShape(t: Template, id: string): string {
  const q = specQuestions(t.spec).find((e) => e.id === id)?.question;
  if (q === undefined) return "";
  if (q.type === "noul") return "true or false";
  if (q.type === "choice") return Object.keys(q.criteria).map((k) => `\`${k}\``).join(", ");
  return `${q.criteria.length} levels`;
}

function frontmatter(title: string, description: string): string {
  return `---\ntitle: ${JSON.stringify(title)}\ndescription: ${JSON.stringify(description)}\n---\n`;
}

const GENERATED_NOTE = "{/* Generated from the template pack (packages/templates). Do not edit by hand. */}";

function templatePage(t: Template): string {
  const questions = specQuestions(t.spec);
  const policyOf = (id: string): string => {
    const p = t.spec.policies[id];
    return p === undefined ? "" : p.gating ? "yes" : "no";
  };
  const lines = [
    frontmatter(t.title, t.job),
    GENERATED_NOTE,
    "",
    `${mdxText(t.job)} Pattern: \`${t.pattern}\`. Model: \`${t.spec.model}\`. Outage rule: \`${t.spec.onUnavailable ?? "review"}\`.`,
    "",
    "## When to use it",
    "",
    ...t.whenToUse.map((s) => `- ${mdxText(s)}`),
    "",
    "## When not to use it",
    "",
    ...t.whenNotToUse.map((s) => `- ${mdxText(s)}`),
    "",
    "## Questions",
    "",
    "| Id | Type | Asks | Answers | Gating |",
    "| --- | --- | --- | --- | --- |",
    ...questions.map(({ id, question }) =>
      `| \`${id}\` | ${question.type} | ${cell(instructionText(question.instructions))} | ${answerShape(t, id)} | ${policyOf(id)} |`,
    ),
    "",
    "## Reading the result",
    "",
    ...t.notes.map((s) => `- ${mdxText(s)}`),
    "",
    "## Spec",
    "",
    `Save it as \`bandwise/sets/${t.id}.json\` and edit it for your data.`,
    "",
    `\`\`\`json title="${t.id}.spec.json"`,
    json(t.spec),
    "```",
    "",
    "## Example states",
    "",
    "The expected outcome is what a person would decide. It is not a recorded model answer.",
    "",
    ...t.examples.flatMap((e) => [`### ${mdxText(e.name)}`, "", `Expected: ${mdxText(e.expect)}`, "", "```json", json(e.state), "```", ""]),
    "## Borderline cases",
    "",
    "One case near the line for each question. Use them to test your wording before you trust the thresholds.",
    "",
    ...Object.entries(t.borderline).flatMap(([id, b]) => [`### \`${id}\``, "", mdxText(b.why), "", "```json", json(b.state), "```", ""]),
    "## Try it",
    "",
    "Save an example state as `state.json`, then run the spec locally. Local mode makes no network call and needs no key; answers are synthetic unless a recorded fixture matches.",
    "",
    "```bash",
    `pnpm bandwise run --local bandwise/sets/${t.id}.json state.json`,
    "```",
    "",
  ];
  return lines.join("\n");
}

function indexPage(templates: readonly Template[]): string {
  return [
    frontmatter("Templates", "Ready-made question sets for common decisions, with example states and borderline cases."),
    GENERATED_NOTE,
    "",
    "Each template is a complete spec you can copy, edit and run. It comes with two or three example states and one borderline case per question, so you can test the wording on hard cases before you tune thresholds. Every template sends outages to review.",
    "",
    "The template pack is part of the free %product% kit, licensed Apache-2.0. The [find decisions](/docs/find-decisions) skill uses it to draft specs from the LLM calls in your code.",
    "",
    "| Template | Pattern | Job |",
    "| --- | --- | --- |",
    ...templates.map((t) => `| [${cell(t.title)}](/docs/templates/${t.id}) | \`${t.pattern}\` | ${cell(t.job)} |`),
    "",
    "## Using a template",
    "",
    "1. Copy the spec into your repository as `bandwise/sets/<slug>.json`.",
    "2. Rename the state fields to match your data, and update `input.schema`.",
    "3. Rewrite the instructions and options for your case. The question id is never sent to the model, so the instructions carry the whole requirement.",
    "4. Run the example and borderline states with `pnpm bandwise run --local`.",
    "5. Label real examples and tune the thresholds on them. The thresholds in a template are starting points, not measured values.",
    "",
  ].join("\n");
}

/** Every generated file, keyed by its path relative to content/docs/templates. */
export function renderTemplatePages(templates: readonly Template[] = TEMPLATES): Record<string, string> {
  const files: Record<string, string> = {
    "meta.json": `${JSON.stringify({ title: "Templates", pages: ["index", ...templates.map((t) => t.id)] }, null, 2)}\n`,
    "index.mdx": indexPage(templates),
  };
  for (const t of templates) files[`${t.id}.mdx`] = templatePage(t);
  return files;
}
