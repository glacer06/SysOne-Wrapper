"use client";

import { useState } from "react";

import { cx } from "./cx";

/**
 * One exact CLI line in a code block, with a Copy button. The line is plain text, so it can also
 * be selected by hand when the clipboard is blocked.
 */
export function CopyCommand({ command, label = "Command", className }: { command: string; label?: string; className?: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  async function copy() {
    try {
      await navigator.clipboard.writeText(command);
      setState("copied");
    } catch {
      setState("failed");
    }
    setTimeout(() => setState("idle"), 2000);
  }
  return (
    <div className={cx("flex items-stretch rounded-sm border border-bw-border bg-bw-surface-sunken", className)}>
      <pre aria-label={label} tabIndex={0} className="min-w-0 flex-1 overflow-x-auto px-4 py-3 font-mono text-[0.8125rem] leading-[1.6] text-bw-text">
        <code>{command}</code>
      </pre>
      <button
        type="button"
        onClick={() => void copy()}
        className="bw-label min-h-11 shrink-0 border-l border-bw-border px-4 hover:bg-bw-surface hover:text-bw-text sm:min-h-10"
      >
        {state === "copied" ? "Copied" : state === "failed" ? "Select it" : "Copy"}
      </button>
      <span className="sr-only" role="status">
        {state === "copied" ? "Copied to the clipboard" : state === "failed" ? "Copy failed. Select the line by hand." : ""}
      </span>
    </div>
  );
}
