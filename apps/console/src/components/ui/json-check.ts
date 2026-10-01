export type JsonCheck = { ok: true; value: unknown } | { ok: false; message: string; line: number | null };

/** Parses JSON and says where it broke, in words a person can act on. */
export function checkJson(text: string): JsonCheck {
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Invalid JSON";
    const pos = /position (\d+)/.exec(message);
    const line = pos === null ? null : text.slice(0, Number(pos[1])).split("\n").length;
    return { ok: false, message, line };
  }
}
