// Pure helpers behind the draft editor. Each edit returns a new spec and leaves the old one alone,
// so React state stays simple and every helper is tested without a browser.

import {
  type ActionRef,
  type Band,
  type BandActions,
  noulBand,
  type NoulThresholds,
  type QuestionDef,
  type QuestionSetSpec,
  type RunResult,
  routeAnswers,
  type Structured,
  type SystemOneAnswer,
  thresholdBand,
  type Thresholds,
} from "@bandwise/core";

export type Spec = QuestionSetSpec;
export type Policy = Spec["policies"][string];

/** Where a question lives: its stage index and id. */
export interface QuestionRef {
  stage: number;
  id: string;
}

export function listQuestions(spec: Spec): Array<QuestionRef & { question: QuestionDef }> {
  return spec.stages.flatMap((s, stage) => Object.entries(s.questions).map(([id, question]) => ({ stage, id, question })));
}

export function updateQuestion(spec: Spec, at: QuestionRef, change: (q: QuestionDef) => QuestionDef): Spec {
  const next = structuredClone(spec);
  const stage = next.stages[at.stage];
  const q = stage?.questions[at.id];
  if (stage === undefined || q === undefined) return spec;
  stage.questions[at.id] = change(q);
  return next;
}

export function updatePolicy(spec: Spec, id: string, change: (p: Policy) => Policy): Spec {
  const p = spec.policies[id];
  if (p === undefined) return spec;
  const next = structuredClone(spec);
  next.policies[id] = change(structuredClone(p));
  return next;
}

export function updateCompositePolicy(spec: Spec, index: number, levelThresholds: Thresholds): Spec {
  const c = spec.composites?.[index];
  if (c?.policy === undefined) return spec;
  const next = structuredClone(spec);
  const policy = next.composites?.[index]?.policy;
  if (policy !== undefined) policy.levelThresholds = levelThresholds;
  return next;
}

/** A band's action with a new kind. The handler stays; config belongs to the old kind, so it goes. */
export function withActionKind(ref: ActionRef, kind: ActionRef["kind"]): ActionRef {
  if (ref.kind === kind) return ref;
  return (ref.handler === undefined ? { kind } : { kind, handler: ref.handler }) as ActionRef;
}

export function setBandAction(actions: BandActions, band: Band, kind: ActionRef["kind"]): BandActions {
  return { ...actions, [band]: withActionKind(actions[band], kind) };
}

// ---------------------------------------------------------------------------
// Choice options and score levels

/**
 * Rename a choice option everywhere the spec names it by key: the criteria (order kept), the
 * policy's perOption bars and composite terms. Routes and conditions are left to the lints.
 */
export function renameOption(spec: Spec, at: QuestionRef, from: string, to: string): Spec {
  const q = spec.stages[at.stage]?.questions[at.id];
  if (q?.type !== "choice" || from === to || to.length === 0 || !(from in q.criteria) || to in q.criteria) return spec;
  const next = updateQuestion(spec, at, (old) => {
    if (old.type !== "choice") return old;
    const criteria = Object.fromEntries(Object.entries(old.criteria).map(([k, v]) => [k === from ? to : k, v]));
    return { ...old, criteria };
  });
  const policy = next.policies[at.id];
  if (policy?.type === "choice" && policy.perOption?.[from] !== undefined) {
    policy.perOption = Object.fromEntries(Object.entries(policy.perOption).map(([k, v]) => [k === from ? to : k, v]));
  }
  for (const c of next.composites ?? []) {
    for (const term of c.terms) if ("q" in term && term.q === at.id && term.option === from) term.option = to;
  }
  return next;
}

/** A free option key: option_2, option_3 and so on. */
export function freeOptionKey(existing: readonly string[]): string {
  for (let i = existing.length + 1; ; i++) {
    const key = `option_${i}`;
    if (!existing.includes(key)) return key;
  }
}

