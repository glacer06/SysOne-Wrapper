import { useEffect } from "react";

/** The one question the editor asks before unsaved edits are lost. */
export const LEAVE_PROMPT = "The draft has unsaved changes. Leave this page and lose them?";

/** The parts of a link click the guard looks at. */
export interface LinkClick {
  button: number;
  modified: boolean;
  defaultPrevented: boolean;
  /** The closest `a[href]` around the click target, or null. */
  link: { href: string; target: string; download: boolean } | null;
}

/**
 * Whether a click leaves the editor through an in-app link, so the guard should ask first.
 * New tabs, downloads, other origins and links to this same page (a hash or a query) never ask.
 */
export function clickLeavesEditor(click: LinkClick, here: string): boolean {
  if (click.defaultPrevented || click.button !== 0 || click.modified) return false;
  const a = click.link;
  if (a === null || (a.target !== "" && a.target !== "_self") || a.download) return false;
  const from = new URL(here);
  const to = new URL(a.href, from);
  return to.origin === from.origin && to.pathname !== from.pathname;
}

/**
 * Whether a back or forward step left the editor's page. The browser has already moved the URL
 * when popstate fires, so this compares the editor's own URL with where the step landed.
 * A step that only changes the hash or the query stays on the editor and never asks.
 */
export function popLeavesEditor(editorUrl: string, landedUrl: string): boolean {
  const from = new URL(editorUrl);
  const to = new URL(landedUrl, from);
  return to.origin !== from.origin || to.pathname !== from.pathname;
}

/** The browser surface the guard needs. `window` fits it; tests pass a fake. */
export interface GuardWindow {
  location: { href: string };
  history: { state: unknown; pushState(data: unknown, unused: string, url?: string | URL | null): void };
  confirm(message: string): boolean;
  addEventListener(type: string, listener: (e: Event) => void, options?: boolean | AddEventListenerOptions): void;
  removeEventListener(type: string, listener: (e: Event) => void, options?: boolean | EventListenerOptions): void;
  document: {
    addEventListener(type: string, listener: (e: Event) => void, options?: boolean | AddEventListenerOptions): void;
    removeEventListener(type: string, listener: (e: Event) => void, options?: boolean | EventListenerOptions): void;
  };
}

function linkOf(target: EventTarget | null): LinkClick["link"] {
  const closest = (target as { closest?: unknown } | null)?.closest;
  if (typeof closest !== "function") return null;
  const a = (closest as (s: string) => unknown).call(target, "a[href]") as
    | { href?: unknown; target?: unknown; hasAttribute?: (n: string) => boolean }
    | null;
  if (a === null || typeof a.href !== "string") return null;
  return { href: a.href, target: typeof a.target === "string" ? a.target : "", download: a.hasAttribute?.("download") === true };
}

/** An options object, not `true`: some EventTarget versions do not remove a listener added with a bare boolean. */
const CAPTURE = { capture: true } as const;

/**
 * Arm the guard for a page with unsaved edits and return the function that disarms it.
 *
 * - Reload and tab close: `beforeunload`, so the browser asks with its own text.
 * - In-app links: a capture click listener on document runs before the router's Link handler,
 *   so cancelling there stops the client navigation.
 * - Back and forward: a capture popstate listener on window runs before the router's own
 *   (which listens without capture). On cancel it stops the event, so the router never moves,
 *   and pushes the editor's URL and history state back, so the address bar matches the page and
 *   the edits stay. That push drops the forward entries. On a confirmed leave it does nothing
 *   and the router handles the step as usual.
 */
export function installUnsavedGuard(win: GuardWindow): () => void {
  // Where the editor is, with the router's history state, so a cancelled step can put it back.
  let editor = { url: win.location.href, state: win.history.state };

  const onBeforeUnload = (e: Event) => e.preventDefault();

  const onClick = (e: Event) => {
    const m = e as MouseEvent;
    const click: LinkClick = {
      button: m.button,
      modified: m.metaKey || m.ctrlKey || m.shiftKey || m.altKey,
      defaultPrevented: m.defaultPrevented,
      link: linkOf(m.target),
    };
    if (!clickLeavesEditor(click, win.location.href)) return;
    if (win.confirm(LEAVE_PROMPT)) return;
    e.preventDefault();
    e.stopPropagation();
  };

  const onPopState = (e: Event) => {
    if (!popLeavesEditor(editor.url, win.location.href)) {
      editor = { url: win.location.href, state: win.history.state };
      return;
    }
    if (win.confirm(LEAVE_PROMPT)) return;
    e.stopImmediatePropagation();
    win.history.pushState(editor.state, "", editor.url);
  };

  win.addEventListener("beforeunload", onBeforeUnload);
  win.addEventListener("popstate", onPopState, CAPTURE);
  win.document.addEventListener("click", onClick, CAPTURE);
  return () => {
    win.removeEventListener("beforeunload", onBeforeUnload);
    win.removeEventListener("popstate", onPopState, CAPTURE);
    win.document.removeEventListener("click", onClick, CAPTURE);
  };
}

/** Ask before unsaved edits are lost to a reload, a link, or back and forward. Quiet when `dirty` is false. */
export function useUnsavedGuard(dirty: boolean): void {
  useEffect(() => (dirty ? installUnsavedGuard(window) : undefined), [dirty]);
}
