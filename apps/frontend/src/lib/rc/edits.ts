// Changing a mapping. EVERY change of a mapping (a row added, taken away or changed: its channel, its source, its inversion, its
// zone, its curve, its ends; the throttle style) makes it a mapping that was not confirmed (`confirmedKey: null`), so that what
// the person flew with is never a mapping they have not looked at and confirmed. (The key would not match anyway: this is the
// belt to its braces. The throttle gate is shut again by whoever holds it: `START_GATE`, on every change.)
import type { Profile, Row, ThrottleStyle } from './types'

/**
 * The mapping with other rows, and not confirmed.
 *
 * @param profile the mapping
 * @param rows its new rows
 * @returns the new mapping
 */
function edited(profile: Profile, rows: readonly Row[]): Profile {
  return { ...profile, rows, confirmedKey: null }
}

/**
 * Adds a row.
 *
 * @param profile the mapping
 * @param row the row
 * @returns the new mapping, not confirmed
 */
export function addRow(profile: Profile, row: Row): Profile {
  return edited(profile, [...profile.rows, row])
}

/**
 * Takes a row away.
 *
 * @param profile the mapping
 * @param index the row's place
 * @returns the new mapping, not confirmed
 */
export function removeRow(profile: Profile, index: number): Profile {
  return edited(profile, profile.rows.filter((_, place) => place !== index))
}

/**
 * Changes a row: what is given replaces what the row has.
 *
 * @param profile the mapping
 * @param index the row's place
 * @param change what changes
 * @returns the new mapping, not confirmed
 */
export function changeRow(profile: Profile, index: number, change: Partial<Row>): Profile {
  return edited(profile, profile.rows.map((row, place) => (place === index ? { ...row, ...change } : row)))
}

/**
 * Changes how the throttle stick rests.
 *
 * @param profile the mapping
 * @param throttleStyle the style
 * @returns the new mapping, not confirmed
 */
export function setThrottleStyle(profile: Profile, throttleStyle: ThrottleStyle): Profile {
  return { ...profile, throttleStyle, confirmedKey: null }
}
