// The review queue's key map (REVIEW-A). Pure, so it is unit tested without a browser.
//
// J and K move, 1 to 9 pick a value, Enter confirms, D dismisses, U undoes, ? shows the map and
// Escape hides it. Nothing fires while a person types in a field, or with Ctrl, Cmd or Alt held, so
// browser and screen reader shortcuts keep working.

export type QueueCommand =
  | { type: "next" }
  | { type: "prev" }
  | { type: "pick"; index: number }
  | { type: "confirm" }
  | { type: "dismiss" }
  | { type: "undo" }
  | { type: "help" }
  | { type: "close" };

/** The parts of a KeyboardEvent the map reads. */
export interface KeyInput {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  /** True when the key is held down and repeating. */
  repeat?: boolean;
  target?: TargetLike | null;
}

/** The parts of the event target the map reads. */
export interface TargetLike {
  tagName?: string;
  isContentEditable?: boolean;
  type?: string;
  role?: string | null;
}

const TEXT_INPUT_TYPES = new Set(["text", "search", "email", "url", "tel", "password", "number", "date", "datetime-local", "month", "time", "week", ""]);

/** True when the target takes typing: a text field, a text area, a select or editable content. */
export function isTypingTarget(t: TargetLike | null | undefined): boolean {
  if (t === null || t === undefined) return false;
  if (t.isContentEditable === true) return true;
  const tag = (t.tagName ?? "").toUpperCase();
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag === "INPUT") return TEXT_INPUT_TYPES.has((t.type ?? "").toLowerCase());
  return t.role === "textbox" || t.role === "combobox";
}

/** True when Enter already means something on the target: a button, a link or a summary. */
function activatesOnEnter(t: TargetLike | null | undefined): boolean {
  // The value pickers are radios: Enter on one confirms the picked value, like the rest of the pane.
  if (t?.role === "radio") return false;
  const tag = (t?.tagName ?? "").toUpperCase();
  return tag === "BUTTON" || tag === "A" || tag === "SUMMARY" || tag === "INPUT" || t?.role === "button" || t?.role === "link";
}

/** What a key press means in the queue, or null to let the browser have it. */
export function queueCommand(e: KeyInput, choiceCount: number): QueueCommand | null {
  if (e.ctrlKey === true || e.metaKey === true || e.altKey === true) return null;
  if (isTypingTarget(e.target)) return null;
  switch (e.key) {
    case "j":
    case "J":
      return { type: "next" };
    case "k":
    case "K":
      return { type: "prev" };
    case "Enter":
      return e.repeat === true || activatesOnEnter(e.target) ? null : { type: "confirm" };
    case "d":
    case "D":
      return e.repeat === true ? null : { type: "dismiss" };
    case "u":
    case "U":
      return { type: "undo" };
    case "?":
      return { type: "help" };
    case "Escape":
      return { type: "close" };
    default:
      break;
  }
  if (/^[1-9]$/.test(e.key)) {
    const index = Number(e.key) - 1;
    return index < choiceCount ? { type: "pick", index } : null;
  }
  return null;
}

/** The next or previous id in `ids` from `current`, staying put at either end. */
export function step(ids: readonly string[], current: string | null, by: 1 | -1): string | null {
  if (ids.length === 0) return null;
  const at = current === null ? -1 : ids.indexOf(current);
  if (at === -1) return ids[0] ?? null;
  return ids[Math.min(ids.length - 1, Math.max(0, at + by))] ?? null;
}

/** The id to show after `id` leaves the queue: the one after it, else the one before, else none. */
export function afterRemoving(ids: readonly string[], id: string): string | null {
  const at = ids.indexOf(id);
  const rest = ids.filter((x) => x !== id);
  if (rest.length === 0) return null;
  if (at === -1) return rest[0] ?? null;
  return rest[Math.min(at, rest.length - 1)] ?? null;
}

/** How long a resolve waits for Undo before it is sent. */
export const UNDO_MS = 6000;
