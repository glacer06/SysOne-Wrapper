import { type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, useId } from "react";

import { cx } from "./cx";

const CONTROL =
  "w-full rounded-sm border border-edge bg-paper-sunk px-3 text-sm text-ink placeholder:text-ink-3 " +
  "aria-[invalid=true]:border-danger disabled:opacity-60";

interface FieldShell {
  label: string;
  /** Shown under the label. */
  hint?: ReactNode;
  error?: string | null | undefined;
}

function Shell({ id, label, hint, error, children }: FieldShell & { id: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-ink">
        {label}
      </label>
      {hint === undefined ? null : (
        <p id={`${id}-hint`} className="text-xs text-ink-3">
          {hint}
        </p>
      )}
      {children}
      {error ? (
        <p id={`${id}-error`} className="text-xs text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function describedBy(id: string, hint: unknown, error: unknown): string | undefined {
  const ids = [hint === undefined ? null : `${id}-hint`, error ? `${id}-error` : null].filter(Boolean);
  return ids.length === 0 ? undefined : ids.join(" ");
}

export type InputProps = InputHTMLAttributes<HTMLInputElement> & FieldShell;

/** A labelled text input with an optional hint and error. */
export function Input({ label, hint, error, className, id: givenId, ...rest }: InputProps) {
  const autoId = useId();
  const id = givenId ?? autoId;
  return (
    <Shell id={id} label={label} hint={hint} error={error}>
      <input
        id={id}
        className={cx(CONTROL, "h-10", className)}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        {...rest}
      />
    </Shell>
  );
}

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement> &
  FieldShell & { options: readonly { value: string; label: string }[] };

/** A labelled native select: keyboard and screen readers work as the platform does. */
export function Select({ label, hint, error, options, className, id: givenId, ...rest }: SelectProps) {
  const autoId = useId();
  const id = givenId ?? autoId;
  return (
    <Shell id={id} label={label} hint={hint} error={error}>
      <select
        id={id}
        className={cx(CONTROL, "h-10 pr-8", className)}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        {...rest}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Shell>
  );
}
