"use client";

import { createContext, type ReactNode, useCallback, useContext, useEffect, useRef, useState } from "react";

import { cx } from "./cx";

interface Toast {
  id: number;
  kind: "success" | "error" | "info";
  message: string;
}

type Show = (message: string, kind?: Toast["kind"]) => void;

const ToastContext = createContext<Show>(() => {});

/** Brief confirmations after an action ("Published v4"). Errors that need a fix stay inline instead. */
export function useToast(): Show {
  return useContext(ToastContext);
}

const TIMEOUT_MS = 5000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const next = useRef(1);
  const show = useCallback<Show>((message, kind = "success") => {
    const id = next.current++;
    setToasts((all) => [...all.slice(-2), { id, kind, message }]);
  }, []);
  const dismiss = useCallback((id: number) => setToasts((all) => all.filter((t) => t.id !== id)), []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-4 bottom-4 z-50 flex flex-col items-end gap-2 sm:left-auto">
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDone={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({ toast, onDone }: { toast: Toast; onDone: (id: number) => void }) {
  useEffect(() => {
    const timer = setTimeout(() => onDone(toast.id), TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [toast.id, onDone]);
  return (
    <div
      role={toast.kind === "error" ? "alert" : "status"}
      className={cx(
        "pointer-events-auto flex max-w-sm items-start gap-3 rounded-sm border bg-paper-raised px-4 py-3 text-sm text-ink",
        toast.kind === "error" ? "border-danger" : toast.kind === "success" ? "border-good" : "border-edge",
      )}
    >
      <span className="flex-1">{toast.message}</span>
      <button type="button" onClick={() => onDone(toast.id)} className="text-ink-3 hover:text-ink" aria-label="Dismiss">
        <span aria-hidden>×</span>
      </button>
    </div>
  );
}
