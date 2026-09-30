// The one CLI module that reads the environment (ADR-020). The System One key comes from the
// variable that matches the provider, of the person running the command. Never from a flag, a spec,
// a profile or a file. It is never printed or logged: errors name the variable, never a value.
// The launch profile variables below are not secrets; they live here so one file owns every read.

import type { SystemOneProvider } from "@bandwise/core";

/** The environment variable that holds each provider's key. */
export const PROVIDER_KEY_ENV: Readonly<Record<SystemOneProvider, string>> = Object.freeze({
  typesafe: "TYPESAFE_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
  vercel: "AI_GATEWAY_API_KEY",
});

export type KeyLookup = { ok: true; apiKey: string } | { ok: false; envName: string; message: string };

/** Read the key for a provider. `env` defaults to process.env; tests pass their own. */
export function readProviderKey(provider: SystemOneProvider, env: Readonly<Record<string, string | undefined>> = process.env): KeyLookup {
  const envName = PROVIDER_KEY_ENV[provider];
  const value = env[envName];
  if (value === undefined || value.trim() === "") {
    return { ok: false, envName, message: `${envName} is not set. Live mode on ${provider} reads the key from ${envName} in your environment, and nowhere else.` };
  }
  return { ok: true, apiKey: value.trim() };
}

/** Set by `bandwise launch` (not in this release yet) for the agent it starts, so hooks can record the profile. */
export const LAUNCH_PROFILE_ENV = "BANDWISE_LAUNCH_PROFILE";
export const LAUNCH_PICKED_ENV = "BANDWISE_LAUNCH_PICKED";

/** A profile id from the reviewed profiles file: short, no spaces, nothing that could carry text. */
const PROFILE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

/** The launch profile a session started with and the one picked. Anything that is not a profile id reads as null. */
export function readLaunchProfile(env: Readonly<Record<string, string | undefined>> = process.env): { profile: string | null; picked: string | null } {
  const id = (name: string): string | null => {
    const v = env[name]?.trim();
    return v !== undefined && PROFILE_ID.test(v) ? v : null;
  };
  return { profile: id(LAUNCH_PROFILE_ENV), picked: id(LAUNCH_PICKED_ENV) };
}
