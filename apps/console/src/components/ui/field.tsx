import { type InputHTMLAttributes, type ReactNode, type Ref, type SelectHTMLAttributes, useId } from "react";

import { cx } from "./cx";

// DESIGN.md: 40px tall (44 on touch), 1px strong border, 2px focus ring, low color on error.
const CONTROL =
  "w-full rounded-sm border border-bw-border-control bg-bw-surface px-3 text-base text-bw-text placeholder:text-bw-text-muted sm:text-sm " +
  "transition-colors duration-(--bw-dur-fast) hover:border-bw-text-muted focus-visible:border-bw-focus " +
  "aria-[invalid=true]:border-bw-low disabled:cursor-not-allowed disabled:opacity-40";

interface FieldShell {
  label: string;
  /** Shown under the label. */
  hint?: ReactNode;
  error?: string | null | undefined;
  /** Keeps the label for screen readers only, where a table header or column already names the field. */
  labelHidden?: boolean;
}

function Shell({ id, label, hint, error, labelHidden = false, children }: FieldShell & { id: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className={labelHidden ? "sr-only" : "text-sm font-medium text-bw-text"}>
        {label}
      </label>
      {hint === undefined ? null : (
        <p id={`${id}-hint`} className="text-xs text-bw-text-muted">
          {hint}
        </p>
      )}
      {children}
      {error ? (
        <p id={`${id}-error`} className="text-xs text-bw-low-text">
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

export type InputProps = InputHTMLAttributes<HTMLInputElement> & FieldShell & { ref?: Ref<HTMLInputElement> };

/** A labelled text input with an optional hint and error. */
export function Input({ label, hint, error, labelHidden, className, id: givenId, ...rest }: InputProps) {
  const autoId = useId();
  const id = givenId ?? autoId;
  return (
    <Shell id={id} label={label} hint={hint} error={error} labelHidden={labelHidden}>
      <input
        id={id}
        className={cx(CONTROL, "h-11 sm:h-10", className)}
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
export function Select({ label, hint, error, labelHidden, options, className, id: givenId, ...rest }: SelectProps) {
  const autoId = useId();
  const id = givenId ?? autoId;
  return (
    <Shell id={id} label={label} hint={hint} error={error} labelHidden={labelHidden}>
      <select
        id={id}
        className={cx(CONTROL, "h-11 pr-8 sm:h-10", className)}
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
