// Bootstrap of the `internal` org for hosted dogfood (ADR-020, D2e). A platform operator runs
// `pnpm --filter @bandwise/console bootstrap-internal` once against the production database. It
// creates the org in platform key mode with its members, a project, a goal and the app the hook
// tokens belong to, then imports each `.bandwise/sets/*.json` spec as a set, published as version 1
// on production at shadow, with an open draft version 2, the way set.publish leaves a set.
//
// Running it again changes nothing: every row is looked up first, and a set that already exists is
// never touched, even when its file changed since. Spec changes go through `bandwise spec push` and
// `bandwise publish`. Every write has its audit row, in one transaction with the rows it describes.

import {
  DEFAULT_LABELING_POLICY,
  defaultQualityTarget,
  hasLintErrors,
  hashJson,
  interfaceHash,
  interfaceOf,
  lint,
  QuestionSetSpec,
  type Role,
  SEED_MODEL_PROFILES,
  type TenantContext,
} from "@bandwise/core";
import { authRepositories, type BandwiseDb, repos, type TenantTx } from "@bandwise/db";

export const INTERNAL_ORG_SLUG = "internal";
export const DOGFOOD_PROJECT_SLUG = "dogfood";
export const DOGFOOD_GOAL_TITLE = "Keep Claude Code sessions on this repo honest, safe and cheap";
export const DOGFOOD_APP_NAME = "Claude Code hooks";

/** Set slugs follow set.create: 1 to 64 lower case letters, digits, dashes or underscores. */
const SLUG = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface BootstrapMember {
  email: string;
  role: Role;
}

export interface BootstrapSpecFile {
  /** The file name without `.json`. Becomes the set slug. */
  slug: string;
  /** The parsed JSON of the file. Validated here. */
  json: unknown;
}

export interface BootstrapInput {
  /** The first member is the owner and must have role owner. */
  members: BootstrapMember[];
  specs: BootstrapSpecFile[];
  now: Date;
  newId?: () => string;
}

/** created: written now. exists: same spec as production. differs: the file changed since, nothing written. */
export type SetOutcome = "created" | "exists" | "differs";

export interface BootstrapResult {
  orgId: string;
  orgCreated: boolean;
  members: { userId: string; role: Role; outcome: "created" | "exists" }[];
  projectId: string;
  goalId: string;
  appId: string;
  /** versionId is the production version, null when the set has none. */
  sets: { slug: string; setId: string; versionId: string | null; outcome: SetOutcome }[];
}

export class BootstrapError extends Error {
  override name = "BootstrapError";
}

/** question_set_versions.spec_hash, the same value set.publish and draft.update write. */
export function specHash(spec: QuestionSetSpec): string {
  return `sha256:${hashJson(spec)}`;
}

const AUDIT_SOURCE = "bootstrap-internal";

function platformContext(orgId: string): TenantContext {
  return { orgId, actor: { type: "system" }, client: "job", plan: "internal", requestId: AUDIT_SOURCE };
}

async function audit(tx: TenantTx, action: string, targetType: string, targetId: string, diff: Record<string, unknown>) {
  await repos.auditLog.insert(tx, { actorType: "system", client: "job", action, targetType, targetId, diff: { ...diff, source: AUDIT_SOURCE } });
}

/** Parse and lint every spec before anything is written, so a bad file leaves the database as it was. */
function checkSpecs(files: BootstrapSpecFile[]): { slug: string; spec: QuestionSetSpec }[] {
  const seen = new Set<string>();
  return files.map(({ slug, json }) => {
    if (!SLUG.test(slug)) throw new BootstrapError(`${slug}.json: the file name is not a valid set slug.`);
    if (seen.has(slug)) throw new BootstrapError(`${slug}: two files give the same slug.`);
    seen.add(slug);
    const parsed = QuestionSetSpec.safeParse(json);
    if (!parsed.success) {
      const paths = parsed.error.issues.slice(0, 5).map((i) => `/${i.path.join("/")}`);
      throw new BootstrapError(`${slug}.json does not validate as a QuestionSetSpec at ${paths.join(", ")}.`);
    }
    const profile = SEED_MODEL_PROFILES.find((p) => p.id === parsed.data.model) ?? null;
    const findings = lint(parsed.data, profile);
    if (hasLintErrors(findings)) {
      const rules = [...new Set(findings.filter((f) => f.severity === "error").map((f) => f.rule))];
      throw new BootstrapError(`${slug}.json has lint errors: ${rules.join(", ")}. Run bandwise run --local on it first.`);
    }
    return { slug, spec: parsed.data };
  });
}

