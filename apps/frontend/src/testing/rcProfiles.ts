// Mappings and vehicles for the tests of the RC control: the suggested mapping, calibrated as the wizard would calibrate it, and
// what a vehicle says of its channels.
import { calibrated } from '@/lib/rc/edits'
import { suggestedProfile } from '@/lib/rc/suggest'
import type { AxisCalibration, Profile } from '@/lib/rc/types'
import { type Facts, factsOf } from '@/lib/rc/vehicle'

/** What every axis of the test pad calibrates to. */
export const CALIBRATION: AxisCalibration = { min: -1, center: 0, max: 1 }

/**
 * The mapping offered for a device, calibrated: every axis it uses measured.
 *
 * @param device the device
 * @returns the mapping, calibrated
 */
export function calibratedSuggestion(device = 'pad'): Profile {
  const base = suggestedProfile(device, null)
  const measured = new Map(base.rows.map(row => [row.kind === 'stick' ? row.axis : -1, CALIBRATION]))

  return calibrated(base, measured)!
}

/**
 * What a vehicle says of its channels: sticks on 1 to 4, a range of 1100 to 1900 µs, no dead zone, and the functions given.
 *
 * @param options the `RCn_OPTION` of the channels that have one (the others have none)
 * @returns the facts
 */
export function vehicleFacts(options: Record<number, number> = {}): Facts {
  const sticks = ['ROLL', 'PITCH', 'THROTTLE', 'YAW']
  const params = sticks.map((name, index) => ({ id: `RCMAP_${name}`, value: index + 1 }))

  for (let channel = 1; channel <= 16; channel += 1) {
    params.push(
      { id: `RC${channel}_OPTION`, value: options[channel] ?? 0 },
      { id: `RC${channel}_DZ`, value: 0 },
      { id: `RC${channel}_MIN`, value: 1100 },
      { id: `RC${channel}_TRIM`, value: 1500 },
      { id: `RC${channel}_MAX`, value: 1900 },
    )
  }

  return factsOf(params, true)!
}
