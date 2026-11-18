// "The reading looks wrong" while the control is on (plan `drone-configurator-joystick-backend.md`, section 10.1 item 3): if
// one of the vehicle's four sticks loses its row, its pad channel stops being an axis or says nothing, or its raw reading is
// not a number or is past `FAULT_LEVEL`, the control releases every channel (reason `PAD_FAULT`). A reading a little past 1 is
// the pad's own noise; beyond `FAULT_LEVEL` is a pad that is broken.
import type { Sticks } from './rest'
import type { PadLayout, PadSample, Profile, Row } from './types'

/** How far past 1 a raw reading of a stick may be before the pad is taken for broken. */
export const FAULT_LEVEL = 1.05

/**
 * The row that drives a stick, when the pad channel it reads is an axis.
 *
 * @param profile the mapping
 * @param layout what each channel of the pad is, or null while the pad is not read
 * @param channel the vehicle's channel of the stick
 * @returns the row, or null when there is none or its pad channel is not an axis
 */
function axisRow(profile: Profile, layout: PadLayout | null, channel: number): Row | null {
  const row = profile.rows.find(candidate => candidate.channel === channel)

  return row !== undefined && layout?.[row.source - 1] === 'axis' ? row : null
}

/**
 * Whether a raw reading is one a stick may give.
 *
 * @param raw what the pad said
 * @returns true for a finite number no further than the limit from the middle
 */
function sane(raw: number | null | undefined): boolean {
  return typeof raw === 'number' && Number.isFinite(raw) && Math.abs(raw) <= FAULT_LEVEL
}

/**
 * Whether any of the four sticks has a faulty reading: the control must let go of everything.
 *
 * @param profile the mapping that is flown with
 * @param layout what each channel of the pad is, or null while the pad is not read
 * @param sample what the pad said
 * @param sticks the channels of the vehicle's four sticks
 * @returns true when one does (no row, a pad channel that is not an axis, no reading, or one beyond ±1.05)
 */
export function padFault(profile: Profile, layout: PadLayout | null, sample: PadSample, sticks: Sticks): boolean {
  return Object.values(sticks).some(channel => {
    const row = axisRow(profile, layout, channel)

    return row === null || !sane(sample.channels[row.source - 1])
  })
}