function checkMembers(members: BootstrapMember[]): void {
  if (members[0]?.role !== "owner") throw new BootstrapError("The first member is the org owner and needs role owner.");
  const emails = new Set<string>();
  for (const m of members) {
    if (!EMAIL.test(m.email)) throw new BootstrapError("A member email is not an email address.");
    const key = m.email.toLowerCase();
    if (emails.has(key)) throw new BootstrapError("A member is listed twice.");
    emails.add(key);
  }
}

export async function bootstrapInternalOrg(db: BandwiseDb, input: BootstrapInput): Promise<BootstrapResult> {
  checkMembers(input.members);
  const specs = checkSpecs(input.specs);
  const newId = input.newId ?? (() => crypto.randomUUID());

  // Organizations are tenant rows, so the lookup goes through the owner's memberships, never a
  // scan. An owner with no user row yet cannot be in any org.
  const ownerEmail = input.members[0]?.email ?? "";
  const ownerRow = await db.withNoTenant((tx) => authRepositories.users.getByEmail(tx, ownerEmail));
  const existingOrg =
    ownerRow === null
      ? undefined
      : (await db.withUser(ownerRow.id, (tx) => authRepositories.myOrganizations(tx))).find((o) => o.slug === INTERNAL_ORG_SLUG);
  const orgId = existingOrg?.id ?? newId();

  // Everything below is one transaction, users included: a failure anywhere writes nothing.
  try {
    return await db.withTenant(platformContext(orgId), async (tx) => {
      if (existingOrg === undefined) {
        await repos.organizations.create(tx, { slug: INTERNAL_ORG_SLUG, name: "Internal", keyMode: "platform" });
        await repos.billingAccounts.insert(tx, { plan: "internal", status: "active" });
        await audit(tx, "org.create", "org", orgId, { slug: INTERNAL_ORG_SLUG, keyMode: "platform", plan: "internal" });
      }

      const members: BootstrapResult["members"] = [];
      for (const m of input.members) {
        // Users are global rows (ADR-002). One is reused by email, so a person who signed in first keeps theirs.
        const found = await authRepositories.users.getByEmail(tx, m.email);
        const userId = found?.id ?? (await authRepositories.users.insert(tx, { email: m.email, name: m.email.split("@")[0] ?? m.email, emailVerified: false })).id;
        const membership = found === null ? null : await repos.memberships.getByUser(tx, userId);
        if (membership !== null) {
          // An existing role is kept. Role changes are member.role_change, by a person.
          members.push({ userId, role: membership.role, outcome: "exists" });
          continue;
        }
        const row = await repos.memberships.insert(tx, { userId, role: m.role });
        await audit(tx, "member.add", "membership", row.id, { userId, role: m.role, userCreated: found === null });
        members.push({ userId, role: m.role, outcome: "created" });
      }

      let project = await repos.projects.getBySlug(tx, DOGFOOD_PROJECT_SLUG);
      if (project === null) {
        project = await repos.projects.insert(tx, { name: "Dogfood", slug: DOGFOOD_PROJECT_SLUG });
        await audit(tx, "project.create", "project", project.id, { slug: DOGFOOD_PROJECT_SLUG });
      }
      const projectId = project.id;

      let goal = (await repos.goals.findMany(tx, undefined)).find((g) => g.projectId === projectId && g.title === DOGFOOD_GOAL_TITLE);
      if (goal === undefined) {
        goal = await repos.goals.insert(tx, { projectId, title: DOGFOOD_GOAL_TITLE, qualityTarget: defaultQualityTarget("standard") });
        await audit(tx, "goal.create", "goal", goal.id, { projectId, title: DOGFOOD_GOAL_TITLE, tier: "standard" });
      }
      const goalId = goal.id;

      let app = (await repos.apps.findMany(tx, undefined)).find((a) => a.name === DOGFOOD_APP_NAME);
      if (app === undefined) {
        app = await repos.apps.insert(tx, { name: DOGFOOD_APP_NAME, language: "ts", description: "Claude Code hooks on this repo (.claude/settings.json)." });
        await audit(tx, "app.create", "app", app.id, { name: DOGFOOD_APP_NAME });
      }

      const sets: BootstrapResult["sets"] = [];
      for (const { slug, spec } of specs) sets.push(await importSet(tx, { slug, spec, projectId, goalId, now: input.now }));

      return { orgId, orgCreated: existingOrg === undefined, members, projectId, goalId, appId: app.id, sets };
    });
  } catch (e) {
    // The slug is unique across orgs. Seen here when an `internal` org exists without this owner.
    if (existingOrg === undefined && e instanceof Error && /organizations_slug_key/.test(`${e.message} ${String((e as { cause?: unknown }).cause)}`)) {
      throw new BootstrapError(`An org with slug ${INTERNAL_ORG_SLUG} exists and the owner is not a member of it. Nothing was written.`);
    }
    throw e;
  }
}

