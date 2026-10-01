"use client";

import { QuestionSetSpec, type SystemOneAnswer } from "@bandwise/core";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Badge, Button, Card, CodeEditor, InlineAlert, Tabs, useToast } from "~/components/ui";
import { ConfirmDialog } from "~/components/ui/confirm-dialog";

import { saveDraftAction, validateDraftAction } from "../actions";
import { ThresholdSliders } from "./policy-form";
import { type LastPreview, PreviewPanel, type RecentRun } from "./preview-panel";
import { QuestionForm } from "./question-form";
import { type Finding, findingsFor, listQuestions, type Spec, toJsonText, updateCompositePolicy } from "./spec-edit";
import { useUnsavedGuard } from "./unsaved-guard";

export interface DraftEditorProps {
  slug: string;
  draftVersion: number;
  initialSpec: Spec;
  initialEtag: string;
  initialFindings: Finding[] | null;
  canEdit: boolean;
  recentRuns: RecentRun[];
  synthetic: boolean;
}

type SaveProblem =
  | { kind: "conflict"; message: string; currentEtag: string | null }
  | { kind: "invalid" | "error"; message: string; details: Finding[] };

/** The JSON text as a spec, or why not. Schema problems name the first path that fails. */
function parseText(text: string): { spec: Spec; raw: unknown } | { problem: string; raw: unknown } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    return { problem: e instanceof Error ? e.message : "Invalid JSON", raw: undefined };
  }
  const parsed = QuestionSetSpec.safeParse(raw);
  if (parsed.success) return { spec: parsed.data, raw };
  const issue = parsed.error.issues[0];
  const at = issue === undefined || issue.path.length === 0 ? "" : ` at ${issue.path.join(".")}`;
  return { problem: `The spec does not match the schema${at}: ${issue?.message ?? "invalid"}`, raw };
}

const LINT_DELAY_MS = 700;

