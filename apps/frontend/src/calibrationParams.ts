// Which parameters are calibration values (compass, accelerometer, radio, trim), so that the question of a write that has some of
// them says so: a reset to the initial values puts back what a calibration made since the download, and the user should see that
// it does. It only adds a sentence to the question: nothing is excluded and nothing is decided by it. One list, here.

/** What the question says when a write has calibration values in it. */
export const CALIBRATION_NOTE = 'Includes calibration values'

/** The names of calibration values (ArduPilot Copter's): compass offsets, diagonals and the like, accelerometer, trim, radio. */
const CALIBRATION: readonly RegExp[] = [
  /^COMPASS_(?:OFS|DIA|ODI|MOT|SCALE|ORIENT|DEV_ID)\d?(?:_|$)/u,
  /^INS_ACC\d?(?:OFFS|SCAL)_[XYZ]$/u,
  /^INS_ACC\d?_ID$/u,
  /^AHRS_TRIM_[XYZ]$/u,
  /^RC\d+_(?:MIN|MAX|TRIM)$/u,
]

/**
 * Whether a parameter is a calibration value.
 *
 * @param id the parameter's name
 * @returns true for the names of the list above
 */
export function isCalibration(id: string): boolean {
  return CALIBRATION.some(pattern => pattern.test(id))
}

/**
 * Whether a parameter is one of the counters and learned values that the vehicle keeps by itself (flight time, boots): they
 * change without anybody having set them, and a bulk reset leaves them alone (one by one, they can still be reset).
 *
 * @param id the parameter's name
 * @returns true for STAT_*
 */
export function isCounter(id: string): boolean {
  return id.startsWith('STAT_')
}

/**
 * Whether a bulk reset leaves a parameter alone: the bookkeeping of the vehicle, which it keeps by itself and which an old value
 * would damage: its counters (STAT_*), the counts of stored items (MIS_TOTAL, FENCE_TOTAL, RALLY_TOTAL: put back to 0 after a
 * mission was uploaded they would cut it off), the number of the last log (LOG_LASTFILE), and what the loaded metadata marks as
 * read-only or volatile. They can still be reset one by one from the detail.
 *
 * @param id the parameter's name
 * @param meta what the metadata says about it, if it is loaded
 * @param meta.readOnly the vehicle sets it
 * @param meta.volatile it changes on its own
 * @returns true for what the bulk reset skips
 */
export function isBookkeeping(id: string, meta?: { readOnly?: boolean, volatile?: boolean }): boolean {
  const reasons = [isCounter(id), id.endsWith('_TOTAL'), id === 'LOG_LASTFILE', meta?.readOnly, meta?.volatile]

  return reasons.some(Boolean)
}
