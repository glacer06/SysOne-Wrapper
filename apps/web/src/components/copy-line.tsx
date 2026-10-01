"use client";

import { useEffect, useRef, useState } from "react";

/**
 * One command on one line, with a copy button. Without JavaScript or clipboard access the
 * command is still plain selectable text, and the button says it could not copy.
 */
export function CopyLine({ label, command }: { label: string; command: string }) {
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );

  async function copy() {
    try {
      await navigator.clipboard.writeText(command);
      setStatus("copied");
    } catch {
      setStatus("failed");
    }
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = setTimeout(() => setStatus("idle"), 2400);
  }

  return (
    <div className="copy-line">
      <p className="label copy-line-label">{label}</p>
      <div className="copy-line-box">
        <code className="copy-line-cmd">
          <span className="copy-line-prompt" aria-hidden="true">
            ${" "}
          </span>
          {command}
        </code>
        <button type="button" className="copy-line-btn" onClick={copy} aria-label={`Copy: ${command}`}>
          {status === "copied" ? "Copied" : status === "failed" ? "Select it" : "Copy"}
        </button>
      </div>
      <p className="visually-hidden" aria-live="polite">
        {status === "copied" ? "Copied to the clipboard." : status === "failed" ? "Could not copy. Select the command instead." : ""}
      </p>
    </div>
  );
}