export function DraftEditor({ slug, draftVersion, initialSpec, initialEtag, initialFindings, canEdit, recentRuns, synthetic }: DraftEditorProps) {
  const router = useRouter();
  const toast = useToast();
  const [text, setText] = useState(() => toJsonText(initialSpec));
  const [saved, setSaved] = useState({ spec: initialSpec, etag: initialEtag, text: toJsonText(initialSpec) });
  const [findings, setFindings] = useState<Finding[] | null>(initialFindings);
  const [linting, setLinting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<SaveProblem | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [last, setLast] = useState<LastPreview | null>(null);
  const reloadRequested = useRef(false);
  // The server already linted the saved draft, so the first lint waits for an edit.
  const lintedText = useRef(initialFindings === null ? null : toJsonText(initialSpec));

  const parsed = useMemo(() => parseText(text), [text]);
  const spec = "spec" in parsed ? parsed.spec : null;
  const dirty = spec === null || JSON.stringify(spec) !== JSON.stringify(saved.spec);

  // A newer draft from the server (after "Load the saved version", or a save elsewhere while
  // nothing here is edited) replaces what the editor shows.
  useEffect(() => {
    if (initialEtag === saved.etag) return;
    if (!reloadRequested.current && dirty) return;
    reloadRequested.current = false;
    const t = toJsonText(initialSpec);
    setSaved({ spec: initialSpec, etag: initialEtag, text: t });
    setText(t);
    setProblem(null);
    // Only a new server draft starts this; local edits must not, so `dirty` and `saved` are left out.
  }, [initialEtag, initialSpec]);

  // Lint what is on screen, saved or not, a moment after typing stops.
  useEffect(() => {
    if (parsed.raw === undefined || lintedText.current === text) return;
    const raw = parsed.raw;
    const timer = setTimeout(() => {
      lintedText.current = text;
      setLinting(true);
      void validateDraftAction(slug, raw).then((res) => {
        // A newer edit started its own lint; this answer is for older text.
        if (lintedText.current !== text) return;
        setLinting(false);
        if (res.status === "ok") setFindings([...res.errors, ...res.warnings] as Finding[]);
      });
    }, LINT_DELAY_MS);
    return () => clearTimeout(timer);
  }, [parsed.raw, slug, text]);

  // Unsaved edits: ask before a reload, a tab close, an in-app link, or back and forward.
  useUnsavedGuard(dirty);

  const editSpec = useCallback((next: Spec) => setText(toJsonText(next)), []);

  const save = useCallback(
    async (etag: string = saved.etag): Promise<Spec | null> => {
      if (spec === null) {
        setProblem({ kind: "invalid", message: "Fix the JSON view before saving.", details: [] });
        return null;
      }
      if (!dirty) return saved.spec;
      setSaving(true);
      const res = await saveDraftAction(slug, spec, etag);
      setSaving(false);
      if (res.status === "saved") {
        setSaved({ spec, etag: res.etag, text: toJsonText(spec) });
        setProblem(null);
        toast(`Saved the draft (v${draftVersion}).`);
        return spec;
      }
      if (res.status === "conflict") setProblem({ kind: "conflict", message: res.message, currentEtag: res.currentEtag });
      else setProblem({ kind: res.status, message: res.message, details: res.status === "invalid" ? (res.details as Finding[]) : [] });
      return null;
    },
    [dirty, draftVersion, saved, slug, spec, toast],
  );

  // Ctrl or Cmd + S saves.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (canEdit && dirty && !saving) void save();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canEdit, dirty, save, saving]);

  const errors = findings?.filter((f) => f.severity === "error") ?? [];
  const warnings = findings?.filter((f) => f.severity === "warning") ?? [];
  const answers: Record<string, SystemOneAnswer> = last?.kind === "run" ? last.result.answers : {};

  const formView =
    spec === null ? (
      <InlineAlert kind="error" title="The form cannot show this spec">
        {"problem" in parsed ? parsed.problem : null}. Fix it in the JSON view, or reset to the saved draft.
      </InlineAlert>
    ) : (
      <fieldset disabled={!canEdit} className="flex flex-col gap-5">
        {spec.stages.length > 1 ? <p className="text-sm text-bw-text-muted">Questions run in {spec.stages.length} stages, in the order below.</p> : null}
        {listQuestions(spec).map(({ stage, id, question }) => (
          <QuestionForm
            key={`${stage}-${id}`}
            spec={spec}
            at={{ stage, id }}
            question={question}
            findings={findingsFor(findings ?? [], { stage, id })}
            answer={answers[id]}
            onSpec={editSpec}
          />
        ))}
        {(spec.composites ?? []).map((c, i) =>
          c.policy === undefined ? null : (
            <article key={c.id} className="flex flex-col gap-3 rounded-md border border-bw-border bg-bw-surface p-5">
              <header className="flex flex-wrap items-center gap-2">
                <h3 className="mr-auto text-base font-semibold text-bw-text">{c.id}</h3>
                <Badge>Composite</Badge>
              </header>
              <p className="text-sm text-bw-text-muted">A weighted blend of {c.terms.length} terms. Its level picks the action; edit terms in the JSON view.</p>
              <ThresholdSliders value={c.policy.levelThresholds} marker={null} axis="Composite value" context={c.id} onChange={(t) => editSpec(updateCompositePolicy(spec, i, t))} />
            </article>
          ),
        )}
      </fieldset>
    );

  const jsonView = (
    <div className="flex flex-col gap-2">
      <CodeEditor label="Draft spec (JSON)" rows={28} value={text} onChange={setText} readOnly={!canEdit} />
      {"problem" in parsed && parsed.raw !== undefined ? <p className="text-xs text-bw-low-text">{parsed.problem}</p> : null}
    </div>
  );

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
      <div className="flex min-w-0 flex-col gap-4">
        <div className="sticky top-0 z-10 -mx-1 flex flex-wrap items-center gap-3 border-b border-bw-border bg-bw-bg px-1 py-3">
          <span className="text-sm text-bw-text-muted" role="status" aria-live="polite">
            {!canEdit ? "Read only: editors and above can change the draft." : saving ? "Saving..." : dirty ? "Unsaved changes" : "All changes saved"}
          </span>
          <span className="flex gap-2">
            {errors.length > 0 ? <Badge tone="danger">{errors.length === 1 ? "1 error" : `${errors.length} errors`}</Badge> : null}
            {warnings.length > 0 ? <Badge tone="info">{warnings.length === 1 ? "1 warning" : `${warnings.length} warnings`}</Badge> : null}
            {findings !== null && errors.length === 0 && warnings.length === 0 ? <Badge tone="good">Lints pass</Badge> : null}
            {linting ? <span className="text-xs text-bw-text-muted">Checking...</span> : null}
          </span>
          <span className="ml-auto flex gap-2">
            {dirty && canEdit ? (
              <Button size="sm" variant="ghost" onClick={() => setConfirmDiscard(true)}>
                Discard changes
              </Button>
            ) : null}
            {canEdit ? (
              <Button size="sm" variant="primary" pending={saving} disabled={!dirty || spec === null} onClick={() => void save()}>
                Save draft
              </Button>
            ) : null}
          </span>
        </div>

        <ConfirmDialog
          open={confirmDiscard}
          title="Discard unsaved changes?"
          confirmLabel="Discard changes"
          tone="danger"
          onCancel={() => setConfirmDiscard(false)}
          onConfirm={() => {
            setConfirmDiscard(false);
            setText(saved.text);
          }}
        >
          <p>Every edit since the last save goes back to the saved draft. This cannot be undone.</p>
        </ConfirmDialog>

        {problem === null ? null : problem.kind === "conflict" ? (
          <InlineAlert kind="error" title="This draft changed elsewhere">
            <p>{problem.message}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                size="sm"
                onClick={() => {
                  reloadRequested.current = true;
                  router.refresh();
                }}
              >
                Load the saved version
              </Button>
              {problem.currentEtag === null ? null : (
                <Button size="sm" variant="danger" onClick={() => void save(problem.currentEtag ?? undefined)}>
                  Save mine over it
                </Button>
              )}
            </div>
          </InlineAlert>
        ) : (
          <InlineAlert kind="error" title={problem.kind === "invalid" ? "The draft was not saved" : "Saving failed"}>
            <p>{problem.message}</p>
            {problem.details.length === 0 ? null : (
              <ul className="mt-1 list-disc pl-4 font-mono text-xs">
                {problem.details.map((d, i) => (
                  <li key={i}>
                    {d.path || "/"}: {d.message}
                  </li>
                ))}
              </ul>
            )}
          </InlineAlert>
        )}

        <Tabs
          label="Draft editor views"
          items={[
            { id: "form", label: "Form", content: formView },
            { id: "json", label: "JSON", content: jsonView },
          ]}
        />
      </div>

      <div className="flex min-w-0 flex-col gap-4 xl:sticky xl:top-4 xl:max-h-[calc(100dvh-2rem)] xl:self-start xl:overflow-y-auto">
        <PreviewPanel
          slug={slug}
          inputSchema={(spec ?? saved.spec).input.schema}
          recentRuns={recentRuns}
          synthetic={synthetic}
          dirty={dirty}
          canSave={canEdit}
          spec={spec}
          last={last}
          onPreview={setLast}
          saveFirst={() => (canEdit ? save() : Promise.resolve(saved.spec))}
        />
        <Card title="Checks" description="Lints from draft.validate on what is on screen, saved or not. Publish needs zero errors.">
          {findings === null ? (
            <p className="text-sm text-bw-text-muted">Checking the draft...</p>
          ) : findings.length === 0 ? (
            <p className="text-sm text-bw-text-muted">No errors or warnings.</p>
          ) : (
            <ul className="flex flex-col gap-2 text-sm">
              {[...errors, ...warnings].map((f, i) => (
                <li key={i} className="flex flex-col gap-0.5">
                  <span className="flex items-center gap-2">
                    <Badge tone={f.severity === "error" ? "danger" : "info"}>{f.severity === "error" ? "Error" : "Warning"}</Badge>
                    <span className="font-mono text-xs text-bw-text-muted">{f.rule}</span>
                  </span>
                  <span className="text-bw-text">{f.message}</span>
                  {f.path === "" ? null : <span className="font-mono text-xs text-bw-text-muted">{f.path}</span>}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
