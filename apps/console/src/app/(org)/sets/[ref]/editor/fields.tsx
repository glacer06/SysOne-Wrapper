"use client";

import type { Structured } from "@bandwise/core";
import { type TextareaHTMLAttributes, useId, useState } from "react";

import { cx, Input } from "~/components/ui";

import { setStructuredField, structuredShape } from "./spec-edit";

type TextAreaProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "onChange" | "value"> & {
  label: string;
  hint?: string;
  value: string;
  onValueChange: (value: string) => void;
};

/** A labelled textarea that grows with its text, up to a point. */
export function TextArea({ label, hint, value, onValueChange, className, rows, ...rest }: TextAreaProps) {
  const id = useId();
  const lines = Math.min(12, Math.max(rows ?? 2, value.split("\n").length + Math.floor(value.length / 90)));
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-bw-text">
        {label}
      </label>
      {hint === undefined ? null : (
        <p id={`${id}-hint`} className="text-xs text-bw-text-muted">
          {hint}
        </p>
      )}
      <textarea
        id={id}
        value={value}
        rows={lines}
        aria-describedby={hint === undefined ? undefined : `${id}-hint`}
        onChange={(e) => onValueChange(e.target.value)}
        className={cx("w-full rounded-sm border border-bw-border-control bg-bw-surface-sunken px-3 py-2 text-sm leading-6 text-bw-text placeholder:text-bw-text-muted", className)}
        {...rest}
      />
    </div>
  );
}

/**
 * Edits an instructions or criteria value: plain text, named text fields (a list field takes one
 * item per line), or a note to use the JSON view for anything deeper.
 */
export function StructuredEditor({ label, value, onChange, placeholder }: { label: string; value: Structured | null | undefined; onChange: (v: Structured) => void; placeholder?: string }) {
  const shape = structuredShape(value);
  if (shape.kind === "text") {
    return <TextArea label={label} value={shape.value} onValueChange={onChange} {...(placeholder === undefined ? {} : { placeholder })} />;
  }
  if (shape.kind === "json") {
    return (
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-bw-text">{label}</span>
        <pre className="max-h-48 overflow-auto rounded-sm border border-bw-border bg-bw-surface-sunken p-3 font-mono text-xs text-bw-text-muted">{JSON.stringify(value, null, 2)}</pre>
        <p className="text-xs text-bw-text-muted">This value is nested, so edit it in the JSON view.</p>
      </div>
    );
  }
  return (
    <fieldset className="flex min-w-0 flex-col gap-3 rounded-sm border border-bw-border p-3">
      <legend className="px-1 text-sm font-medium text-bw-text">{label}</legend>
      {shape.fields.map((f) =>
        f.list ? (
          <ListArea key={f.key} label={f.key} value={f.value} onValueChange={(text) => onChange(setStructuredField(value as Structured, f.key, text, true))} />
        ) : (
          <TextArea key={f.key} label={f.key} value={f.value} onValueChange={(text) => onChange(setStructuredField(value as Structured, f.key, text, false))} />
        ),
      )}
    </fieldset>
  );
}

const nonEmptyLines = (t: string) =>
  t
    .split("\n")
    .filter((l) => l.trim().length > 0)
    .join("\n");

/**
 * A list as one item per line. The spec drops empty lines, so the text lives here while typing:
 * otherwise Enter would vanish before the next item is typed. A change from outside resets it.
 */
function ListArea({ label, value, onValueChange }: { label: string; value: string; onValueChange: (text: string) => void }) {
  const [text, setText] = useState(value);
  const [seen, setSeen] = useState(value);
  if (value !== seen) {
    setSeen(value);
    if (nonEmptyLines(text) !== value) setText(value);
  }
  return (
    <TextArea
      label={label}
      hint="One item per line."
      value={text}
      onValueChange={(t) => {
        setText(t);
        onValueChange(t);
      }}
    />
  );
}

/**
 * A required text field. The spec refuses an empty value, so while the field is empty the spec
 * keeps the last value and the field says why; leaving it empty puts the old value back.
 */
export function RequiredInput({ label, value, onValueChange }: { label: string; value: string; onValueChange: (v: string) => void }) {
  const [text, setText] = useState(value);
  const [seen, setSeen] = useState(value);
  if (value !== seen) {
    setSeen(value);
    if (text.trim() !== "") setText(value);
  }
  const empty = text.trim() === "";
  return (
    <Input
      label={label}
      value={text}
      error={empty ? `${label} is required. Leaving it empty keeps "${value}".` : null}
      onChange={(e) => {
        setText(e.target.value);
        if (e.target.value.trim() !== "") onValueChange(e.target.value);
      }}
      onBlur={() => {
        if (empty) setText(value);
      }}
    />
  );
}

/** A text input that commits on blur or Enter, for keys that other parts of the spec refer to. */
export function CommitInput({ label, value, onCommit, invalid }: { label: string; value: string; onCommit: (v: string) => void; invalid?: (v: string) => string | null }) {
  const id = useId();
  const [text, setText] = useState(value);
  const [seen, setSeen] = useState(value);
  if (value !== seen) {
    setSeen(value);
    setText(value);
  }
  const problem = text === value ? null : (invalid?.(text) ?? null);
  const commit = () => {
    if (problem === null && text !== value) onCommit(text);
    else setText(value);
  };
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <input
        id={id}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          }
          if (e.key === "Escape") setText(value);
        }}
        aria-invalid={problem === null ? undefined : true}
        className="h-9 w-full rounded-sm border border-bw-border-control bg-bw-surface-sunken px-2 max-sm:h-11 font-mono text-sm text-bw-text aria-[invalid=true]:border-bw-low"
      />
      {problem === null ? null : <p className="text-xs text-bw-low-text">{problem}</p>}
    </div>
  );
}