export function removeOption(spec: Spec, at: QuestionRef, key: string): Spec {
  const q = spec.stages[at.stage]?.questions[at.id];
  if (q?.type !== "choice" || Object.keys(q.criteria).length <= 1) return spec;
  const next = updateQuestion(spec, at, (old) => {
    if (old.type !== "choice") return old;
    return { ...old, criteria: without(old.criteria, key) };
  });
  const policy = next.policies[at.id];
  if (policy?.type === "choice" && policy.perOption?.[key] !== undefined) next.policies[at.id] = togglePerOption(policy, key, false);
  return next;
}

function without<T>(record: Record<string, T>, key: string): Record<string, T> {
  return Object.fromEntries(Object.entries(record).filter(([k]) => k !== key));
}

/** Turn a stricter bar for one option on (copying the shared thresholds) or off. */
export function togglePerOption(policy: Policy, key: string, on: boolean): Policy {
  if (policy.type !== "choice") return policy;
  const perOption = on ? { ...policy.perOption, [key]: { ...policy.thresholds } } : without(policy.perOption ?? {}, key);
  const { perOption: _old, ...rest } = policy;
  return Object.keys(perOption).length === 0 ? rest : { ...rest, perOption };
}

// ---------------------------------------------------------------------------
// Structured text fields

/**
 * How the form edits a Structured value: plain text, a set of named text fields (string or list
 * of strings, one per line), or only in the JSON view.
 */
export type StructuredShape =
  | { kind: "text"; value: string }
  | { kind: "fields"; fields: Array<{ key: string; value: string; list: boolean }> }
  | { kind: "json" };

export function structuredShape(value: Structured | null | undefined): StructuredShape {
  if (value === undefined || value === null) return { kind: "text", value: "" };
  if (typeof value === "string") return { kind: "text", value };
  if (Array.isArray(value)) return { kind: "json" };
  const fields: Array<{ key: string; value: string; list: boolean }> = [];
  for (const [key, v] of Object.entries(value)) {
    if (typeof v === "string") fields.push({ key, value: v, list: false });
    else if (Array.isArray(v) && v.every((x) => typeof x === "string")) fields.push({ key, value: v.join("\n"), list: true });
    else return { kind: "json" };
  }
  return { kind: "fields", fields };
}

/** Write one named field back into a Structured object. A list field keeps one item per non-empty line. */
export function setStructuredField(value: Structured, key: string, text: string, list: boolean): Structured {
  if (typeof value !== "object" || Array.isArray(value)) return value;
  return { ...value, [key]: list ? text.split("\n").filter((l) => l.trim().length > 0) : text };
}

// ---------------------------------------------------------------------------
// Band maps for the threshold sliders

export interface BandSegment {
  from: number;
  to: number;
  band: Band;
  /** noul: the value the segment gives (true, false or null). */
  value?: boolean | null;
}

const STEPS = 200;

/** Merge sampled points into segments. Sampling uses core's own band rule, so the picture matches runs. */
function segments(at: (x: number) => { band: Band; value?: boolean | null }): BandSegment[] {
  const out: BandSegment[] = [];
  for (let i = 0; i <= STEPS; i++) {
    const x = i / STEPS;
    const r = at(x);
    const last = out[out.length - 1];
    if (last !== undefined && last.band === r.band && last.value === r.value) last.to = x;
    else out.push({ from: x, to: x, ...r });
  }
  return out;
}

export function noulSegments(t: NoulThresholds): BandSegment[] {
  return segments((x) => {
    const r = noulBand(x, t);
    return { band: r.band, value: r.value as boolean | null };
  });
}

export function thresholdSegments(t: Thresholds): BandSegment[] {
  return segments((x) => ({ band: thresholdBand(x, t) }));
}

/** The noul_order lint in plain words, so the slider says it before a validate round trip. */
export function noulProblem({ trueAt, falseAt, reviewMargin }: NoulThresholds): string | null {
  if (falseAt <= 0 || trueAt >= 1) return "Keep both bars strictly between 0 and 1.";
  if (falseAt >= trueAt) return "The false bar must sit below the true bar.";
  if (falseAt + reviewMargin >= trueAt - reviewMargin) return "The review margins meet or overlap. Narrow the margin or move the bars apart.";
  return null;
}