async function importSet(
  tx: TenantTx,
  input: { slug: string; spec: QuestionSetSpec; projectId: string; goalId: string; now: Date },
): Promise<BootstrapResult["sets"][number]> {
  const { slug, spec } = input;
  const hash = specHash(spec);
  const existing = await repos.questionSets.getBySlug(tx, slug);
  if (existing !== null) {
    const pointer = await repos.releasePointers.get(tx, existing.id, "production");
    const live = pointer === null ? null : await repos.questionSetVersions.get(tx, pointer.versionId);
    return { slug, setId: existing.id, versionId: live?.id ?? null, outcome: live?.specHash === hash ? "exists" : "differs" };
  }

  const set = await repos.questionSets.insert(tx, {
    projectId: input.projectId,
    goalId: input.goalId,
    slug,
    name: slug,
    labeling: DEFAULT_LABELING_POLICY,
  });
  await audit(tx, "set.create", "question_set", set.id, { slug, goalId: input.goalId });

  const versionRow = {
    setId: set.id,
    spec,
    specHash: hash,
    interfaceHash: interfaceHash(interfaceOf(spec)),
    interfaceMajor: 1,
    model: spec.model,
    source: "cli" as const,
    sourceRef: `.bandwise/sets/${slug}.json`,
  };
  const v1 = await repos.questionSetVersions.insert(tx, { ...versionRow, version: 1 });
  await repos.questionSetVersions.update(tx, v1.id, { status: "published", changelog: "Imported from .bandwise/sets", publishedAt: input.now });
  const v2 = await repos.questionSetVersions.insert(tx, { ...versionRow, version: 2 });
  await repos.questionSets.update(tx, set.id, { draftVersionId: v2.id });
  await repos.releasePointers.insert(tx, { setId: set.id, channel: "production", versionId: v1.id, rolloutStage: "shadow" });
  await repos.releaseEvents.insert(tx, {
    setId: set.id,
    channel: "production",
    fromVersionId: null,
    toVersionId: v1.id,
    kind: "publish",
    fromStage: null,
    toStage: "shadow",
    reason: "Imported from .bandwise/sets",
  });
  await audit(tx, "set.publish", "question_set_version", v1.id, { setId: set.id, slug, channel: "production", version: 1, fromVersion: null, stage: "shadow" });
  return { slug, setId: set.id, versionId: v1.id, outcome: "created" };
}
