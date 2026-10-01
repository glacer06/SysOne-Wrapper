// The review Server Actions: what they send to the operation, and what they do with its answer.
// consoleOperation is mocked; the operations themselves are tested in server/manage/observe.test.ts.

import { beforeEach, describe, expect, it, vi } from "vitest";

const calls: { id: string; input: unknown }[] = [];
let answer: { status: "ok"; output: unknown } | { status: "error"; code: string; message: string } = { status: "ok", output: {} };

vi.mock("~/server/console-operation", () => ({
  consoleOperation: vi.fn(async (id: string, input: unknown) => {
    calls.push({ id, input });
    return answer;
  }),
}));
const revalidated: string[] = [];
vi.mock("next/cache", () => ({ revalidatePath: (p: string) => revalidated.push(p) }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`redirect:${to}`);
  },
}));

const { confirmReviewAction, dismissReviewAction, resolveReviewAction, settleQueueItem } = await import("./actions");
const { parseReviewForm } = await import("./form");

const ITEM = "0199a1b2-0000-7000-8000-000000000001";
const RUN = "0199a1b2-0000-7000-8000-000000000002";

function form(fields: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
}

beforeEach(() => {
  calls.length = 0;
  revalidated.length = 0;
  answer = { status: "ok", output: {} };
});

describe("parseReviewForm", () => {
  it("keeps JSON types and reads plain text as a string", () => {
    expect(parseReviewForm(form({ id: ITEM, value: "true" }), true)).toMatchObject({ ok: true, value: true, runId: null });
    expect(parseReviewForm(form({ id: ITEM, value: "2" }), true)).toMatchObject({ ok: true, value: 2 });
    expect(parseReviewForm(form({ id: ITEM, value: "urgent" }), true)).toMatchObject({ ok: true, value: "urgent" });
  });

  it("refuses a bad id or a missing answer, and drops an unknown failure class", () => {
    expect(parseReviewForm(form({ id: "x", value: "true" }), true)).toMatchObject({ ok: false });
    expect(parseReviewForm(form({ id: ITEM }), true)).toEqual({ ok: false, error: "Pick the right answer first." });
    expect(parseReviewForm(form({ id: ITEM, value: "false", failureClass: "nope" }), true)).toMatchObject({ ok: true, failureClass: undefined });
  });
});

describe("review actions", () => {
  it("resolves with { value } and the failure class, refreshes the queue and the run, and returns to the queue", async () => {
    await expect(resolveReviewAction({}, form({ id: ITEM, runId: RUN, value: "false", failureClass: "model_error" }))).rejects.toThrow("redirect:/review?done=resolved");
    expect(calls).toEqual([{ id: "review.resolve", input: { id: ITEM, resolution: { value: false }, failureClass: "model_error" } }]);
    expect(revalidated).toEqual(["/review", `/runs/${RUN}`]);
  });

  it("shows the operation's message and stays on the page when it fails", async () => {
    answer = { status: "error", code: "already_exists", message: "Review item x is already resolved." };
    expect(await resolveReviewAction({}, form({ id: ITEM, value: "true" }))).toEqual({ error: "Review item x is already resolved." });
    expect(revalidated).toEqual([]);
  });

  it("calls nothing for a form that does not parse", async () => {
    expect(await resolveReviewAction({}, form({ id: ITEM }))).toEqual({ error: "Pick the right answer first." });
    expect(calls).toEqual([]);
  });

  it("dismisses, and confirms with or without a replacement", async () => {
    await expect(dismissReviewAction({}, form({ id: ITEM }))).rejects.toThrow("redirect:/review?done=dismissed");
    await expect(confirmReviewAction({}, form({ id: ITEM }))).rejects.toThrow("redirect:/review?done=confirmed");
    await expect(confirmReviewAction({}, form({ id: ITEM, value: "true" }))).rejects.toThrow("redirect:/review?done=confirmed");
    expect(calls).toEqual([
      { id: "review.dismiss", input: { id: ITEM } },
      { id: "review.confirm", input: { id: ITEM } },
      { id: "review.confirm", input: { id: ITEM, resolution: { value: true } } },
    ]);
  });
});

describe("settleQueueItem", () => {
  it("treats an item that is already closed as settled, so a retry after a lost response is not an error", async () => {
    answer = { status: "error", code: "already_exists", message: "This item was already resolved." };
    await expect(settleQueueItem({ op: "resolve", id: ITEM, runId: RUN, value: "true" })).resolves.toEqual({ ok: true });
    expect(revalidated).toEqual(["/review", `/runs/${RUN}`]);
  });

  it("still reports any other failure", async () => {
    answer = { status: "error", code: "not_found", message: "No such item." };
    await expect(settleQueueItem({ op: "dismiss", id: ITEM, runId: null })).resolves.toEqual({ ok: false, message: "No such item." });
  });
});
