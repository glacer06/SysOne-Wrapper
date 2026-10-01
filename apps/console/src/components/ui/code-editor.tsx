"use client";

import { useId, useMemo } from "react";

import { cx } from "./cx";
import { checkJson } from "./json-check";

export interface CodeEditorProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** Checks the text as JSON on every change and shows the first error. Default true. */
  json?: boolean;
  rows?: number;
  readOnly?: boolean;
  className?: string;
}

/** A plain monospace editor. Tab inserts two spaces; Escape then Tab leaves the field. */
export function CodeEditor({ label, value, onChange, json = true, rows = 18, readOnly = false, className }: CodeEditorProps) {
  const id = useId();
  const check = useMemo(() => (json ? checkJson(value) : null), [json, value]);
  const invalid = check !== null && !check.ok;
  return (
    <div className={cx("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-sm font-medium text-bw-text">
        {label}
      </label>
      <textarea
        id={id}
        value={value}
        rows={rows}
        readOnly={readOnly}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        aria-invalid={invalid || undefined}
        aria-describedby={`${id}-status`}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== "Tab" || e.shiftKey || readOnly || e.currentTarget.dataset["escaped"] === "1") return;
          e.preventDefault();
          const el = e.currentTarget;
          const { selectionStart: start, selectionEnd: end } = el;
          onChange(`${value.slice(0, start)}  ${value.slice(end)}`);
          requestAnimationFrame(() => el.setSelectionRange(start + 2, start + 2));
        }}
        onKeyUp={(e) => {
          if (e.key === "Escape") e.currentTarget.dataset["escaped"] = "1";
        }}
        onBlur={(e) => {
          delete e.currentTarget.dataset["escaped"];
        }}
        className={cx(
          "w-full rounded-sm border bg-bw-surface-sunken p-3 font-mono text-[13px] leading-5 text-bw-text",
          invalid ? "border-bw-low" : "border-bw-border-strong",
        )}
      />
      <p id={`${id}-status`} className={cx("text-xs", invalid ? "text-bw-low-text" : "text-bw-text-muted")} aria-live="polite">
        {check === null ? "" : check.ok ? "Valid JSON" : `Invalid JSON${check.line === null ? "" : ` near line ${check.line}`}: ${check.message}`}
      </p>
    </div>
  );
}
