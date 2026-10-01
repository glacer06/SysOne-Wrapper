"use client";

import { usePathname } from "next/navigation";
import { createContext, type ReactNode, useContext, useEffect, useState } from "react";

import { cx } from "~/components/ui";

import { type AuthStepState, authRail } from "./auth-steps";

const BackupContext = createContext<(on: boolean) => void>(() => {});
const UsingBackup = createContext(false);

/** Holds whether the two-factor form is taking a backup code, so the rail can point at it. */
export function AuthStepProvider({ children }: { children: ReactNode }) {
  const [usingBackup, setUsingBackup] = useState(false);
  return (
    <BackupContext.Provider value={setUsingBackup}>
      <UsingBackup.Provider value={usingBackup}>{children}</UsingBackup.Provider>
    </BackupContext.Provider>
  );
}

/** The two-factor form calls this with its backup toggle. Display only: it changes no behavior. */
export function useBackupStep(on: boolean) {
  const set = useContext(BackupContext);
  useEffect(() => {
    set(on);
    return () => set(false);
  }, [on, set]);
}

function Node({ state }: { state: AuthStepState }) {
  return (
    <span
      aria-hidden
      className={cx(
        "relative z-10 block shrink-0 rounded-full",
        state === "current" ? "h-3.5 w-3.5 bg-bw-brand ring-4 ring-bw-surface" : state === "passed" ? "h-2 w-2 bg-bw-text ring-4 ring-bw-surface" : "h-2 w-2 border border-bw-border-control bg-bw-surface ring-4 ring-bw-surface",
      )}
    />
  );
}

const SPOKEN: Record<AuthStepState, string> = { passed: "done", current: "current step", ahead: "not yet" };

/**
 * The left rail (AUTH-B): the whole sign-in path as a dotted trail, the current step the one teal
 * node. From 768px it stands beside the pane; on a phone it lies flat above the heading.
 * `path` stands in for the route, for previews of one step.
 */
export function AuthRailNav({ path }: { path?: string }) {
  const current = usePathname();
  const pathname = path ?? current;
  const usingBackup = useContext(UsingBackup);
  const rail = authRail(pathname, usingBackup);
  return (
    <nav aria-label="Sign-in steps" className="flex flex-col gap-4">
      <p className="bw-label">{rail.title}</p>
      {/* Phone: one row. The line runs between the first and last node centers. */}
      <ol className="relative grid grid-cols-3 md:hidden">
        <span aria-hidden className="bw-trail absolute top-[calc(0.4375rem-1.5px)] right-[16.67%] left-[16.67%]" />
        {rail.steps.map((s) => (
          <li key={s.id} aria-current={s.state === "current" ? "step" : undefined} className="flex flex-col items-center gap-2 text-center">
            <span className="flex h-3.5 items-center">
              <Node state={s.state} />
            </span>
            <span className={cx("font-mono text-[0.6875rem] tracking-[0.06em] uppercase", s.state === "current" ? "font-semibold text-bw-text" : "text-bw-text-muted")}>
              {s.label}
            </span>
            <span className="sr-only">, {SPOKEN[s.state]}</span>
          </li>
        ))}
      </ol>
      {/* From 768px: a column, each step with its hint. */}
      <ol className="relative hidden flex-col gap-8 md:flex">
        <span aria-hidden className="absolute top-2 bottom-8 left-[calc(0.4375rem-1.5px)] w-0 border-l-[3px] border-dotted border-bw-border-strong" />
        {rail.steps.map((s) => (
          <li key={s.id} aria-current={s.state === "current" ? "step" : undefined} className="flex items-start gap-4">
            <span className="flex h-5 w-3.5 shrink-0 items-center justify-center">
              <Node state={s.state} />
            </span>
            <span className="flex flex-col gap-0.5">
              <span className={cx("font-mono text-xs tracking-[0.08em] uppercase", s.state === "current" ? "font-semibold text-bw-text" : "text-bw-text-muted")}>
                {s.label}
                <span className="sr-only">, {SPOKEN[s.state]}</span>
              </span>
              <span className="text-xs text-bw-text-muted">{s.hint}</span>
            </span>
          </li>
        ))}
      </ol>
    </nav>
  );
}
