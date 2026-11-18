// A profile's checks: what a mapping must be before it may drive a vehicle (the control is refused with a mapping that is not).
import { isConfirmed } from './confirm'
import { CHANNELS, MAX_PULSE, MIN_PULSE, NO_SOURCE, type PadLayout, type Profile, type Row } from './types'

/** What is wrong with one row. */
export type Code = 'channel' | 'duplicate' | 'source' | 'absent' | 'zone' | 'expo' | 'pulse' | 'unconfirmed'

/** What is wrong with a mapping. */
export interface Problem {
  /**
   * `channel` (not 1 to 16), `duplicate` (two rows for one channel), `source` (the row has no pad channel yet), `absent` (the
   * pad has no such channel), `zone`, `expo`, `pulse`, or `unconfirmed` (the person has not pressed "Confirm this mapping" for
   * this mapping with this pad: it is the mapping's problem, not a row's).
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
 * Whether a row has a pad channel to read: a whole number from 1 to 16 (`NO_SOURCE` is not).
 *
 * @param row the row
 * @returns true when it has
 */
export function hasSource(row: Row): boolean {
  return Number.isInteger(row.source) && row.source !== NO_SOURCE && between(row.source, 1, CHANNELS)
}

/**
 * What is wrong with the settings of a row that has a source: its zone, curve and ends.
 *
 * @param row the row
 * @returns the code, or null
 */
function settingsProblem(row: Row): Code | null {
  if (!between(row.deadZone, 0, 0.5)) {
    return 'zone'
  }
  if (!between(row.expo, 0, 1)) {
    return 'expo'
  }
  const ends = [row.pulseMin, row.pulseMax].filter((pulse): pulse is number => pulse !== undefined)

  return ends.every(fits) ? null : 'pulse'
}

/**
 * Whether the pad has not the channel a row reads.
 *
 * @param row the row
 * @param layout what each channel of the pad is, or null when that is not known
 * @returns true when the layout is known and says the channel is not there
 */
function isAbsent(row: Row, layout: PadLayout | null): boolean {
  return layout !== null && (layout[row.source - 1] ?? null) === null
}

/**
 * What is wrong with a row itself (not with which channel it drives), or nothing.
 *
 * @param row the row
 * @param layout what each channel of the pad is, or null when that is not known
 * @returns the code, or null
 */
function rowProblem(row: Row, layout: PadLayout | null): Code | null {
  if (!hasSource(row)) {
    return 'source'
  }

  return isAbsent(row, layout) ? 'absent' : settingsProblem(row)
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
 * What is wrong with a row: its channel first, then the row itself.
 *
 * @param row the row
 * @param seen the channels the rows before drive
 * @param layout what each channel of the pad is, or null when that is not known
 * @returns the code, or null
 */
function problemOf(row: Row, seen: ReadonlySet<number>, layout: PadLayout | null): Code | null {
  return channelProblem(row.channel, seen) ?? rowProblem(row, layout)
}

/**
 * What is wrong with a mapping.
 *
 * @param profile the mapping
 * @param layout what each of CH1..CH16 of the pad is now, or null when the pad is not read (then nothing is confirmed)
 * @returns the problems, none for one that may drive a vehicle
 */
export function problemsOf(profile: Profile, layout: PadLayout | null): Problem[] {
  const seen = new Set<number>()
  const problems: Problem[] = isConfirmed(profile, layout) ? [] : [{ code: 'unconfirmed', channel: 0 }]
  for (const row of profile.rows) {
    const code = problemOf(row, seen, layout)

    seen.add(row.channel)

    if (code !== null) {
      problems.push({ code, channel: row.channel })
    }
  }

  return problems
}
