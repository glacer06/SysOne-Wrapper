// The console's auth wiring for pages and Server Actions. Server only.
//
//   getConsoleState()  who is signed in and how far (session.ts, resolveConsoleState).
//   requireConsole()   for protected pages and actions: the ConsoleContext, or a redirect to the
//                      step the person still needs.
import "server-only";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { getEnv } from "~/env";

import { getDb } from "../db";
import { createAttemptLimiter } from "./attempts";
import { createConsoleAuth, parseAllowedEmails, type ConsoleAuth } from "./config";
import type { FlowDeps } from "./flows";
import { type ConsoleContext, type ConsoleState, resolveConsoleState } from "./session";

export type { ConsoleState } from "./session";

let auth: ConsoleAuth | undefined;

function missing(name: string): never {
  throw new Error(`${name} is not set, so console sign-in is off.`);
}

export function getAuth(): ConsoleAuth {
  if (auth === undefined) {
    const env = getEnv();
    auth = createConsoleAuth({
      db: getDb(),
      secret: env.AUTH_SECRET,
      baseURL: env.BETTER_AUTH_URL ?? missing("BETTER_AUTH_URL"),
      allowedEmails: parseAllowedEmails(env.BANDWISE_CONSOLE_EMAILS),
      nextCookies: true,
    });
  }
  return auth;
}

/** One limiter per server instance. */
const limiter = createAttemptLimiter();

/** What a Server Action hands to the flows in flows.ts. */
export async function flowDeps(): Promise<FlowDeps> {
  return { auth: getAuth(), limiter, headers: new Headers(await headers()) };
}

/** Once per request: layouts and pages share it. */
export const getConsoleState = cache(async (): Promise<ConsoleState> => {
  const h = await headers();
  const session = await getAuth().api.getSession({ headers: h });
  const requestId = h.get("x-vercel-id") ?? globalThis.crypto.randomUUID();
  return resolveConsoleState(getDb(), session, requestId, parseAllowedEmails(getEnv().BANDWISE_CONSOLE_EMAILS));
});

/** The signed-in member's context, or a redirect to the step they still need. */
export async function requireConsole(): Promise<ConsoleContext> {
  const state = await getConsoleState();
  if (state.kind === "ready") return state.console;
  redirect(state.kind === "needs-two-factor" ? "/setup-two-factor" : state.kind === "no-access" ? "/no-access" : "/sign-in");
}
