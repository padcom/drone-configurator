// "Move it": which axis or button of the pad the person means, found by what they move or press after the baseline was read.
// Pure: it compares two reads.
import type { PadSample, Row } from './types'

/** How far (of -1 to 1 for an axis, 0 to 1 for a button) a control must move from the baseline to be the one meant. */
export const MOVED_BY = 0.5

/**
 * The first place where a list of values differs from its baseline by at least `MOVED_BY`.
 *
 * @param baseline the values when the capture began
 * @param now the values now
 * @returns the index, or null when none moved that far (a value the baseline did not have is compared with 0)
 */
function firstMoved(baseline: readonly number[], now: readonly number[]): number | null {
  const found = now.findIndex((value, index) => Math.abs(value - (baseline[index] ?? 0)) >= MOVED_BY)

  return found < 0 ? null : found
}

/**
 * What the person moved: an axis for a stick or a switch, a button for a button.
 *
 * @param kind the kind of the row that asks
 * @param baseline what the pad said when the capture began
 * @param now what it says now
 * @returns the index of the axis or button that moved, or null when nothing did (the first one that did, when several have)
 */
export function movedControl(kind: Row['kind'], baseline: PadSample, now: PadSample): number | null {
  return kind === 'button' ? firstMoved(baseline.buttons, now.buttons) : firstMoved(baseline.axes, now.axes)
}
