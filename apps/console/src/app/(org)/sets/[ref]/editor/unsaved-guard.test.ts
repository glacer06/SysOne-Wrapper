import { describe, expect, it, vi } from "vitest";

import { clickLeavesEditor, type GuardWindow, installUnsavedGuard, LEAVE_PROMPT, type LinkClick, popLeavesEditor } from "./unsaved-guard";

const EDITOR = "https://app.bandwise.dev/sets/stop-check";
const SETS = "https://app.bandwise.dev/sets";
const ROUTER_STATE = { __NA: true, __PRIVATE_NEXTJS_INTERNALS_TREE: ["editor"] };

/**
 * A browser stand-in on Node's EventTarget. Node fires listeners in the order they were added and
 * has no capture phase, so the router's listener is added after the guard's here; in a browser the
 * guard's capture listener runs first whatever the order.
 */
function fakeWindow(confirmAnswer: boolean) {
  const target = new EventTarget();
  const doc = new EventTarget();
  const entries: { url: string; state: unknown }[] = [{ url: SETS, state: { __NA: true } }, { url: EDITOR, state: ROUTER_STATE }];
  let index = 1;
  const at = () => {
    const entry = entries[index];
    if (entry === undefined) throw new Error(`no history entry at ${index}`);
    return entry;
  };
  const confirm = vi.fn((_message: string) => confirmAnswer);
  const pushState = vi.fn((data: unknown, _unused: string, url?: string | URL | null) => {
    entries.splice(index + 1);
    entries.push({ url: String(url ?? at().url), state: data });
    index = entries.length - 1;
  });
  const win = {
    location: {
      get href() {
        return at().url;
      },
    },
    history: {
      get state() {
        return at().state;
      },
      pushState,
    },
    confirm,
    addEventListener: target.addEventListener.bind(target),
    removeEventListener: target.removeEventListener.bind(target),
    document: { addEventListener: doc.addEventListener.bind(doc), removeEventListener: doc.removeEventListener.bind(doc) },
  } satisfies GuardWindow;
  /** Step through history the way back and forward do: move, then fire popstate. */
  const go = (delta: number) => {
    index += delta;
    target.dispatchEvent(new Event("popstate"));
  };
  const router = vi.fn();
  return { win, target, doc, confirm, pushState, go, router, entries: () => entries, index: () => index };
}

describe("back and forward with unsaved edits", () => {
  it("asks, and on cancel keeps the editor URL and stops the router", () => {
    const f = fakeWindow(false);
    const disarm = installUnsavedGuard(f.win);
    f.target.addEventListener("popstate", f.router);

    f.go(-1);

    expect(f.confirm).toHaveBeenCalledWith(LEAVE_PROMPT);
    expect(f.router).not.toHaveBeenCalled();
    expect(f.pushState).toHaveBeenCalledWith(ROUTER_STATE, "", EDITOR);
    expect(f.win.location.href).toBe(EDITOR);
    expect(f.win.history.state).toBe(ROUTER_STATE);
    disarm();
  });

  it("asks again on the next back after a cancel", () => {
    const f = fakeWindow(false);
    const disarm = installUnsavedGuard(f.win);
    f.go(-1);
    f.go(-1);
    expect(f.confirm).toHaveBeenCalledTimes(2);
    expect(f.win.location.href).toBe(EDITOR);
    disarm();
  });

  it("covers forward too", () => {
    const f = fakeWindow(false);
    // The editor sits behind a later entry this time.
    f.entries().push({ url: "https://app.bandwise.dev/runs", state: { __NA: true } });
    const disarm = installUnsavedGuard(f.win);
    f.target.addEventListener("popstate", f.router);
    f.go(1);
    expect(f.confirm).toHaveBeenCalledOnce();
    expect(f.router).not.toHaveBeenCalled();
    expect(f.win.location.href).toBe(EDITOR);
    disarm();
  });

  it("on confirm lets the router take the step and pushes nothing", () => {
    const f = fakeWindow(true);
    const disarm = installUnsavedGuard(f.win);
    f.target.addEventListener("popstate", f.router);

    f.go(-1);

    expect(f.confirm).toHaveBeenCalledOnce();
    expect(f.router).toHaveBeenCalledOnce();
    expect(f.pushState).not.toHaveBeenCalled();
    expect(f.win.location.href).toBe(SETS);
    disarm();
  });

  it("does not ask for a hash or query step on the editor page", () => {
    const f = fakeWindow(false);
    f.entries()[0] = { url: `${EDITOR}#q1`, state: null };
    const disarm = installUnsavedGuard(f.win);
    f.go(-1);
    expect(f.confirm).not.toHaveBeenCalled();
    expect(f.pushState).not.toHaveBeenCalled();
    disarm();
  });

  it("is quiet once disarmed, which is what a clean draft gets", () => {
    const f = fakeWindow(false);
    installUnsavedGuard(f.win)();
    f.target.addEventListener("popstate", f.router);
    f.go(-1);
    f.target.dispatchEvent(new Event("beforeunload", { cancelable: true }));
    expect(f.confirm).not.toHaveBeenCalled();
    expect(f.router).toHaveBeenCalledOnce();
    expect(f.pushState).not.toHaveBeenCalled();
  });
});

