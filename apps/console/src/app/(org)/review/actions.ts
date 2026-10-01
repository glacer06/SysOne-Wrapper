"use server";

// Server Actions for the review queue. Each one calls the same operation as /api/v1 and the CLI
// through consoleOperation, then refreshes the queue and the run.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { consoleOperation } from "~/server/console-operation";

import { parseReviewForm, type ReviewFormState } from "./form";

function refresh(runId: string | null): void {
  revalidatePath("/review");
  if (runId !== null) revalidatePath(`/runs/${runId}`);
}

export async function resolveReviewAction(_prev: ReviewFormState, form: FormData): Promise<ReviewFormState> {
  const parsed = parseReviewForm(form, true);
  if (!parsed.ok) return { error: parsed.error };
  const res = await consoleOperation("review.resolve", {
    id: parsed.id,
    resolution: { value: parsed.value ?? null },
    ...(parsed.failureClass === undefined ? {} : { failureClass: parsed.failureClass }),
  });
  if (res.status !== "ok") return { error: res.status === "error" ? res.message : "Resolving is not served yet." };
  refresh(parsed.runId);
  redirect("/review?done=resolved");
}

export async function dismissReviewAction(_prev: ReviewFormState, form: FormData): Promise<ReviewFormState> {
  const parsed = parseReviewForm(form, false);
  if (!parsed.ok) return { error: parsed.error };
  const res = await consoleOperation("review.dismiss", { id: parsed.id });
  if (res.status !== "ok") return { error: res.status === "error" ? res.message : "Dismissing is not served yet." };
  refresh(parsed.runId);
  redirect("/review?done=dismissed");
}

/** Confirm an agent's answer as it stands, or replace it when the form sends a value. */
export async function confirmReviewAction(_prev: ReviewFormState, form: FormData): Promise<ReviewFormState> {
  const parsed = parseReviewForm(form, false);
  if (!parsed.ok) return { error: parsed.error };
  const res = await consoleOperation("review.confirm", { id: parsed.id, ...(parsed.value === undefined ? {} : { resolution: { value: parsed.value } }) });
  if (res.status !== "ok") return { error: res.status === "error" ? res.message : "Confirming is not served yet." };
  refresh(parsed.runId);
  redirect("/review?done=confirmed");
}

/** What the split queue sends when an undo window closes. */
export interface QueueSettle {
  op: "resolve" | "dismiss" | "confirm";
  id: string;
  runId: string | null;
  /** JSON text of the picked value. Confirm leaves it out to keep the agent's answer. */
  value?: string;
  failureClass?: string;
}

/**
 * The split queue's one action: resolve, dismiss or confirm, without a redirect, so the queue moves
 * on in place. The same operations as the forms above, parsed by the same rules.
 */
export async function settleQueueItem(input: QueueSettle): Promise<{ ok: true } | { ok: false; message: string }> {
  const form = new FormData();
  form.set("id", input.id);
  if (input.runId !== null) form.set("runId", input.runId);
  if (input.value !== undefined) form.set("value", input.value);
  if (input.failureClass !== undefined) form.set("failureClass", input.failureClass);
  const parsed = parseReviewForm(form, input.op === "resolve");
  if (!parsed.ok) return { ok: false, message: parsed.error };
  const res =
    input.op === "resolve"
      ? await consoleOperation("review.resolve", {
          id: parsed.id,
          resolution: { value: parsed.value ?? null },
          ...(parsed.failureClass === undefined ? {} : { failureClass: parsed.failureClass }),
        })
      : input.op === "dismiss"
        ? await consoleOperation("review.dismiss", { id: parsed.id })
        : await consoleOperation("review.confirm", { id: parsed.id, ...(parsed.value === undefined ? {} : { resolution: { value: parsed.value } }) });
  // A retry after a lost response finds the item already closed. The decision landed, so that is success.
  if (res.status === "error" && res.code === "already_exists") {
    refresh(parsed.runId);
    return { ok: true };
  }
  if (res.status !== "ok") return { ok: false, message: res.status === "error" ? res.message : "The review queue is not served yet." };
  refresh(parsed.runId);
  return { ok: true };
}
