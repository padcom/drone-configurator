// A profile's checks: what a mapping must be before it may drive a vehicle (the control is refused with a mapping that is not).
import { type AxisCalibration, CHANNELS, MAX_PULSE, MIN_PULSE, type Profile, type Row, type StickRow } from './types'

/** What is wrong with one row. */
export type Code = 'channel' | 'duplicate' | 'source' | 'zone' | 'expo' | 'calibration' | 'pulse' | 'uncalibrated'

/** What is wrong with a mapping. */
export interface Problem {
  /**
   * `channel` (not 1 to 16), `duplicate` (two rows for one channel), `source` (the row has no control yet), `zone`, `expo`,
   * `calibration`, `pulse`, or `uncalibrated`
   * (the person has not been through the calibration wizard with this mapping: it is the mapping's problem, not a row's).
   */
  code: Code
  /** The channel of the row (0 for a problem of the mapping). */
  channel: number
}

/**
 * Whether a pulse is one an override may carry.
 *
 * @param pulse the pulse
 * @returns true when it is whole and 800 to 2200 µs
 */
function fits(pulse: number): boolean {
  return Number.isInteger(pulse) && pulse >= MIN_PULSE && pulse <= MAX_PULSE
}

/**
 * Whether a number is within limits (a number that is not a number is not).
 *
 * @param value the number
 * @param least the least it may be
 * @param most the most it may be
 * @returns true when it is
 */
function between(value: number, least: number, most: number): boolean {
  return value >= least && value <= most
}

/**
 * Whether the ends of an axis are apart from its middle.
 *
 * @param c what the axis said at its ends and at rest
 * @returns true when it can be scaled
 */
function calibrated(c: AxisCalibration): boolean {
  return [c.min, c.center, c.max].every(Number.isFinite) && c.min < c.center && c.center < c.max
}

/**
 * What is wrong with the settings of a stick (its zone, curve and calibration), or nothing.
 *
 * @param row the stick
 * @returns the code, or null
 */
function stickProblem(row: StickRow): Code | null {
  if (!between(row.deadZone, 0, 0.5)) {
    return 'zone'
  }
  if (!between(row.expo, 0, 1)) {
    return 'expo'
  }

  return calibrated(row.calibration) ? null : 'calibration'
}

/**
 * Whether a row has a control to read: a whole, non-negative axis or button (`NO_SOURCE` is neither).
 *
 * @param row the row
 * @returns true when it has
 */
export function hasSource(row: Row): boolean {
  const index = row.kind === 'button' ? row.button : row.axis

  return Number.isInteger(index) && index >= 0
}

/**
 * What is wrong with the settings of a row that has a control (a stick's zone, curve and calibration, a switch's or a button's
 * pulses).
 *
 * @param row the row
 * @returns the code, or null
 */
function settingsProblem(row: Row): Code | null {
  if (row.kind === 'stick') {
    return stickProblem(row)
  }
  const pulses = row.kind === 'switch' ? row.pulses : [row.off, row.on]

  return pulses.every(fits) ? null : 'pulse'
}

/**
 * What is wrong with a row itself (not with which channel it drives), or nothing.
 *
 * @param row the row
 * @returns the code, or null
 */
function rowProblem(row: Row): Code | null {
  return hasSource(row) ? settingsProblem(row) : 'source'
}

/**
 * What is wrong with the channel a row drives, or nothing.
 *
 * @param channel the channel
 * @param seen the channels the rows before drive
 * @returns the code, or null
 */
function channelProblem(channel: number, seen: ReadonlySet<number>): Code | null {
  if (!Number.isInteger(channel) || !between(channel, 1, CHANNELS)) {
    return 'channel'
  }

  return seen.has(channel) ? 'duplicate' : null
}

/**
 * The problem of a mapping that the calibration wizard has not been through.
 *
 * @param profile the mapping
 * @returns the problem, or none
 */
function uncalibrated(profile: Profile): Problem[] {
  return profile.calibrated ? [] : [{ code: 'uncalibrated', channel: 0 }]
}

/**
 * What is wrong with a mapping.
 *
 * @param profile the mapping
 * @returns the problems, none for one that may drive a vehicle
 */
export function problemsOf(profile: Profile): Problem[] {
  const seen = new Set<number>()
  const problems: Problem[] = uncalibrated(profile)
  for (const row of profile.rows) {
    const code = channelProblem(row.channel, seen) ?? rowProblem(row)

    seen.add(row.channel)

    if (code !== null) {
      problems.push({ code, channel: row.channel })
    }
  }

  return problems
}
