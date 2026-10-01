import type { PointerChannel, RolloutStage } from "@bandwise/core";

import { RolloutBadge } from "~/components/ui";

export interface ChannelSummary {
  channel: PointerChannel;
  version: number;
  stage: RolloutStage;
}

const CHANNELS: readonly PointerChannel[] = ["production", "staging"];
const LABEL: Record<PointerChannel, string> = { production: "Production", staging: "Staging" };

/** One channel: its version and rollout stage, or that nothing is published there. */
export function ChannelStage({ channel, pointer }: { channel: PointerChannel; pointer: ChannelSummary | undefined }) {
  if (pointer === undefined) return <span className="text-sm text-bw-text-muted">Not published</span>;
  return (
    <span className="inline-flex items-center gap-2">
      <span className="font-mono text-sm tabular-nums text-bw-text" aria-label={`${LABEL[channel]} serves version ${pointer.version}`}>
        v{pointer.version}
      </span>
      <RolloutBadge stage={pointer.stage} />
    </span>
  );
}

/** Both channels in a row, labelled: where a set stands in rollout at a glance. */
export function ChannelStages({ channels }: { channels: readonly ChannelSummary[] }) {
  return (
    <dl className="flex flex-wrap gap-x-6 gap-y-2">
      {CHANNELS.map((c) => (
        <div key={c} className="flex items-center gap-2">
          <dt className="bw-label">{LABEL[c]}</dt>
          <dd>
            <ChannelStage channel={c} pointer={channels.find((p) => p.channel === c)} />
          </dd>
        </div>
      ))}
    </dl>
  );
}
