"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cx } from "../ui/cx";

/**
 * The views of one set. Draft and Releases live under the set; Runs, Savings and Review open the
 * console-wide pages filtered to it, so every view of a set is one click from the others.
 */
export function SetTabs({ slug }: { slug: string }) {
  const pathname = usePathname();
  const s = encodeURIComponent(slug);
  const tabs = [
    { href: `/sets/${s}`, label: "Draft", current: pathname === `/sets/${s}` },
    { href: `/sets/${s}/releases`, label: "Releases", current: pathname.startsWith(`/sets/${s}/releases`) },
    { href: `/runs?set=${s}`, label: "Runs", current: false },
    { href: `/savings?set=${s}`, label: "Savings", current: false },
    { href: `/review?set=${s}`, label: "Review", current: false },
  ];
  return (
    <nav aria-label={`Set ${slug}`} className="mb-6 flex gap-5 overflow-x-auto border-b border-bw-border">
      {tabs.map((t) => (
        <Link
          key={t.label}
          href={t.href}
          aria-current={t.current ? "page" : undefined}
          className={cx(
            "-mb-px shrink-0 border-b-2 px-0.5 py-3 text-sm font-medium transition-colors duration-(--bw-dur-fast)",
            t.current ? "border-bw-brand text-bw-text" : "border-transparent text-bw-text-muted hover:text-bw-text",
          )}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
