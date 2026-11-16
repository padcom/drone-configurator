// The mapping offered for a device that has none: the four sticks on the first four axes, on the channels the vehicle maps
// them to (`RCMAP_*`, or 1 to 4 when it did not say). It is a starting point and nothing else: the axis order is the radio's
// own (EdgeTX lets it be changed), so every row can be moved with "move it", and it is NOT calibrated: it drives nothing until
// the wizard has been through it. (The switches are left for the person: which axis is which switch is the radio's.)
import type { Facts } from './vehicle'
import type { Profile, StickRow } from './types'
import { DEFAULT_CALIBRATION } from './types'

/** The dead zone a new stick has (of its travel). */
export const DEFAULT_DEAD_ZONE = 0.08

/**
 * A stick on an axis, uncalibrated, with the default zone and no curve.
 *
 * @param channel the channel it drives
 * @param axis the axis it is read from
 * @returns the row
 */
export function newStick(channel: number, axis: number): StickRow {
  const calibration = { ...DEFAULT_CALIBRATION }

  return { kind: 'stick', channel, axis, invert: false, calibration, deadZone: DEFAULT_DEAD_ZONE, expo: 0 }
}

/**
 * The mapping offered for a device.
 *
 * @param device the gamepad's id
 * @param facts what the vehicle says of its channels, or null
 * @returns the mapping, not calibrated
 */
export function suggestedProfile(device: string, facts: Facts | null): Profile {
  const map = facts?.map ?? { roll: 1, pitch: 2, throttle: 3, yaw: 4 }

  return {
    device,
    calibrated: false,
    rows: [newStick(map.roll, 0), newStick(map.pitch, 1), newStick(map.throttle, 2), newStick(map.yaw, 3)],
  }
}
