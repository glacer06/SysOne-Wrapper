// The Releases panel of a set: each channel's version and rollout stage with stage, rollback and
// pause controls, publishing the draft, and the version history with diffs. Every read and every
// change is an operation call as the signed-in member, the same ones the CLI makes.

import type { PointerChannel, RolloutStage } from "@bandwise/core";

import { OperationFailed } from "~/components/shell/operation-failed";
import { Card } from "~/components/ui";
import { requireConsole } from "~/server/auth/console";
import { consoleOperation } from "~/server/console-operation";

import { type ChannelRow, Channels } from "./channels";
import { VersionHistory, type VersionRow } from "./history";
import { PublishDraft } from "./publish";

export interface ReleasesSet {
  slug: string;
  draft: { version: number; etag: string } | null;
  channels: { channel: PointerChannel; version: number; stage: RolloutStage; updatedAt: string }[];
}

interface VersionOut {
  version: number;
  publishedAt: string | null;
  publishedBy: { tokenId: string | null };
  model: string;
  changelog: string | null;
  interfaceMajor: number;
}

const EDIT_ROLES = new Set(["owner", "admin", "editor"]);

/** `set` is the set.get output the page already read for its header. */
export async function ReleasesPanel({ setRef, set: s }: { setRef: string; set: ReleasesSet }) {
  const { ctx } = await requireConsole();
  const versions = await consoleOperation("version.list", { ref: setRef, limit: 50 });

  const channels: ChannelRow[] = await Promise.all(
    s.channels.map(async (c) => {
      const rollout = await consoleOperation("rollout.get", { ref: setRef, channel: c.channel });
      const warnings = rollout.status === "ok" ? (rollout.output as { warnings: string[] }).warnings : [];
      return { ...c, warnings };
    }),
  );
  const rows: VersionRow[] =
    versions.status === "ok"
      ? (versions.output as { data: VersionOut[] }).data.map((v) => ({
          version: v.version,
          publishedAt: v.publishedAt,
          byAgent: v.publishedBy.tokenId !== null,
          model: v.model,
          changelog: v.changelog,
          interfaceMajor: v.interfaceMajor,
        }))
      : [];
  const canEdit = EDIT_ROLES.has(ctx.actor.role);
  const stages = Object.fromEntries(s.channels.map((c) => [c.channel, c.stage])) as Partial<Record<PointerChannel, RolloutStage>>;

  return (
    <div className="flex flex-col gap-6">
      <Card
        title="Channels"
        description="What each channel serves and its rollout stage. Rollback and pause take effect on the next run and never wait for an approval."
      >
        {channels.length === 0 ? (
          <p className="text-sm text-bw-text-muted">No channel serves this set yet. Publish the draft below to start production at Shadow.</p>
        ) : (
          <Channels setRef={setRef} channels={channels} canEdit={canEdit} />
        )}
        {canEdit ? null : <p className="mt-3 text-xs text-bw-text-muted">Your role can view releases. Editors and above publish, roll back and change stages.</p>}
      </Card>

      {canEdit && s.draft !== null ? (
        <Card title={`Publish draft v${s.draft.version}`}>
          <PublishDraft setRef={setRef} draft={s.draft} stages={stages} />
        </Card>
      ) : null}

      <Card title="Version history" description="Published versions never change. Pick any two, or the draft, to see what differs.">
        {versions.status === "error" ? (
          <OperationFailed message={versions.message} />
        ) : (
          <VersionHistory
            setRef={setRef}
            versions={rows}
            serving={s.channels.map((c) => ({ channel: c.channel, version: c.version }))}
            hasDraft={s.draft !== null}
          />
        )}
      </Card>
    </div>
  );
}
