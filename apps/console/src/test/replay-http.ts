// Replays recorded HTTP exchanges so job tests make no network call. A request with no matching
// recording fails the test instead of reaching the network.

import { readFileSync } from "node:fs";

export interface HttpRecording {
  note?: string;
  request: { method: string; url: string; /** Match only a JSON body with this `model`. */ model?: string };
  response: { status: number; headers?: Record<string, string>; body: unknown };
}

export function loadRecording(dirUrl: URL, name: string): HttpRecording {
  return JSON.parse(readFileSync(new URL(name, dirUrl), "utf8")) as HttpRecording;
}

export interface ReplayFetch {
  (input: string | URL | Request, init?: RequestInit): Promise<Response>;
  /** Every request, in order, as "METHOD url". */
  readonly seen: string[];
  /** Authorization headers sent, in order (null when absent). */
  readonly auth: Array<string | null>;
}

function headerOf(init: RequestInit | undefined, input: string | URL | Request, name: string): string | null {
  const h = new Headers(input instanceof Request ? input.headers : undefined);
  if (init?.headers !== undefined) new Headers(init.headers).forEach((v, k) => h.set(k, v));
  return h.get(name);
}

export function replayFetch(recordings: readonly HttpRecording[]): ReplayFetch {
  const seen: string[] = [];
  const auth: Array<string | null> = [];
  const fn = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = input instanceof Request ? input.url : String(input);
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    const rawBody = init?.body ?? (input instanceof Request ? await input.clone().text() : undefined);
    let model: unknown;
    if (typeof rawBody === "string" && rawBody !== "") {
      try {
        model = (JSON.parse(rawBody) as { model?: unknown }).model;
      } catch {
        model = undefined;
      }
    }
    seen.push(`${method} ${url}`);
    auth.push(headerOf(init, input, "authorization"));
    const hit = recordings.find(
      (r) => r.request.method.toUpperCase() === method && r.request.url === url && (r.request.model === undefined || r.request.model === model),
    );
    if (hit === undefined) throw new Error(`no recording for ${method} ${url}${model === undefined ? "" : ` (model ${String(model)})`}`);
    const body = typeof hit.response.body === "string" ? hit.response.body : JSON.stringify(hit.response.body);
    return new Response(body, { status: hit.response.status, headers: hit.response.headers ?? {} });
  };
  return Object.assign(fn, { seen, auth });
}

/** A fetch that serves fixed text per URL (contract watch). */
export function textFetch(pages: Record<string, { status?: number; body: string }>): ReplayFetch {
  return replayFetch(Object.entries(pages).map(([url, p]) => ({ request: { method: "GET", url }, response: { status: p.status ?? 200, body: p.body } })));
}
