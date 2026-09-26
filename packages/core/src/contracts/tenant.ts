// TenantContext and PublishCtx.
// Sources: references/architecture.md (Core contracts, Lints), ADR-007 (agent actor),
// references/security.md (app tokens, agent tokens).
// Both are in-process contracts, so their schemas are strict: unknown keys fail.

import { z } from "zod";

import {
  AgentClient,
  AppId,
  Client,
  KeyId,
  OrgId,
  PlanId,
  PlatformRole,
  PointerChannel,
  Role,
  RolloutStage,
  Scope,
  SetId,
  TokenId,
  UserId,
} from "./common.js";
import { SetInterface } from "./spec.js";

// ---------------------------------------------------------------------------
// Actors

/** A person in a console session. */
export const UserActor = z.strictObject({
  type: z.literal("user"),
  userId: UserId,
  role: Role,
  /** users.platform_role. */
  platformRole: PlatformRole.nullable(),
  /** Set during platform impersonation. */
  impersonatorId: UserId.nullable(),
});
export type UserActor = z.infer<typeof UserActor>;

/** sk_, pk_ or a browser JWT. */
export const AppTokenKind = z.enum(["secret", "publishable", "browser"]);
export type AppTokenKind = z.infer<typeof AppTokenKind>;

/** slug@draft needs test mode (sk_test_). */
export const AppTokenMode = z.enum(["live", "test"]);
export type AppTokenMode = z.infer<typeof AppTokenMode>;

/**
 * A host-app token. A browser JWT carries the keyId, mode and channel of the sk_ token that
 * minted it, and is run-only.
 */
export const ApiKeyActor = z.strictObject({
  type: z.literal("apiKey"),
  keyId: KeyId,
  appId: AppId,
  tokenKind: AppTokenKind,
  mode: AppTokenMode,
  /** The token's bound channel. */
  channel: PointerChannel,
  scopes: z.array(Scope),
  /** Null means every set. */
  setIds: z.array(SetId).nullable(),
  /** The checked Origin; pk_ and browser tokens only. */
  origin: z.string().nullable(),
});
export type ApiKeyActor = z.infer<typeof ApiKeyActor>;

/** An sa_live_ agent token. role = min(role_ceiling, current membership role), per request. */
export const AgentActor = z.strictObject({
  type: z.literal("agent"),
  tokenId: TokenId,
  userId: UserId,
  role: Role,
  scopes: z.array(Scope),
  /** Null means every set. */
  setIds: z.array(SetId).nullable(),
  client: AgentClient,
});
export type AgentActor = z.infer<typeof AgentActor>;

/** Jobs and auto-demote. */
export const SystemActor = z.strictObject({ type: z.literal("system") });
export type SystemActor = z.infer<typeof SystemActor>;

export const Actor = z.discriminatedUnion("type", [UserActor, ApiKeyActor, AgentActor, SystemActor]);
export type Actor = z.infer<typeof Actor>;

export type ActorKind = Actor["type"];

// ---------------------------------------------------------------------------
// TenantContext

export const TenantContext = z.strictObject({
  orgId: OrgId,
  actor: Actor,
  /**
   * The surface of this request: "console" for Server Actions, "api" for app tokens and cookie
   * calls to /api/v1, the token's client for agent tokens, "job" for system.
   */
  client: Client,
  plan: PlanId,
  requestId: z.string().min(1),
});
export type TenantContext = z.infer<typeof TenantContext>;

// ---------------------------------------------------------------------------
// PublishCtx

/** A channel checked for interface.breaking. */
export const PublishServedChannel = z.strictObject({
  channel: PointerChannel,
  interface: SetInterface,
  interfaceMajor: z.number().int().nonnegative(),
  /** Live bindings, or app runs on that channel in the last 30 days. */
  hasConsumers: z.boolean(),
});
export type PublishServedChannel = z.infer<typeof PublishServedChannel>;

/**
 * What publish-time lints read. The operation builds it from the stores; core never reads them.
 */
export const PublishCtx = z.strictObject({
  /** The target channel. */
  channel: PointerChannel,
  /** The target's stage; "inactive" when it has no pointer yet. */
  rolloutStage: RolloutStage,
  /**
   * Channels to check for interface.breaking: the target, plus production when the target is
   * staging. One entry per channel that has a pointer.
   */
  served: z.array(PublishServedChannel),
  /**
   * publish: the set's highest major, plus one with interfaceBump.
   * promote: the promoted version's stored major.
   */
  newMajor: z.number().int().nonnegative(),
  /** org_typesafe_keys.models. */
  reachableModels: z.array(z.string()),
  allowPreviewModels: z.boolean(),
  /** Action handlers installed and enabled for the org. */
  enabledHandlers: z.array(z.string()),
  /** Sets this spec names as fallbacks. A missing key means no such set. */
  fallbackSets: z.record(z.string(), z.strictObject({ usesSetFallback: z.boolean() })),
  /** The set stores hashes only. */
  hashOnly: z.boolean(),
});
export type PublishCtx = z.infer<typeof PublishCtx>;
