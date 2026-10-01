import { ConfidenceRuler } from "~/components/ui";

import type { BandSegment } from "./spec-edit";

/**
 * Which band each value from 0 to 1 lands in under the current sliders, drawn with core's own
 * band rule from this policy's thresholds. `marker` is where the last preview's answer sits.
 */
export function BandBar({ segments, axis, marker }: { segments: readonly BandSegment[]; axis: string; marker?: number | null }) {
  return <ConfidenceRuler segments={segments} axis={axis} marker={marker ?? null} markerLabel="Last preview answer" />;
}
