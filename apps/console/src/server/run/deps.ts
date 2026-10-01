// The run deps both run surfaces share: the API route and the console's draft preview. The
// System One keys come from the server env here and nowhere else in the console run path.
import "server-only";

import type { SystemOneTransport } from "@bandwise/core";
import { FixtureTransport, SdkTransport } from "@bandwise/system-one-client/server";

import { getEnv } from "~/env";

import { getDb } from "../db";
import type { RunSetDeps } from "./run-set";

let transport: SystemOneTransport | undefined;

/** True when this server answers runs with synthetic answers (SYSTEM_ONE_TRANSPORT=fixture). */
export function usesFixtureTransport(): boolean {
  return getEnv().SYSTEM_ONE_TRANSPORT !== "sdk";
}

/** Throws when the env is incomplete; callers turn that into a generic failure. */
export function serverRunDeps(): RunSetDeps {
  const env = getEnv();
  // One transport per server instance, so the SDK client cache survives across requests. Fixture
  // mode answers with synthetic answers only (system-one-client/server), for a local server.
  transport ??= env.SYSTEM_ONE_TRANSPORT === "sdk" ? new SdkTransport() : new FixtureTransport([], { synthesize: true });
  return {
    db: getDb(),
    transport,
    platformKeys: {
      ...(env.TYPESAFE_API_KEY !== undefined ? { typesafe: env.TYPESAFE_API_KEY } : {}),
      ...(env.OPENROUTER_API_KEY !== undefined ? { openrouter: env.OPENROUTER_API_KEY } : {}),
      ...(env.AI_GATEWAY_API_KEY !== undefined ? { vercel: env.AI_GATEWAY_API_KEY } : {}),
    },
  };
}
