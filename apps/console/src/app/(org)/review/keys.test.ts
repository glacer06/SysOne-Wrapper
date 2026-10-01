import { describe, expect, it } from "vitest";

import { afterRemoving, isTypingTarget, queueCommand, step } from "./keys";

const body = { tagName: "BODY" };

describe("queue keys", () => {
  it("maps the documented keys", () => {
    expect(queueCommand({ key: "j", target: body }, 2)).toEqual({ type: "next" });
    expect(queueCommand({ key: "K", target: body }, 2)).toEqual({ type: "prev" });
    expect(queueCommand({ key: "2", target: body }, 2)).toEqual({ type: "pick", index: 1 });
    expect(queueCommand({ key: "3", target: body }, 2)).toBeNull();
    expect(queueCommand({ key: "0", target: body }, 9)).toBeNull();
    expect(queueCommand({ key: "Enter", target: body }, 2)).toEqual({ type: "confirm" });
    expect(queueCommand({ key: "d", target: body }, 2)).toEqual({ type: "dismiss" });
    expect(queueCommand({ key: "u", target: body }, 2)).toEqual({ type: "undo" });
    expect(queueCommand({ key: "?", target: body }, 2)).toEqual({ type: "help" });
    expect(queueCommand({ key: "Escape", target: body }, 2)).toEqual({ type: "close" });
    expect(queueCommand({ key: "x", target: body }, 2)).toBeNull();
  });

  it("never fires while typing in a field", () => {
    for (const target of [{ tagName: "INPUT", type: "text" }, { tagName: "TEXTAREA" }, { tagName: "SELECT" }, { tagName: "DIV", isContentEditable: true }, { tagName: "DIV", role: "textbox" }]) {
      expect(queueCommand({ key: "j", target }, 2)).toBeNull();
      expect(queueCommand({ key: "1", target }, 2)).toBeNull();
      expect(queueCommand({ key: "Enter", target }, 2)).toBeNull();
    }
    expect(isTypingTarget({ tagName: "INPUT", type: "checkbox" })).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });

  it("leaves modified keys and held keys to the browser", () => {
    expect(queueCommand({ key: "j", ctrlKey: true, target: body }, 2)).toBeNull();
    expect(queueCommand({ key: "1", metaKey: true, target: body }, 2)).toBeNull();
    expect(queueCommand({ key: "d", altKey: true, target: body }, 2)).toBeNull();
    expect(queueCommand({ key: "Enter", repeat: true, target: body }, 2)).toBeNull();
    expect(queueCommand({ key: "d", repeat: true, target: body }, 2)).toBeNull();
  });

  it("lets Enter activate buttons and links, but confirms from a value picker", () => {
    expect(queueCommand({ key: "Enter", target: { tagName: "BUTTON" } }, 2)).toBeNull();
    expect(queueCommand({ key: "Enter", target: { tagName: "A" } }, 2)).toBeNull();
    expect(queueCommand({ key: "Enter", target: { tagName: "BUTTON", role: "radio" } }, 2)).toEqual({ type: "confirm" });
  });
});

describe("queue moves", () => {
  it("steps and stays put at the ends", () => {
    expect(step(["a", "b", "c"], "b", 1)).toBe("c");
    expect(step(["a", "b", "c"], "c", 1)).toBe("c");
    expect(step(["a", "b", "c"], "a", -1)).toBe("a");
    expect(step(["a", "b"], null, 1)).toBe("a");
    expect(step([], "a", 1)).toBeNull();
  });

  it("shows the next item after one leaves, else the one before", () => {
    expect(afterRemoving(["a", "b", "c"], "b")).toBe("c");
    expect(afterRemoving(["a", "b", "c"], "c")).toBe("b");
    expect(afterRemoving(["a"], "a")).toBeNull();
  });
});