describe("links and reloads with unsaved edits", () => {
  const anchor = (href: string, attrs: { target?: string; download?: boolean } = {}) => ({
    closest: (sel: string) =>
      sel === "a[href]" ? { href: new URL(href, EDITOR).href, target: attrs.target ?? "", hasAttribute: (n: string) => n === "download" && attrs.download === true } : null,
  });
  const click = (target: unknown, init: Partial<{ button: number; metaKey: boolean }> = {}) => {
    const e = new Event("click", { cancelable: true }) as Event & Record<string, unknown>;
    Object.assign(e, { button: init.button ?? 0, metaKey: init.metaKey ?? false, ctrlKey: false, shiftKey: false, altKey: false });
    Object.defineProperty(e, "target", { value: target });
    return e;
  };

  it("cancels an in-app link when the person stays", () => {
    const f = fakeWindow(false);
    const disarm = installUnsavedGuard(f.win);
    const e = click(anchor("/runs"));
    f.doc.dispatchEvent(e);
    expect(f.confirm).toHaveBeenCalledWith(LEAVE_PROMPT);
    expect(e.defaultPrevented).toBe(true);
    disarm();
  });

  it("lets an in-app link through on confirm", () => {
    const f = fakeWindow(true);
    const disarm = installUnsavedGuard(f.win);
    const e = click(anchor("/runs"));
    f.doc.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(false);
    disarm();
  });

  it("asks the browser on a reload", () => {
    const f = fakeWindow(false);
    const disarm = installUnsavedGuard(f.win);
    const e = new Event("beforeunload", { cancelable: true });
    f.target.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
    disarm();
  });

  it("does not ask for a new tab, a modified click or a non-link", () => {
    const f = fakeWindow(false);
    const disarm = installUnsavedGuard(f.win);
    f.doc.dispatchEvent(click(anchor("/runs", { target: "_blank" })));
    f.doc.dispatchEvent(click(anchor("/runs"), { metaKey: true }));
    f.doc.dispatchEvent(click({}));
    expect(f.confirm).not.toHaveBeenCalled();
    disarm();
  });
});

describe("clickLeavesEditor", () => {
  const base: LinkClick = { button: 0, modified: false, defaultPrevented: false, link: { href: SETS, target: "", download: false } };

  it("is true for a plain in-app link to another page", () => {
    expect(clickLeavesEditor(base, EDITOR)).toBe(true);
  });

  it("is false for the same page, another origin, downloads, other buttons and handled clicks", () => {
    expect(clickLeavesEditor({ ...base, link: { href: `${EDITOR}#x`, target: "", download: false } }, EDITOR)).toBe(false);
    expect(clickLeavesEditor({ ...base, link: { href: "https://docs.bandwise.dev/", target: "", download: false } }, EDITOR)).toBe(false);
    expect(clickLeavesEditor({ ...base, link: { href: SETS, target: "", download: true } }, EDITOR)).toBe(false);
    expect(clickLeavesEditor({ ...base, button: 1 }, EDITOR)).toBe(false);
    expect(clickLeavesEditor({ ...base, defaultPrevented: true }, EDITOR)).toBe(false);
    expect(clickLeavesEditor({ ...base, link: null }, EDITOR)).toBe(false);
  });
});

describe("popLeavesEditor", () => {
  it("compares origin and path only", () => {
    expect(popLeavesEditor(EDITOR, SETS)).toBe(true);
    expect(popLeavesEditor(EDITOR, `${EDITOR}?tab=json`)).toBe(false);
    expect(popLeavesEditor(EDITOR, `${EDITOR}#q1`)).toBe(false);
    expect(popLeavesEditor(EDITOR, "https://example.com/sets/stop-check")).toBe(true);
  });
});
