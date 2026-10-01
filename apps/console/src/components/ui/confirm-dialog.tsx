"use client";

import { type ReactNode, useEffect, useId, useRef } from "react";

import { Button, type ButtonVariant } from "./button";

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  children?: ReactNode;
  confirmLabel: string;
  /** "danger" for moves people should pause on; the default is the primary action. */
  tone?: Extract<ButtonVariant, "primary" | "danger">;
  pending?: boolean;
  confirmDisabled?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * A modal confirm on the native dialog element: focus moves in, Escape cancels, and focus returns
 * to the button that opened it. Cancel takes the first focus so Enter never confirms by accident.
 */
export function ConfirmDialog({ open, title, children, confirmLabel, tone = "primary", pending = false, confirmDisabled = false, onConfirm, onCancel }: ConfirmDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (dialog === null) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        if (!pending) onCancel();
      }}
      className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-md border border-bw-border bg-bw-surface p-0 text-bw-text shadow-xl backdrop:bg-bw-overlay"
    >
      <div className="px-5 py-4">
        <h2 id={titleId} className="text-base font-semibold">
          {title}
        </h2>
        {children === undefined ? null : <div className="mt-3 flex flex-col gap-2 text-sm leading-6 text-bw-text-muted">{children}</div>}
      </div>
      <div className="flex justify-end gap-2 border-t border-bw-border px-5 py-3">
        <Button onClick={onCancel} disabled={pending} autoFocus>
          Cancel
        </Button>
        <Button variant={tone} onClick={onConfirm} pending={pending} disabled={confirmDisabled}>
          {pending ? "Working..." : confirmLabel}
        </Button>
      </div>
    </dialog>
  );
}
