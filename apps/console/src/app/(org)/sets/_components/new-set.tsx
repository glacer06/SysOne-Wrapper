"use client";

import { useId, useState } from "react";

import { Button, CopyCommand } from "~/components/ui";

/** The command a new set starts from: a spec file pushed with the CLI, the same path agents use. */
export const NEW_SET_COMMAND = "bandwise spec push my-set.json --goal <goal-id>";

/**
 * New set, the one chamfered control on the sets list. Sets start as a spec file in the repo
 * (specs as code), so the button opens the exact CLI line instead of a console-only form.
 */
export function NewSet() {
  const [open, setOpen] = useState(false);
  const panel = useId();
  return (
    <div className="flex flex-col items-end gap-3">
      <Button variant="primary" aria-expanded={open} aria-controls={panel} onClick={() => setOpen(!open)}>
        New set
      </Button>
      <div id={panel} hidden={!open} className="w-full max-w-xl rounded-md border border-bw-border bg-bw-surface p-4">
        <p className="mb-3 text-sm text-bw-text">
          A set starts as a spec file in your repo. Push it with the CLI and it shows up here with its draft. The CLI reads <code className="font-mono text-xs">BANDWISE_TOKEN</code>.
        </p>
        <CopyCommand command={NEW_SET_COMMAND} label="Command to create a set" />
      </div>
    </div>
  );
}
