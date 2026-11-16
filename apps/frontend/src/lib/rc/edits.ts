// Changing a mapping. EVERY change of a mapping (a row added, taken away or changed: its channel, its source, its inversion, its
// zone, its curve, its pulses) makes it a mapping the calibration wizard has not been through (`calibrated: false`), so that
// what the person flew with is never a mapping they have not calibrated. Only `calibrated()` (the wizard's end) gives the mark
// back, and it is the only function here that does. (The throttle gate is shut again by whoever holds it: `START_GATE`, on
// every change.)
import type { AxisCalibration, Profile, Row, StickRow } from './types'

/**
 * The mapping with other rows, and not calibrated.
 *
 * @param profile the mapping
 * @param rows its new rows
 * @returns the new mapping
 */
function edited(profile: Profile, rows: readonly Row[]): Profile {
  return { ...profile, rows, calibrated: false }
}

/**
 * Adds a row.
 *
 * @param profile the mapping
 * @param row the row
 * @returns the new mapping, not calibrated
 */
export function addRow(profile: Profile, row: Row): Profile {
  return edited(profile, [...profile.rows, row])
}

/**
 * Takes a row away.
 *
 * @param profile the mapping
 * @param index the row's place
 * @returns the new mapping, not calibrated
 */
export function removeRow(profile: Profile, index: number): Profile {
  return edited(profile, profile.rows.filter((_, place) => place !== index))
}

/**
 * Changes a row: what is given replaces what the row has (the kind of a row is not changed this way: take it away and add
 * another).
 *
 * @param profile the mapping
 * @param index the row's place
 * @param change what changes
 * @returns the new mapping, not calibrated
 */
export function changeRow(profile: Profile, index: number, change: Partial<StickRow> | Partial<Row>): Profile {
  return edited(profile, profile.rows.map((row, place) => (place === index ? { ...row, ...change, kind: row.kind } as Row : row)))
}

/**
 * A stick with the calibration the wizard measured for its axis, when it measured one.
 *
 * @param row the row
 * @param calibrations what the wizard measured for each axis
 * @returns the row
 */
function measured(row: Row, calibrations: ReadonlyMap<number, AxisCalibration>): Row {
  const calibration = row.kind === 'stick' ? calibrations.get(row.axis) : undefined

  return row.kind === 'stick' && calibration !== undefined ? { ...row, calibration } : row
}

/**
 * Gives a mapping the mark of the wizard: the calibrations it measured are in the rows, and the person has been through it.
 * Nothing else does.
 *
 * @param profile the mapping
 * @param calibrations what the wizard measured for each axis
 * @returns the mapping, calibrated
 */
export function calibrated(profile: Profile, calibrations: ReadonlyMap<number, AxisCalibration>): Profile {
  return { ...profile, rows: profile.rows.map(row => measured(row, calibrations)), calibrated: true }
}
