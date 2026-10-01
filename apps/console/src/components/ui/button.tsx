import type { ButtonHTMLAttributes, ReactNode } from "react";

import { cx } from "./cx";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

// DESIGN.md: primary is a chamfered teal fill with ink text, secondary an outline, ghost brand
// text, danger the low color. Hover, active (1px down), focus and disabled (40%) on every one.
const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bw-chamfer rounded-none border border-transparent bg-bw-brand text-bw-on-brand hover:bg-(--bw-brand-hover)",
  secondary: "border border-bw-border-control bg-transparent text-bw-text hover:bg-bw-surface-sunken",
  ghost: "border border-transparent bg-transparent text-bw-brand-text hover:bg-bw-high-bg",
  danger: "bw-on-low border border-transparent bg-bw-low hover:bg-(--bw-low-hover)",
};

export function buttonClasses(variant: ButtonVariant = "secondary", size: "sm" | "md" = "md"): string {
  return cx(
    "inline-flex items-center justify-center gap-2 rounded-sm font-semibold whitespace-nowrap",
    "transition-[background-color,border-color,transform] duration-(--bw-dur-fast) ease-(--bw-ease-standard) active:translate-y-px",
    "disabled:cursor-not-allowed disabled:opacity-40 disabled:active:translate-y-0",
    size === "sm" ? "h-8 px-3 text-sm max-sm:min-h-11" : "h-10 px-5 text-sm max-sm:min-h-11",
    VARIANTS[variant],
  );
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: "sm" | "md";
  /** Keeps the label, shows the trail and blocks clicks while a form is submitting. */
  pending?: boolean;
}

export function Button({ variant = "secondary", size = "md", pending = false, className, children, disabled, type = "button", ...rest }: ButtonProps) {
  const button = (
    <button type={type} className={cx(buttonClasses(variant, size), className)} disabled={disabled === true || pending} aria-busy={pending || undefined} {...rest}>
      {children}
      {pending ? <span aria-hidden className="bw-trail-busy" /> : null}
    </button>
  );
  // The chamfer clips an outline, so the primary button's focus ring is drawn by its wrapper.
  return variant === "primary" ? <FocusPoly>{button}</FocusPoly> : button;
}

/** Wraps a chamfered control so its focus ring follows the chamfer (the kit's .bw-focus-poly). */
export function FocusPoly({ children }: { children: ReactNode }) {
  return <span className="bw-focus-poly">{children}</span>;
}