/** The thresholds_order lint in plain words. */
export function thresholdsProblem(t: Thresholds): string | null {
  return t.medium > t.high ? "The medium bar must not sit above the high bar." : null;
}

// ---------------------------------------------------------------------------
// Preview

/** True when the questions themselves changed, so a past run's answers no longer fit the spec. */
export function questionsChanged(a: Spec, b: Spec): boolean {
  return JSON.stringify([a.model, a.input, a.checks, a.stages]) !== JSON.stringify([b.model, b.input, b.checks, b.stages]);
}

export interface Rebanded {
  decisions: RunResult["decisions"];
  runBand: Band;
  overallAction: RunResult["overallAction"];
  route: string | null;
}

/**
 * The bands, actions and route a past run's answers get under another spec's policies, routes
 * and composites, without calling System One again. Null when the questions changed.
 */
export function reband(runSpec: Spec, spec: Spec, result: RunResult, state: unknown): Rebanded | null {
  if (questionsChanged(runSpec, spec)) return null;
  try {
    const out = routeAnswers({
      spec,
      answers: result.answers,
      asked: new Set(Object.keys(result.answers)),
      checks: result.checks,
      input: state,
      rollout: result.rollout,
      channel: result.channel,
      dispatchActionsOnStaging: false,
    });
    return { decisions: out.decisions, runBand: out.runBand, overallAction: out.overallAction, route: out.route };
  } catch {
    // The router does not throw on answer data, but an unsaved spec can be half edited.
    return null;
  }
}

/** An answer in a few words: "73% yes", "shell at 0.80". */
export function answerSummary(a: SystemOneAnswer | undefined): string {
  if (a === undefined) return "Not asked";
  switch (a.type) {
    case "noul":
      return typeof a.noul === "number" ? `${Math.round(a.noul * 100)}% yes` : "noul";
    case "choice":
    case "score": {
      const top = a.type === "choice" ? a.choice : a.score;
      const conf = a.confidence;
      return `${typeof top === "number" ? top.toFixed(2) : String(top)} at ${typeof conf === "number" ? conf.toFixed(2) : "?"}`;
    }
    default:
      return a.type;
  }
}

/** Where an answer sits on its policy's band bar: the noul, or the confidence. */
export function answerMarker(a: SystemOneAnswer | undefined): number | null {
  if (a === undefined) return null;
  const v = a.type === "noul" ? a.noul : a.type === "choice" || a.type === "score" ? a.confidence : null;
  return typeof v === "number" && v >= 0 && v <= 1 ? v : null;
}

export interface Finding {
  path: string;
  rule: string;
  severity: "error" | "warning";
  message: string;
}

/** Lint findings that point into one question or its policy. */
export function findingsFor(findings: readonly Finding[], at: QuestionRef): Finding[] {
  const q = `/stages/${at.stage}/questions/${at.id}`;
  const p = `/policies/${at.id}`;
  const under = (path: string, base: string) => path === base || path.startsWith(`${base}/`);
  return findings.filter((f) => under(f.path, q) || under(f.path, p));
}

/** A starting state from input.schema: every declared property with an empty value of its type. */
export function skeletonState(schema: unknown, depth = 0): unknown {
  if (typeof schema !== "object" || schema === null || depth > 6) return null;
  const s = schema as { type?: unknown; properties?: Record<string, unknown>; enum?: unknown[]; default?: unknown };
  if (s.default !== undefined) return s.default;
  if (Array.isArray(s.enum) && s.enum.length > 0) return s.enum[0];
  const type = Array.isArray(s.type) ? s.type[0] : s.type;
  switch (type) {
    case "object": {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(s.properties ?? {})) out[k] = skeletonState(v, depth + 1);
      return out;
    }
    case "array":
      return [];
    case "string":
      return "";
    case "number":
    case "integer":
      return 0;
    case "boolean":
      return false;
    default:
      return null;
  }
}

/** Pretty JSON as the JSON view shows it. */
export const toJsonText = (v: unknown): string => `${JSON.stringify(v, null, 2)}\n`;
