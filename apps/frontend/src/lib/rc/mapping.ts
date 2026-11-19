// The mapping math of the RC control: from what a gamepad said to the pulse of a channel, and from a profile to the 16 pulses
// of an override. Pure: the same sample gives the same pulses. Nothing is calibrated here: the pad's own -1 to 1 is used as it
// is (the operating system and the device own that), held to that range.
import {
  CHANNELS,
  MAX_PULSE,
  MIN_PULSE,
  NOT_MINE,
  NO_SOURCE,
  type PadSample,
  type Profile,
  type PulseRange,
  type Row,
} from './types'

/**
 * Whether a number is a pulse an override may carry (not the radio's own).
 *
 * @param pulse the number
 * @returns true when it is 800 to 2200
 */
function inRange(pulse: number): boolean {
  return pulse >= MIN_PULSE && pulse <= MAX_PULSE
}

/**
 * Whether the pulses of a range are in the order min, trim, max, with a min under the max (numbers that are not numbers are not).
 *
 * @param range the range
 * @returns true when they are
 */
function ordered(range: PulseRange): boolean {
  return range.min <= range.trim && range.trim <= range.max && range.min < range.max
}

/**
 * Whether the range of a channel can be used: numbers, in the order min, trim, max, and pulses an override carries.
 *
 * @param range the range (as the vehicle's `RCn_MIN`, `RCn_TRIM` and `RCn_MAX` say it)
 * @returns true when it can
 */
export function rangeOk(range: PulseRange): boolean {
  return ordered(range) && inRange(range.min) && inRange(range.max)
}

/**
 * Holds a number to a range.
 *
 * @param value the number
 * @param least the least it may be
 * @param most the most it may be
 * @returns the number, or the limit it passed
 */
export function clamp(value: number, least: number, most: number): number {
  return Math.min(most, Math.max(least, value))
}

/**
 * A reading of the pad as a number from -1 to 1 (what the device says, held to that: nothing is measured or calibrated).
 *
 * @param raw what the pad channel said
 * @returns -1 to 1; 0 for something that is not a number
 */
export function normalise(raw: number): number {
  return Number.isFinite(raw) ? clamp(raw, -1, 1) : 0
}

/**
 * Takes the dead zone out of a value: nothing inside it, and the rest stretched to the whole range again.
 *
 * @param value -1 to 1
 * @param zone the part around 0 that is 0 (0 to 0.5)
 * @returns -1 to 1
 */
export function applyDeadZone(value: number, zone: number): number {
  const size = Math.abs(value)
  if (size <= zone) {
    return 0
  }

  return Math.sign(value) * (size - zone) / (1 - zone)
}

/**
 * The expo curve: a mix of the straight line and a cubic one, so that the middle is gentler and the ends are the same.
 *
 * @param value -1 to 1
 * @param expo 0 (a line) to 1 (a cube)
 * @returns -1 to 1
 */
export function applyExpo(value: number, expo: number): number {
  return (1 - expo) * value + expo * value ** 3
}

/**
 * A value from -1 to 1 as the pulse of a channel: -1 is the range's minimum, 0 its trim and 1 its maximum.
 *
 * @param value -1 to 1
 * @param range the channel's range
 * @returns the pulse in µs, a whole number
 */
export function toPulse(value: number, range: PulseRange): number {
  const side = value >= 0 ? range.max - range.trim : range.trim - range.min

  return Math.round(clamp(range.trim + value * side, MIN_PULSE, MAX_PULSE))
}

/**
 * What the pad channel of a row says, as the pad said it.
 *
 * @param row the row
 * @param sample what the pad said
 * @returns the reading, or null for a row with no source, a channel the pad has not, or a reading that is not a number
 */
function readingOf(row: Row, sample: PadSample): number | null {
  const raw = sample.channels[row.source - 1]

  return row.source !== NO_SOURCE && typeof raw === 'number' && Number.isFinite(raw) ? raw : null
}

