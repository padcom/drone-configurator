// The mapping math of the RC control: from what a gamepad said to the pulse of a channel, and from a profile to the 16 pulses
// of an override. Pure: the same sample gives the same pulses.
import {
  type AxisCalibration,
  type ButtonRow,
  CHANNELS,
  MAX_PULSE,
  MIN_PULSE,
  NOT_MINE,
  type PadSample,
  type Profile,
  type PulseRange,
  type Row,
  type StickRow,
  type SwitchRow,
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
 * An axis reading as a number from -1 (the calibrated minimum) to 1 (the maximum), with 0 where the axis rests.
 *
 * @param raw what the axis said
 * @param calibration what it said at each end and at rest
 * @returns -1 to 1; 0 for an axis whose ends are not apart from its middle (it was never calibrated)
 */
export function normalise(raw: number, calibration: AxisCalibration): number {
  const above = raw >= calibration.center
  const span = above ? calibration.max - calibration.center : calibration.center - calibration.min
  if (!(span > 0) || !Number.isFinite(raw)) {
    return 0
  }

  return clamp((raw - calibration.center) / span, -1, 1)
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
 * The reading of an axis of the sample, or null when the pad has no such axis.
 *
 * @param sample what the pad said
 * @param axis the axis
 * @param invert whether the axis is turned the other way
 * @returns the raw value (turned about 0 when inverted), or null
 */
function axisOf(sample: PadSample, axis: number, invert: boolean): number | null {
  const raw = sample.axes[axis]
  if (raw === undefined || !Number.isFinite(raw)) {
    return null
  }

  return invert ? -raw : raw
}

/**
 * The pulse of a stick.
 *
 * @param row the stick
 * @param sample what the pad said
 * @param range the channel's range
 * @returns the pulse, or `NOT_MINE` when the pad has no such axis
 */
export function stickPulse(row: StickRow, sample: PadSample, range: PulseRange): number {
  const raw = axisOf(sample, row.axis, false)
  if (raw === null) {
    return NOT_MINE
  }
  // (inverted after the calibration, so that the two sides of an axis that does not rest in the middle swap their travels)
  const level = normalise(raw, row.calibration) * (row.invert ? -1 : 1)

  return toPulse(applyExpo(applyDeadZone(level, row.deadZone), row.expo), range)
}

/**
 * The pulse of a switch on an axis: the lower, middle or upper third of its travel.
 *
 * @param row the switch
 * @param sample what the pad said
 * @returns the pulse, or `NOT_MINE` when the pad has no such axis
 */
export function switchPulse(row: SwitchRow, sample: PadSample): number {
  const raw = axisOf(sample, row.axis, row.invert)
  if (raw === null) {
    return NOT_MINE
  }
  const [low, middle, high] = row.pulses
  if (raw < -1 / 3) {
    return low
  }

  return raw > 1 / 3 ? high : middle
}

/**
 * The pulse of a button.
 *
 * @param row the button
 * @param sample what the pad said
 * @returns the pulse, or `NOT_MINE` when the pad has no such button
 */
export function buttonPulse(row: ButtonRow, sample: PadSample): number {
  const value = sample.buttons[row.button]
  if (value === undefined) {
    return NOT_MINE
  }

  return value > 0.5 ? row.on : row.off
}

/**
 * The pulse a row gives.
 *
 * @param row the row
 * @param sample what the pad said
 * @param range the range of the row's channel
 * @returns the pulse, or `NOT_MINE`
 */
export function rowPulse(row: Row, sample: PadSample, range: PulseRange): number {
  if (row.kind === 'stick') {
    return stickPulse(row, sample, range)
  }

  return row.kind === 'switch' ? switchPulse(row, sample) : buttonPulse(row, sample)
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
 * The 16 pulses of an override that a profile makes of a sample: the channel of a row has its pulse, every other is the radio's.
 * What is not a pulse an override carries (a number that is not a number, a switch that is set to 3000 µs, a range that is upside
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
  for (const row of profile.rows) {
    if (validChannel(row.channel)) {
      const channel = range(row.channel)

      pulses[row.channel - 1] = sendableOr(rangeOk(channel) ? rowPulse(row, sample, channel) : NOT_MINE)
    }
  }

  return pulses
}
