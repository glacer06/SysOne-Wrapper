import type { PointerChannel, RolloutStage } from "@bandwise/core";

import { SetTabs } from "~/components/shell/set-tabs";
import { PageHeader } from "~/components/ui";

import { ChannelStages } from "./channel-stages";

export interface SetHeaderSet {
  name: string;
  slug: string;
  description: string | null;
  draft: { version: number } | null;
  channels: readonly { channel: PointerChannel; version: number; stage: RolloutStage }[];
}

/** The top of every page about one set: where it stands per channel, then its views. */
export function SetHeader({ set }: { set: SetHeaderSet }) {
  return (
    <>
      <PageHeader
        crumbs={[{ href: "/sets", label: "Sets" }]}
        title={set.name}
        description={
          <>
            <span className="font-mono">{set.slug}</span>
            {set.draft === null ? "" : `, draft v${set.draft.version}`}
            {set.description === null ? null : <span className="mt-1 block">{set.description}</span>}
          </>
        }
      />
      <div className="mb-4 rounded-md border border-rule bg-paper-raised px-5 py-3">
        <ChannelStages channels={set.channels} />
      </div>
      <SetTabs slug={set.slug} />
    </>
  );
}
