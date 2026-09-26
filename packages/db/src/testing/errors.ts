// Drizzle wraps driver errors in "Failed query: ..." and keeps the Postgres error as `cause`.

/** The Postgres message behind a rejected query, or null when the promise resolved. */
export async function pgErrorOf(p: Promise<unknown>): Promise<string | null> {
  try {
    await p;
    return null;
  } catch (e) {
    const cause = (e as { cause?: { message?: unknown } }).cause;
    if (cause !== undefined && typeof cause.message === "string") return cause.message;
    return e instanceof Error ? e.message : String(e);
  }
}
