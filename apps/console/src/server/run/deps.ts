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

/** The fixture transport never sends a key, so fixture mode needs no real one. */
export const FIXTURE_PLACEHOLDER_KEY = "fixture-mode-sends-no-key";

type KeyEnv = Pick<ReturnType<typeof getEnv>, "SYSTEM_ONE_TRANSPORT" | "TYPESAFE_API_KEY" | "OPENROUTER_API_KEY" | "AI_GATEWAY_API_KEY">;

/**
 * The platform keys per provider. In fixture mode a missing key becomes a placeholder, so a local
 * preview does not fail with "the org's System One key was rejected" for a key it never sends.
 */
export function platformKeysFor(env: KeyEnv): RunSetDeps["platformKeys"] {
  const fill = env.SYSTEM_ONE_TRANSPORT === "sdk" ? undefined : FIXTURE_PLACEHOLDER_KEY;
  const typesafe = env.TYPESAFE_API_KEY ?? fill;
  const openrouter = env.OPENROUTER_API_KEY ?? fill;
  const vercel = env.AI_GATEWAY_API_KEY ?? fill;
  return {
    ...(typesafe !== undefined ? { typesafe } : {}),
    ...(openrouter !== undefined ? { openrouter } : {}),
    ...(vercel !== undefined ? { vercel } : {}),
  };
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
    platformKeys: platformKeysFor(env),
  };
}
