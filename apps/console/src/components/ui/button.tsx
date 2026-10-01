import type { ButtonHTMLAttributes } from "react";

import { cx } from "./cx";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-signal text-on-signal hover:brightness-95 border border-transparent",
  secondary: "bg-paper-raised text-ink border border-edge hover:bg-paper-sunk",
  ghost: "bg-transparent text-ink border border-transparent hover:bg-paper-sunk",
  danger: "bg-paper-raised text-danger border border-danger hover:bg-danger-wash",
};

export function buttonClasses(variant: ButtonVariant = "secondary", size: "sm" | "md" = "md"): string {
  return cx(
    "inline-flex items-center justify-center gap-2 rounded-sm font-medium transition-colors duration-100",
    "disabled:cursor-not-allowed disabled:opacity-50",
    size === "sm" ? "h-8 px-3 text-sm" : "h-10 px-4 text-sm",
    VARIANTS[variant],
  );
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: "sm" | "md";
  /** Shows a busy label and blocks clicks while a form is submitting. */
  pending?: boolean;
}

export function Button({ variant = "secondary", size = "md", pending = false, className, children, disabled, type = "button", ...rest }: ButtonProps) {
  return (
    <button type={type} className={cx(buttonClasses(variant, size), className)} disabled={disabled === true || pending} aria-busy={pending || undefined} {...rest}>
      {children}
    </button>
  );
}