/**
 * What the pad channel of a row says, turned when the row says so (before the dead zone and the curve).
 *
 * @param row the row
 * @param sample what the pad said
 * @returns -1 to 1, or null when the row has no source, or the pad has no such channel or reads no number
 */
export function levelOf(row: Row, sample: PadSample): number | null {
  const raw = readingOf(row, sample)

  return raw === null ? null : normalise(raw) * (row.invert ? -1 : 1)
}

/**
 * The pulse a level makes: the range's, or, when the row has its own ends, a line between them.
 *
 * @param row the row
 * @param level -1 to 1, after the dead zone and the curve
 * @param range the channel's range
 * @returns the pulse
 */
function pulseOf(row: Row, level: number, range: PulseRange): number {
  if (row.pulseMin === undefined || row.pulseMax === undefined) {
    return toPulse(level, range)
  }

  // (not held to what an override carries: ends that are not pulses make a pulse that is not sent, `sendableOr`)
  return Math.round(row.pulseMin + (level + 1) / 2 * (row.pulseMax - row.pulseMin))
}

/**
 * The pulse a row gives.
 *
 * @param row the row
 * @param sample what the pad said
 * @param range the range of the row's channel
 * @returns the pulse, or `NOT_MINE` when the pad has no such channel
 */
export function rowPulse(row: Row, sample: PadSample, range: PulseRange): number {
  const level = levelOf(row, sample)

  return level === null ? NOT_MINE : pulseOf(row, applyExpo(applyDeadZone(level, row.deadZone), row.expo), range)
}

/**
 * Whether a pulse is one an override may carry (the radio's own, 0, or a whole number of 800 to 2200 µs).
 *
 * @param pulse the pulse
 * @returns true when it is
 */
export function sendable(pulse: number): boolean {
  return pulse === NOT_MINE || (Number.isInteger(pulse) && pulse >= MIN_PULSE && pulse <= MAX_PULSE)
}

/**
 * What may be sent for a pulse: itself when the backend takes it, and else the radio's own. (A pulse that is not a number, or
 * is outside, comes of a mapping or a range that is wrong: it is not sent as something else.)
 *
 * @param pulse the pulse
 * @returns the pulse, or `NOT_MINE`
 */
export function sendableOr(pulse: number): number {
  return sendable(pulse) ? pulse : NOT_MINE
}

/**
 * Whether a number is a channel of an override.
 *
 * @param channel the number
 * @returns true when it is a whole number from 1 to 16
 */
export function validChannel(channel: number): boolean {
  return Number.isInteger(channel) && channel >= 1 && channel <= CHANNELS
}

/**
 * The pulse a row gives, or the radio's own when the range of its channel cannot be used or the pulse is not one to send.
 *
 * @param row the row
 * @param sample what the pad said
 * @param range the range of the row's channel
 * @returns the pulse
 */
function checkedPulse(row: Row, sample: PadSample, range: PulseRange): number {
  return sendableOr(rangeOk(range) ? rowPulse(row, sample, range) : NOT_MINE)
}

/**
 * The 16 pulses of an override that a profile makes of a sample: the channel of a row has its pulse, every other is the radio's.
 * What is not a pulse an override carries (a number that is not a number, a row with ends of 3000 µs, a range that is upside
 * down) is the radio's own, never sent. A row whose channel is not a whole number from 1 to 16 is skipped (it never makes the
 * list longer than 16: the backend would refuse the whole frame), and `problemsOf` says so.
 *
 * @param profile the mapping
 * @param sample what the pad said
 * @param range the range of a channel
 * @returns 16 numbers, channel 1 first (`NOT_MINE` for a channel no row drives)
 */
export function channelsOf(profile: Profile, sample: PadSample, range: (channel: number) => PulseRange): number[] {
  const pulses = Array.from({ length: CHANNELS }, () => NOT_MINE)
  // (a mapping that was never confirmed drives nothing, whatever the caller checked: the last net)
  for (const row of profile.confirmedKey === null ? [] : profile.rows) {
    if (validChannel(row.channel)) {
      pulses[row.channel - 1] = checkedPulse(row, sample, range(row.channel))
    }
  }

  return pulses
}
