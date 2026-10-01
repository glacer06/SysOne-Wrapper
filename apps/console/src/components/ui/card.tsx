import Link from "next/link";
import type { ReactNode } from "react";

import { MarkA } from "../shell/wordmark";
import { cx } from "./cx";

export function Card({ title, description, actions, children, className }: {
  title?: string;
  description?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <section className={cx("rounded-md border border-bw-border bg-bw-surface", className)}>
      {title === undefined && actions === undefined ? null : (
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-bw-border px-5 py-4">
          <div className="min-w-0">
            {title === undefined ? null : <h2 className="text-base font-semibold text-bw-text">{title}</h2>}
            {description === undefined ? null : <p className="mt-1 text-sm text-bw-text-muted">{description}</p>}
          </div>
          {actions === undefined ? null : <div className="flex shrink-0 gap-2">{actions}</div>}
        </header>
      )}
      {children === undefined ? null : <div className="px-5 py-4">{children}</div>}
    </section>
  );
}

/**
 * What a page or list shows when there is nothing yet: what will be here and what to do.
 * `mark` adds mark A for a first-time empty page ("nothing on the trail yet"); leave it off for
 * filter misses and not-found pages.
 */
export function EmptyState({ title, children, action, mark = false }: { title: string; children?: ReactNode; action?: ReactNode; mark?: boolean }) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-md border border-dashed border-bw-border-strong px-6 py-10">
      {mark ? <MarkA width={96} className="mb-2" /> : null}
      <h2 className="text-base font-semibold text-bw-text">{title}</h2>
      {children === undefined ? null : <div className="max-w-prose text-sm leading-6 text-bw-text-muted">{children}</div>}
      {action}
    </div>
  );
}

export interface Crumb {
  href: string;
  label: string;
}

/**
 * The top of every page. `crumbs` are the pages above this one, so a detail page always links
 * back the same way.
 */
export function PageHeader({ title, description, actions, crumbs }: { title: string; description?: ReactNode; actions?: ReactNode; crumbs?: readonly Crumb[] }) {
  return (
    <div className="mb-6">
      {crumbs === undefined || crumbs.length === 0 ? null : (
        <nav aria-label="Breadcrumb" className="mb-2 text-sm text-bw-text-muted">
          <ol className="flex flex-wrap items-center gap-1">
            {crumbs.map((c, i) => (
              <li key={c.href} className="flex items-center gap-1">
                {i === 0 ? null : <span aria-hidden>/</span>}
                <Link href={c.href} className="bw-hit underline-offset-2 hover:text-bw-text hover:underline">
                  {c.label}
                </Link>
              </li>
            ))}
          </ol>
        </nav>
      )}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="bw-page-title">{title}</h1>
          {description === undefined ? null : <div className="mt-1 max-w-prose text-sm text-bw-text-muted">{description}</div>}
        </div>
        {actions === undefined ? null : <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </div>
  );
}
