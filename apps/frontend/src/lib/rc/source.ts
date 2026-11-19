// "Move it": which channel of the pad the person means, found by what they move after the baseline was read. Pure: it compares
// two reads. A button moves from -1 to 1, which is as far as a stick can go, so it is found like an axis.
import type { PadSample } from './types'

/** How far (of -1 to 1) a channel must move from the baseline to be the one meant. */
export const MOVED_BY = 0.5

/**
 * What the person moved.
 *
 * @param baseline what the pad said when the capture began
 * @param now what it says now
 * @returns the pad channel (1 to 16) that moved at least `MOVED_BY` (the first one, when several have), or null when none did; a
 * channel the pad does not have (null) never moves
 */
export function movedControl(baseline: PadSample, now: PadSample): number | null {
  const found = now.channels.findIndex((value, index) => {
    const before = baseline.channels[index] ?? null

    return value !== null && before !== null && Math.abs(value - before) >= MOVED_BY
  })

  return found < 0 ? null : found + 1
}
