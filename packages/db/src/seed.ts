// Org seeds (data-model.md, rule 6: seeds always create at least two orgs). Every tenant row is
// written as sysone_app through withTenant, so the seed itself exercises the RLS policies.
//
// TWO_ORG_SEED backs the cross-tenant suite. THREE_ORG_SEED (sgr, personal, dallas) backs the
// Phase 2 Playwright org switch; the same user belongs to all three with different roles.

import {
  DEFAULT_LABELING_POLICY,
  defaultQualityTarget,
  QuestionSetSpec,
  type Role,
  type TenantContext,
} from "@sysone/core/contracts";

import { sql } from "drizzle-orm";

import type { SysoneDb } from "./client.js";
import { drizzleOf } from "./internal/drizzle.js";
import { authRepositories, repos } from "./repos/index.js";

export interface OrgSeedMember {
  email: string;
  name: string;
  role: Role;
}

export interface OrgSeed {
  slug: string;
  name: string;
  members: OrgSeedMember[];
}

export interface SeededOrg {
  orgId: string;
  slug: string;
  userIds: Record<string, string>;
  projectId: string;
  goalId: string;
  setId: string;
  setSlug: string;
  /** Version 1, published, on the production pointer at shadow. */
  publishedVersionId: string;
  draftVersionId: string;
  appId: string;
}

export const TWO_ORG_SEED: readonly OrgSeed[] = [
  { slug: "acme", name: "Acme", members: [{ email: "ada@acme.test", name: "Ada", role: "owner" }] },
  { slug: "globex", name: "Globex", members: [{ email: "grace@globex.test", name: "Grace", role: "owner" }] },
];

/** Nick's own orgs (ADR-006 plan `internal`), for the three-org E2E switch. */
export const THREE_ORG_SEED: readonly OrgSeed[] = [
  {
    slug: "sgr",
    name: "SGR",
    members: [
      { email: "nick@sysone.test", name: "Nick", role: "owner" },
      { email: "rita@sysone.test", name: "Rita", role: "reviewer" },
    ],
  },
  { slug: "personal", name: "Personal", members: [{ email: "nick@sysone.test", name: "Nick", role: "owner" }] },
  {
    slug: "dallas",
    name: "Dallas",
    members: [
      { email: "nick@sysone.test", name: "Nick", role: "admin" },
      { email: "vic@sysone.test", name: "Vic", role: "viewer" },
    ],
  },
];

/** A small valid spec: one noul question. Parsed at load, so a contract change fails the seed tests. */
export const SEED_SPEC: QuestionSetSpec = QuestionSetSpec.parse({
  schemaVersion: 1,
  model: "jev-1.13.0",
  input: {
    schema: { type: "object", required: ["text"], properties: { text: { type: "string" } } },
  },
  stages: [
    {
      id: "triage",
      questions: {
        needs_reply: {
          type: "noul",
          instructions: "Does `text` ask the recipient to reply or act?",
          criteria: { true: "The sender asks for a reply or an action.", false: "No reply or action is needed." },
          meta: { label: "Needs a reply" },
        },
      },
    },
  ],
  policies: {
    needs_reply: {
      type: "noul",
      gating: true,
      noul: { trueAt: 0.85, falseAt: 0.15, reviewMargin: 0.1 },
      actions: { high: { kind: "auto" }, medium: { kind: "review" }, low: { kind: "review" } },
    },
  },
});

/** The system actor context a seed or job uses for one org. */
export function systemContext(orgId: string, requestId = "seed"): TenantContext {
  return { orgId, actor: { type: "system" }, client: "job", plan: "internal", requestId };
}

async function ensureUser(db: SysoneDb, m: OrgSeedMember): Promise<string> {
  return db.withNoTenant(async (tx) => {
    const existing = await authRepositories.users.getByEmail(tx, m.email);
    if (existing !== null) return existing.id;
    const user = await authRepositories.users.insert(tx, { email: m.email, name: m.name, emailVerified: true });
    return user.id;
  });
}

/**
 * Creates each org with its members, a project, a goal, a question set (published v1 on the
 * production pointer at shadow, plus an open draft v2) and one app. Ids come from
 * gen_random_uuid(). Each org gets one audit row for the seed.
 */
/** A fresh org id from the database (gen_random_uuid), so the seed needs no id source of its own. */
async function newOrgIdFromDb(db: SysoneDb): Promise<string> {
  return db.withNoTenant(async (tx) => {
    const res = await drizzleOf(tx).execute<{ id: string }>(sql`select gen_random_uuid()::text as id`);
    const id = (res as unknown as { rows: { id: string }[] }).rows[0]?.id;
    if (id === undefined) throw new Error("gen_random_uuid returned no row");
    return id;
  });
}

export async function seedOrgs(db: SysoneDb, seeds: readonly OrgSeed[]): Promise<SeededOrg[]> {
  const out: SeededOrg[] = [];
  for (const seed of seeds) {
    const userIds: Record<string, string> = {};
    for (const m of seed.members) userIds[m.email] = await ensureUser(db, m);

    const orgId = await newOrgIdFromDb(db);
    const seeded = await db.withTenant(systemContext(orgId), async (tx) => {
      await repos.organizations.create(tx, { slug: seed.slug, name: seed.name });
      for (const m of seed.members) {
        const userId = userIds[m.email];
        if (userId === undefined) throw new Error(`no user for ${m.email}`);
        await repos.memberships.insert(tx, { userId, role: m.role });
      }
      const project = await repos.projects.insert(tx, { name: "Default", slug: "default" });
      const goal = await repos.goals.insert(tx, {
        projectId: project.id,
        title: "Answer the messages that need a reply",
        qualityTarget: defaultQualityTarget("standard"),
      });
      const set = await repos.questionSets.insert(tx, {
        projectId: project.id,
        goalId: goal.id,
        slug: "inbox-triage",
        name: "Inbox triage",
        labeling: DEFAULT_LABELING_POLICY,
      });
      const versionRow = {
        setId: set.id,
        spec: SEED_SPEC,
        specHash: "sha256:seed-v1",
        interfaceHash: "sha256:seed-interface",
        interfaceMajor: 1,
        model: SEED_SPEC.model,
        source: "console" as const,
      };
      const v1 = await repos.questionSetVersions.insert(tx, { ...versionRow, version: 1 });
      await repos.questionSetVersions.update(tx, v1.id, {
        status: "published",
        changelog: "Seed version",
        publishedAt: new Date(),
      });
      const v2 = await repos.questionSetVersions.insert(tx, { ...versionRow, version: 2, specHash: "sha256:seed-v2" });
      await repos.questionSets.update(tx, set.id, { draftVersionId: v2.id });
      await repos.releasePointers.insert(tx, {
        setId: set.id,
        channel: "production",
        versionId: v1.id,
        rolloutStage: "shadow",
      });
      const app = await repos.apps.insert(tx, { name: "Inbox", language: "ts" });
      await repos.auditLog.insert(tx, {
        actorType: "system",
        client: "job",
        action: "org.seed",
        targetType: "org",
        targetId: orgId,
        diff: { slug: seed.slug },
      });
      return {
        orgId,
        slug: seed.slug,
        userIds,
        projectId: project.id,
        goalId: goal.id,
        setId: set.id,
        setSlug: set.slug,
        publishedVersionId: v1.id,
        draftVersionId: v2.id,
        appId: app.id,
      };
    });
    out.push(seeded);
  }
  return out;
}
