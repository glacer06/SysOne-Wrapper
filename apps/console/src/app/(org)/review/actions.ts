"use server";

// Server Actions for the review queue. Each one calls the same operation as /api/v1 and the CLI
// through consoleOperation, then refreshes the queue and the run, and returns to the queue.

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
