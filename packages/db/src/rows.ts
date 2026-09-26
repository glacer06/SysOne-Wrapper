// Row types for callers outside the package. Tables stay internal; these are plain shapes.

import type { InferInsertModel, InferSelectModel } from "drizzle-orm";

import type * as s from "./schema/index.js";

export type OrganizationRow = InferSelectModel<typeof s.organizations>;
export type MembershipRow = InferSelectModel<typeof s.memberships>;
export type UserRow = InferSelectModel<typeof s.users>;
export type OrgSystemOneKeyRow = InferSelectModel<typeof s.orgSystemOneKeys>;
export type OrgSystemOneKeyInsert = Omit<InferInsertModel<typeof s.orgSystemOneKeys>, "orgId">;
export type AgentTokenRow = InferSelectModel<typeof s.agentTokens>;
export type AppRow = InferSelectModel<typeof s.apps>;
export type AppTokenRow = InferSelectModel<typeof s.appTokens>;
export type ProjectRow = InferSelectModel<typeof s.projects>;
export type GoalRow = InferSelectModel<typeof s.goals>;
export type QuestionSetRow = InferSelectModel<typeof s.questionSets>;
export type QuestionSetVersionRow = InferSelectModel<typeof s.questionSetVersions>;
export type ReleasePointerRow = InferSelectModel<typeof s.releasePointers>;
export type RunRow = InferSelectModel<typeof s.runs>;
export type ReviewItemRow = InferSelectModel<typeof s.reviewItems>;
export type UsageEventRow = InferSelectModel<typeof s.usageEvents>;
export type PriceBookRow = InferSelectModel<typeof s.priceBooks>;
export type AuditLogRow = InferSelectModel<typeof s.auditLog>;
export type ApprovalRequestRow = InferSelectModel<typeof s.approvalRequests>;
export type SystemOneModelRow = InferSelectModel<typeof s.systemOneModels>;
export type SystemOneModelRouteRow = InferSelectModel<typeof s.systemOneModelRoutes>;
