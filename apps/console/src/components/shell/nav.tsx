"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { cx } from "../ui/cx";

export const NAV = [
  { href: "/sets", label: "Sets", hint: "Question sets, versions and rollout" },
  { href: "/runs", label: "Runs", hint: "Every run and its answers" },
  { href: "/savings", label: "Savings", hint: "Spend and savings per set" },
  { href: "/review", label: "Review", hint: "Medium and low band decisions" },
  { href: "/approvals", label: "Approvals", hint: "Agent requests waiting for you" },
] as const;

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <ul className="flex flex-col gap-0.5">
      {NAV.map((item) => {
        const current = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={current ? "page" : undefined}
              onClick={onNavigate}
              className={cx(
                "flex min-h-10 items-center gap-3 rounded-sm px-3 py-2 text-[0.9375rem] transition-colors duration-(--bw-dur-fast) max-md:min-h-11",
                current ? "bg-bw-surface-sunken font-semibold text-bw-text" : "text-bw-text-muted hover:bg-bw-surface-sunken hover:text-bw-text",
              )}
            >
              <span aria-hidden className={cx("h-4 w-[3px]", current ? "bg-bw-brand" : "bg-transparent")} />
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** Desktop: a fixed column. Phone: a menu button that opens the same links. */
export function SideNav({ header, compactHeader, footer }: { header: React.ReactNode; compactHeader: React.ReactNode; footer: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  useEffect(() => setOpen(false), [pathname]);

  return (
    <>
      <div className="flex items-center justify-between gap-3 border-b border-bw-border bg-bw-surface px-4 py-2 md:hidden">
        {compactHeader}
        <button
          type="button"
          aria-expanded={open}
          aria-controls="mobile-nav"
          onClick={() => setOpen(!open)}
          className="h-11 rounded-sm border border-bw-border-strong px-4 text-sm font-semibold text-bw-text hover:bg-bw-surface-sunken"
        >
          {open ? "Close" : "Menu"}
        </button>
      </div>
      {open ? (
        <nav id="mobile-nav" aria-label="Console" className="border-b border-bw-border bg-bw-surface px-3 py-3 md:hidden">
          <NavLinks onNavigate={() => setOpen(false)} />
          <div className="mt-3 border-t border-bw-border pt-3">{footer}</div>
        </nav>
      ) : null}
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-bw-border bg-bw-surface md:flex">
        <div className="px-5 pt-5 pb-4">{header}</div>
        <nav aria-label="Console" className="flex-1 overflow-y-auto px-3">
          <NavLinks />
        </nav>
        <div className="border-t border-bw-border px-3 py-3">{footer}</div>
      </aside>
    </>
  );
}
