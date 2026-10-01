"use client";

import type { QuestionDef, Structured, SystemOneAnswer } from "@bandwise/core";

import { Badge, Button, Input } from "~/components/ui";

import { CommitInput, RequiredInput, StructuredEditor } from "./fields";
import { PolicyForm } from "./policy-form";
import { answerMarker, answerSummary, type Finding, freeOptionKey, type Policy, type QuestionRef, removeOption, renameOption, type Spec, updatePolicy, updateQuestion } from "./spec-edit";

const TYPE_LABEL = { noul: "Yes or no", choice: "Choice", score: "Score" } as const;
const KEY = /^[A-Za-z0-9_-]{1,64}$/;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 border-t border-rule pt-4">
      <h4 className="text-xs font-medium uppercase tracking-wide text-ink-3">{title}</h4>
      {children}
    </section>
  );
}

function ChoiceOptions({ spec, at, criteria, onSpec }: { spec: Spec; at: QuestionRef; criteria: Record<string, Structured | null>; onSpec: (s: Spec) => void }) {
  const keys = Object.keys(criteria);
  const setDescription = (key: string, v: Structured) =>
    onSpec(updateQuestion(spec, at, (q) => (q.type === "choice" ? { ...q, criteria: { ...q.criteria, [key]: v } } : q)));
  return (
    <div className="flex flex-col gap-4">
      {keys.map((key) => (
        <div key={key} className="grid gap-2 sm:grid-cols-[12rem_minmax(0,1fr)_auto] sm:items-start">
          <CommitInput
            label={`Option key ${key}`}
            value={key}
            invalid={(v) => (!KEY.test(v) ? "Use letters, digits, dashes or underscores." : keys.includes(v) ? "Another option has this key." : null)}
            onCommit={(to) => onSpec(renameOption(spec, at, key, to))}
          />
          <StructuredEditor label={`What ${key} means`} value={criteria[key]} onChange={(v) => setDescription(key, v)} />
          <Button size="sm" variant="ghost" disabled={keys.length <= 1} onClick={() => onSpec(removeOption(spec, at, key))} aria-label={`Remove option ${key}`}>
            Remove
          </Button>
        </div>
      ))}
      <div>
        <Button size="sm" onClick={() => setDescription(freeOptionKey(keys), "")}>
          Add option
        </Button>
      </div>
      <p className="text-xs text-ink-3">Renaming a key updates its stricter bar and composite terms. Check routes and conditions that name it.</p>
    </div>
  );
}

function ScoreLevels({ spec, at, levels, onSpec }: { spec: Spec; at: QuestionRef; levels: Structured[]; onSpec: (s: Spec) => void }) {
  const set = (next: Structured[]) => onSpec(updateQuestion(spec, at, (q) => (q.type === "score" ? { ...q, criteria: next } : q)));
  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-ink-3">Lowest level first. Keep between 2 and 10 levels.</p>
      {levels.map((level, i) => (
        <div key={i} className="flex items-start gap-2">
          <div className="flex-1">
            <StructuredEditor label={`Level ${i + 1}`} value={level} onChange={(v) => set(levels.map((l, j) => (j === i ? v : l)))} />
          </div>
          <Button size="sm" variant="ghost" disabled={levels.length <= 2} onClick={() => set(levels.filter((_, j) => j !== i))} aria-label={`Remove level ${i + 1}`}>
            Remove
          </Button>
        </div>
      ))}
      <div>
        <Button size="sm" disabled={levels.length >= 10} onClick={() => set([...levels, ""])}>
          Add level
        </Button>
      </div>
    </div>
  );
}

/** One question's form: its label, instructions, criteria and policy. */
export function QuestionForm({ spec, at, question, findings, answer, onSpec }: {
  spec: Spec;
  at: QuestionRef;
  question: QuestionDef;
  findings: readonly Finding[];
  /** The last preview's answer to this question, when there is one. */
  answer: SystemOneAnswer | undefined;
  onSpec: (s: Spec) => void;
}) {
  const edit = (change: (q: QuestionDef) => QuestionDef) => onSpec(updateQuestion(spec, at, change));
  const policy = spec.policies[at.id];
  const errors = findings.filter((f) => f.severity === "error").length;
  const warnings = findings.length - errors;
  const options = question.type === "choice" ? Object.keys(question.criteria) : [];

  return (
    <article id={`q-${at.id}`} className="flex flex-col gap-4 rounded-md border border-rule bg-paper-raised p-5">
      <header className="flex flex-wrap items-center gap-2">
        <h3 className="mr-auto text-base font-semibold text-ink">{question.meta.label}</h3>
        <span className="font-mono text-xs text-ink-3">{at.id}</span>
        <Badge>{TYPE_LABEL[question.type]}</Badge>
        {errors > 0 ? <Badge tone="danger">{errors === 1 ? "1 error" : `${errors} errors`}</Badge> : null}
        {warnings > 0 ? <Badge tone="info">{warnings === 1 ? "1 warning" : `${warnings} warnings`}</Badge> : null}
        {answer === undefined ? null : <Badge tone="neutral">Last preview: {answerSummary(answer)}</Badge>}
      </header>

      <div className="grid gap-3 sm:grid-cols-2">
        <RequiredInput label="Label" value={question.meta.label} onValueChange={(label) => edit((q) => ({ ...q, meta: { ...q.meta, label } }))} />
        <Input
          label="Description"
          hint="Optional. Shown to reviewers and in the manifest."
          value={question.meta.description ?? ""}
          onChange={(e) =>
            edit((q) => {
              const { description: _old, ...meta } = q.meta;
              return { ...q, meta: e.target.value === "" ? meta : { ...meta, description: e.target.value } } as QuestionDef;
            })
          }
        />
      </div>

      <StructuredEditor label="Instructions" value={question.instructions} onChange={(v) => edit((q) => ({ ...q, instructions: v }))} />

      <Section title="Criteria">
        {question.type === "noul" ? (
          <div className="grid gap-3 lg:grid-cols-2">
            <StructuredEditor label="Yes means" value={question.criteria?.true} onChange={(v) => edit((q) => (q.type === "noul" ? { ...q, criteria: { ...q.criteria, true: v } } : q))} />
            <StructuredEditor label="No means" value={question.criteria?.false} onChange={(v) => edit((q) => (q.type === "noul" ? { ...q, criteria: { ...q.criteria, false: v } } : q))} />
          </div>
        ) : question.type === "choice" ? (
          <ChoiceOptions spec={spec} at={at} criteria={question.criteria} onSpec={onSpec} />
        ) : (
          <ScoreLevels spec={spec} at={at} levels={question.criteria} onSpec={onSpec} />
        )}
      </Section>

      <Section title="Confidence policy">
        {policy === undefined ? (
          <p className="text-sm text-ink-2">This question has no policy, so it never sets a band. Add one in the JSON view under policies.{at.id}.</p>
        ) : (
          <PolicyForm
            policy={policy}
            options={options}
            context={question.meta.label || at.id}
            marker={answerMarker(answer)}
            answeredOption={answer?.type === "choice" && typeof answer.choice === "string" ? answer.choice : null}
            onChange={(p: Policy) => onSpec(updatePolicy(spec, at.id, () => p))}
          />
        )}
      </Section>

      {findings.length === 0 ? null : (
        <ul className="flex flex-col gap-1 rounded-sm bg-paper-sunk px-3 py-2 text-xs">
          {findings.map((f, i) => (
            <li key={i} className={f.severity === "error" ? "text-danger" : "text-ink-2"}>
              {f.message} <span className="font-mono text-ink-3">({f.rule})</span>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
