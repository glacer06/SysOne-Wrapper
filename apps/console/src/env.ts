// All env access in the console goes through this module (references/conventions.md, Env).
// It is server only: importing it from a Client Component fails the build.
import "server-only";
import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const serverEnvShape = {
  // TypeSafe API key for smoke tests and fixture recording. Org keys live in the key vault.
  TYPESAFE_API_KEY: z.string().min(1).optional(),
  // Postgres connection string. The app role must not bypass RLS.
  DATABASE_URL: z.url(),
  // Session signing secret for the auth library (ADR-002).
  AUTH_SECRET: z.string().min(32),
  // Key encryption key for the tenant key vault (ADR-003).
  SYSONE_KEK: z.string().min(1),
  // ES256 private key that signs short-lived browser tokens.
  SYSONE_JWT_SIGNING_KEY: z.string().min(1),
  // Which SystemOneTransport the server uses. "fixture" never calls the network.
  SYSTEM_ONE_TRANSPORT: z.enum(["sdk", "fixture"]).default("fixture"),
  // Stripe keys. Required once billing lands in Phase 2.
  STRIPE_SECRET_KEY: z.string().startsWith("sk_").optional(),
  STRIPE_WEBHOOK_SECRET: z.string().startsWith("whsec_").optional(),
  // Redis for cache and rate limits.
  REDIS_URL: z.url().optional(),
  // Anthropic key for llm-client (Studio drafting, escalate_to_llm).
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
};

export const env = createEnv({
  server: serverEnvShape,
  client: {},
  // Server-only variables are read from process.env at runtime. Only client variables need listing.
  experimental__runtimeEnv: {},
  createFinalSchema: (shape) =>
    z.object(shape).superRefine((value, ctx) => {
      if (value.SYSTEM_ONE_TRANSPORT === "sdk" && !value.TYPESAFE_API_KEY) {
        ctx.addIssue({
          code: "custom",
          path: ["TYPESAFE_API_KEY"],
          message: "TYPESAFE_API_KEY is required when SYSTEM_ONE_TRANSPORT is sdk",
        });
      }
    }),
  emptyStringAsUndefined: true,
  skipValidation: process.env.SKIP_ENV_VALIDATION === "1",
});
