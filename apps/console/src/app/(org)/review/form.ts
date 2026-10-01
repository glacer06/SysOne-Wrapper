// Parsing for the review Server Actions. Pure, so it is unit tested without a request.

import { FailureClass, type JsonValue } from "@bandwise/core";

export interface ReviewFormState {
  error?: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const text = (form: FormData, key: string): string => {
  const v = form.get(key);
  return typeof v === "string" ? v.trim() : "";
};

export type ParsedReviewForm =
  | { ok: true; id: string; runId: string | null; value: JsonValue | undefined; failureClass: FailureClass | undefined }
  | { ok: false; error: string };

/**
 * The item id, its run, and the picked value. `value` holds JSON text: the form encodes each
 * option that way so Yes stays `true` and a score level stays a number. Plain text that is not
 * JSON is taken as a string, for a free-text answer.
 */
export function parseReviewForm(form: FormData, needsValue: boolean): ParsedReviewForm {
  const id = text(form, "id");
  if (!UUID.test(id)) return { ok: false, error: "This review item is not valid. Reload the page and try again." };
  const run = text(form, "runId");
  const runId = UUID.test(run) ? run : null;
  const raw = text(form, "value");
  let value: JsonValue | undefined;
  if (raw !== "") {
    try {
      value = JSON.parse(raw) as JsonValue;
    } catch {
      value = raw;
    }
  }
  if (needsValue && value === undefined) return { ok: false, error: "Pick the right answer first." };
  const fc = FailureClass.safeParse(text(form, "failureClass"));
  return { ok: true, id, runId, value, failureClass: fc.success ? fc.data : undefined };
}
