"use client";

import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";

export interface TemplateTab {
  id: string;
  label: string;
  count: number;
  panel: ReactNode;
}

/**
 * Tabs for the template list (WAI-ARIA tabs, automatic activation). Every panel is rendered on the
 * server, so the page is complete before hydration. With JavaScript off, the noscript rule below
 * hides the tab strip and shows every panel under its own heading.
 */
export function TemplateTabs({ tabs, label }: { tabs: readonly TemplateTab[]; label: string }) {
  const [active, setActive] = useState(0);
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  function go(next: number) {
    const i = (next + tabs.length) % tabs.length;
    setActive(i);
    refs.current[i]?.focus();
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "ArrowRight") go(active + 1);
    else if (e.key === "ArrowLeft") go(active - 1);
    else if (e.key === "Home") go(0);
    else if (e.key === "End") go(tabs.length - 1);
    else return;
    e.preventDefault();
  }

  return (
    <div className="tpl-tabs">
      <noscript>
        <style>{`.tpl-tablist{display:none}.tpl-panel[hidden]{display:block}.tpl-panel-title{display:block}`}</style>
      </noscript>
      <div className="tpl-tablist" role="tablist" aria-label={label} onKeyDown={onKeyDown}>
        {tabs.map((t, i) => (
          <button
            key={t.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`tpl-tab-${t.id}`}
            aria-selected={i === active}
            aria-controls={`tpl-panel-${t.id}`}
            tabIndex={i === active ? 0 : -1}
            className="tpl-tab"
            onClick={() => setActive(i)}
          >
            {t.label}
            <span className="tpl-tab-count data" aria-hidden="true">
              {t.count}
            </span>
          </button>
        ))}
      </div>
      {tabs.map((t, i) => (
        <div
          key={t.id}
          role="tabpanel"
          id={`tpl-panel-${t.id}`}
          aria-labelledby={`tpl-tab-${t.id}`}
          className="tpl-panel"
          hidden={i !== active}
        >
          <h3 className="tpl-panel-title">{t.label}</h3>
          {t.panel}
        </div>
      ))}
    </div>
  );
}
