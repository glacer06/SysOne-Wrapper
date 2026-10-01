"use client";

import { useEffect, useRef, useState } from "react";

/** The prompt an agent gets for one template. Plain text, no secrets, the same for every agent. */
export function templatePrompt(title: string, docsPage: string, id: string): string {
  return [
    `Set up the Bandwise "${title}" template in this repository.`,
    `Read ${docsPage} and save the spec it shows as bandwise/sets/${id}.json.`,
    `Then run it once in local mode on one of the example states from that page:`,
    `npx @bandwise/cli run --local bandwise/sets/${id}.json state.json`,
    `Show me the receipt (band, reason, cost). Keep it local and do not wire it to act on anything yet.`,
  ].join("\n");
}

const shellQuote = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;

/**
 * "Send to an agent" for one template: open it in Claude, or copy a ready command for Claude Code or
 * Codex, or copy the plain prompt for any other agent. Without JavaScript the menu still opens and the
 * Claude link works; the copy buttons need the clipboard and say so when it is blocked.
 */
export function SendToAgent({ title, docsPage, id }: { title: string; docsPage: string; id: string }) {
  const prompt = templatePrompt(title, docsPage, id);
  const [status, setStatus] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );

  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text);
      setStatus(`Copied the ${what}.`);
    } catch {
      setStatus("Copy is blocked here. Open the template page and copy from there.");
    }
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = setTimeout(() => setStatus(""), 4000);
  }

  return (
    <details className="send-agent">
      <summary aria-label={`Send ${title} to an agent`}>Send to an agent</summary>
      <ul className="send-agent-menu">
        <li>
          <a href={`https://claude.ai/new?q=${encodeURIComponent(prompt)}`} target="_blank" rel="noopener noreferrer">
            Open in Claude
          </a>
        </li>
        <li>
          <button type="button" onClick={() => void copy(`claude ${shellQuote(prompt)}`, "Claude Code command")}>
            Copy for Claude Code
          </button>
        </li>
        <li>
          <button type="button" onClick={() => void copy(`codex ${shellQuote(prompt)}`, "Codex command")}>
            Copy for Codex
          </button>
        </li>
        <li>
          <button type="button" onClick={() => void copy(prompt, "prompt")}>
            Copy prompt for another agent
          </button>
        </li>
        <li aria-live="polite" className="send-agent-status">
          {status}
        </li>
      </ul>
    </details>
  );
}
