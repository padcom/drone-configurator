// "Confirm this mapping": the one click that replaces the calibration wizard (plan `drone-configurator-joystick-backend.md`,
// section 10.1). The person looks at the mapping, with the live bars of the control channels beside it, and presses it once. What
// is kept is not a flag but the KEY of what was looked at: the device, the rows, the throttle style and the layout of the pad's
// channels. Any edit of a row, another device, another style or another layout makes another key, so the mapping is no longer
// the one that was confirmed. Nothing but `confirmed()` gives the mark, and it never does for a default, a suggestion or a
// migration of a mapping that changed.
import type { PadLayout, Profile } from './types'

/**
 * The layout of a pad's channels as text: an `a` for each axis, a `b` for each button and a `-` for each channel it has not.
 *
 * @param layout what each of CH1..CH16 of the pad is
 * @returns 16 characters
 */
export function layoutKey(layout: PadLayout): string {
  const letters: Record<string, string> = { axis: 'a', button: 'b' }

  return Array.from({ length: 16 }, (_, index) => letters[layout[index] ?? ''] ?? '-').join('')
}

/**
 * A short text of a longer one (FNV-1a, 32 bits): it only has to tell one mapping from another, not to hide anything.
 *
 * @param text the text
 * @returns 8 hexadecimal digits
 */
function hashOf(text: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < text.length; index += 1) {
    hash = Math.imul(hash ^ text.charCodeAt(index), 0x01000193) >>> 0
  }

  return hash.toString(16).padStart(8, '0')
}

/**
 * The key of a mapping with a pad layout.
 *
 * @param profile the mapping
 * @param layout which of CH1..CH16 the pad has
 * @returns the key
 */
export function keyOf(profile: Profile, layout: PadLayout): string {
  return hashOf(JSON.stringify([profile.device, profile.throttleStyle, profile.rows, layoutKey(layout)]))
}

/**
 * Whether a mapping is confirmed for the pad it is flown with.
 *
 * @param profile the mapping
 * @param layout which of CH1..CH16 the pad has now, or null when the pad is not read (nothing is confirmed then)
 * @returns true when its key is the one that was confirmed
 */
export function isConfirmed(profile: Profile, layout: PadLayout | null): boolean {
  return layout !== null && profile.confirmedKey !== null && profile.confirmedKey === keyOf(profile, layout)
}

/**
 * The mapping, confirmed as it is for this pad: the person pressed "Confirm this mapping" while looking at it.
 *
 * @param profile the mapping
 * @param layout which of CH1..CH16 the pad has now
 * @returns the mapping with the key of what was confirmed
 */
export function confirmed(profile: Profile, layout: PadLayout): Profile {
  return { ...profile, confirmedKey: keyOf(profile, layout) }
}
