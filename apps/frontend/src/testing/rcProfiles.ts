// Mappings and vehicles for the tests of the RC control: the suggested mapping, confirmed as a person would confirm it for the
// test pad, and what a vehicle says of its channels.
import { confirmed } from '@/lib/rc/confirm'
import { suggestedProfile } from '@/lib/rc/suggest'
import type { PadLayout, Profile, ThrottleStyle } from '@/lib/rc/types'
import { type Facts, factsOf } from '@/lib/rc/vehicle'

/** What each of CH1..CH16 of the test pad (a TX16S as the browser shows it: 8 axes, 24 buttons) is: 8 axes, then 8 buttons. */
export const TX16S_LAYOUT: PadLayout = [
  ...Array.from({ length: 8 }, () => 'axis' as const),
  ...Array.from({ length: 8 }, () => 'button' as const),
]

/**
 * The mapping offered for a device, confirmed for the test pad.
 *
 * @param device the device
 * @param style how the throttle rests (the tests of the gate and the guards fly with a stick that rests low)
 * @returns the mapping, confirmed
 */
export function confirmedSuggestion(device = 'pad', style: ThrottleStyle = 'low'): Profile {
  return confirmed({ ...suggestedProfile(device, null), throttleStyle: style }, TX16S_LAYOUT)
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
