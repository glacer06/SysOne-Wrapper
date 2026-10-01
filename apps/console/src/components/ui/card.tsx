import Link from "next/link";
import type { ReactNode } from "react";

import { cx } from "./cx";

export function Card({ title, description, actions, children, className }: {
  title?: string;
  description?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <section className={cx("rounded-md border border-rule bg-paper-raised", className)}>
      {title === undefined && actions === undefined ? null : (
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-rule px-5 py-4">
          <div className="min-w-0">
            {title === undefined ? null : <h2 className="text-base font-semibold text-ink">{title}</h2>}
            {description === undefined ? null : <p className="mt-1 text-sm text-ink-2">{description}</p>}
          </div>
          {actions === undefined ? null : <div className="flex shrink-0 gap-2">{actions}</div>}
        </header>
      )}
      {children === undefined ? null : <div className="px-5 py-4">{children}</div>}
    </section>
  );
}

/** What a page or list shows when there is nothing yet: what will be here and what to do. */
export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-md border border-dashed border-edge px-6 py-10">
      <h2 className="text-base font-semibold text-ink">{title}</h2>
      {children === undefined ? null : <div className="max-w-prose text-sm leading-6 text-ink-2">{children}</div>}
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
        <nav aria-label="Breadcrumb" className="mb-2 text-sm text-ink-3">
          <ol className="flex flex-wrap items-center gap-1">
            {crumbs.map((c, i) => (
              <li key={c.href} className="flex items-center gap-1">
                {i === 0 ? null : <span aria-hidden>/</span>}
                <Link href={c.href} className="underline-offset-2 hover:text-ink hover:underline">
                  {c.label}
                </Link>
              </li>
            ))}
          </ol>
        </nav>
      )}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
          {description === undefined ? null : <div className="mt-1 max-w-prose text-sm text-ink-2">{description}</div>}
        </div>
        {actions === undefined ? null : <div className="flex gap-2">{actions}</div>}
      </div>
    </div>
  );
}
