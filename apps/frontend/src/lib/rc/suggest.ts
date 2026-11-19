// The mapping offered for a device that has none: the four sticks on the first four channels of the pad, on the channels the
// vehicle maps them to (`RCMAP_*`, or 1 to 4 when it did not say), with a centred throttle (the leader's stick). It is a starting
// point and nothing else: the order of a pad's channels is the radio's own (EdgeTX lets it be changed), so every row can be
// moved with "move it", and it is NOT confirmed: it drives nothing until the person has looked at it and pressed "Confirm this
// mapping". (The switches are left for the person: which channel is which switch is the radio's.)
import { ARM_FUNCTIONS, type Facts } from './vehicle'
import { DEFAULT_THROTTLE_STYLE, type Profile, type Row } from './types'

/** The dead zone a new stick has (of its travel). */
export const DEFAULT_DEAD_ZONE = 0.08

/**
 * A row on a pad channel, with the default zone for a stick (none for anything else) and no curve.
 *
 * @param channel the channel it drives
 * @param source the pad channel it reads, 1 to 16
 * @param stick whether it is one of the four sticks (they get the default dead zone)
 * @returns the row
 */
export function newRow(channel: number, source: number, stick = false): Row {
  return { channel, source, invert: false, deadZone: stick ? DEFAULT_DEAD_ZONE : 0, expo: 0 }
}

/**
 * The lowest channel after the sticks' that no row drives and that the vehicle does not use to arm or stop (the new row's).
 *
 * @param profile the mapping
 * @param facts what the vehicle says, or null
 * @returns the channel, 1 to 16, or null when there is none
 */
export function freeChannel(profile: Profile, facts: Facts | null): number | null {
  const driven = new Set(profile.rows.map(row => row.channel))
  const free = Array.from({ length: 16 }, (_, index) => index + 1)
    .filter(channel => !driven.has(channel) && !ARM_FUNCTIONS.includes(facts?.options[channel - 1] ?? 0))

  return free.find(channel => channel > 4) ?? free[0] ?? null
}

/**
 * The mapping offered for a device.
 *
 * @param device the gamepad's id
 * @param facts what the vehicle says of its channels, or null
 * @returns the mapping, not confirmed
 */
export function suggestedProfile(device: string, facts: Facts | null): Profile {
  const map = facts?.map ?? { roll: 1, pitch: 2, throttle: 3, yaw: 4 }

  return {
    device,
    throttleStyle: DEFAULT_THROTTLE_STYLE,
    confirmedKey: null,
    rows: [newRow(map.roll, 1, true), newRow(map.pitch, 2, true), newRow(map.throttle, 3, true), newRow(map.yaw, 4, true)],
  }
}
