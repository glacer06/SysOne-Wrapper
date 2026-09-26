// The fixture file format (testing.md, Fixtures): one recorded or hand-authored System One exchange
// per file, keyed by a hash of the provider and the request. The request includes `model`, so the
// same questions on two models are two fixtures.

import { SystemOneProvider, SystemOneRequest, SystemOneResponse, hashJson } from "@sysone/core";
import { z } from "zod";

export const FixtureError = z.strictObject({
  status: z.number().int().min(400).max(599),
  /** The provider's error body, kept for reference. The mapping never reads it. */
  body: z.unknown(),
  headers: z.record(z.string(), z.string()).optional(),
});
export type FixtureError = z.infer<typeof FixtureError>;

const base = {
  name: z.string().min(1),
  provider: SystemOneProvider,
  /** TypeSafe's openapi.json info.version the fixture was made against. */
  openapiVersion: z.string().min(1),
  request: SystemOneRequest,
  /** x-typesafe-request-id. Falls back to the response `id` (OpenRouter). */
  requestId: z.string().min(1).optional(),
};

export const Fixture = z.union([
  z.strictObject({ ...base, response: SystemOneResponse }),
  z.strictObject({ ...base, error: FixtureError }),
]);
export type Fixture = z.infer<typeof Fixture>;

/** The key a fixture is stored and looked up under. */
export function fixtureKey(provider: SystemOneProvider, request: SystemOneRequest): string {
  return hashJson({ provider, request });
}
