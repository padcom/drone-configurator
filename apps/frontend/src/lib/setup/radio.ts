// The radio, as the Setup page needs it: which parameters a channel has, what a calibration's capture turns into, and where a
// pulse stands in a channel's range. Nothing here talks to the vehicle: the backend captures the ranges (`calibration.finish`),
// and the PAGE stages RCn_MIN, RCn_MAX and RCn_TRIM through the parameter panel (the one question, each read back).
import type { CalibrationRadio, CalibrationResult } from '@/generated/app'

/** How many channels ArduPilot has parameters for (RC1 to RC16). */
export const RC_CHANNELS = 16

/** The shortest and the longest pulse (µs) that are a reading: the backend's rule too (a pulse outside them is a glitch). */
export const MIN_PULSE = 800

export const MAX_PULSE = 2200

/** The default range of a channel, and what a bar spans when a channel has no range of its own (µs). */
export const DEFAULT_MIN = 1100

export const DEFAULT_MAX = 1900

/** A channel that moved less than this (µs) during a calibration was not moved: it is left as it is (a spare channel). */
export const MOVED_AT_LEAST = 100

/**
 * How far from the middle of its captured range a stick may be, when the user presses Done, to be taken as centred: a tenth of
 * the range (100 µs of 1000). A stick further out makes no trim.
 */
export const CENTRED_WITHIN = 0.1

/** The channels that have a trim: roll, pitch and yaw (the throttle has none that matters). */
export const TRIM_CHANNELS: readonly number[] = [1, 2, 4]

/** The sticks, by the parameter that says which channel each is on (1 to 4 by default). */
export const RCMAP_PARAMS = ['RCMAP_ROLL', 'RCMAP_PITCH', 'RCMAP_THROTTLE', 'RCMAP_YAW'] as const

/** What a channel is used for: a stick (named by the parameter that maps it), or an aux channel. */
export type Role = 'roll' | 'pitch' | 'throttle' | 'yaw' | 'aux'

const ROLES: readonly Role[] = ['roll', 'pitch', 'throttle', 'yaw']

/** The parameters of a channel. */
export interface ChannelParams {
  /**
   *
   */
  min: string
  /**
   *
   */
  max: string
  /**
   *
   */
  trim: string
  /**
   *
   */
  option: string
}

/**
 * The parameters of a channel.
 *
 * @param channel the channel, 1 to 16
 * @returns the names
 */
export function paramsOf(channel: number): ChannelParams {
  return { min: `RC${channel}_MIN`, max: `RC${channel}_MAX`, trim: `RC${channel}_TRIM`, option: `RC${channel}_OPTION` }
}

/** Every parameter the Radio page writes: the range and trim of each channel, and what its switch does. */
export const RADIO_PARAMS: readonly string[] = Array.from({ length: RC_CHANNELS }, (_unused, i) => {
  const { min, max, trim, option } = paramsOf(i + 1)

  return [min, max, trim, option]
}).flat()

/**
 * What a channel is used for, from the stick mapping (the defaults 1 to 4 where the vehicle has none).
 *
 * @param channel the channel, 1 to 16
 * @param mapped the value of RCMAP_ROLL, RCMAP_PITCH, RCMAP_THROTTLE and RCMAP_YAW, null where the vehicle has none
 * @returns the role
 */
export function roleOf(channel: number, mapped: readonly (number | null)[]): Role {
  const place = ROLES.findIndex((_role, i) => (mapped[i] ?? i + 1) === channel)

  return ROLES[place] ?? 'aux'
}

/**
 * Where a pulse stands in a channel's range, for a bar.
 *
 * @param pulse the pulse (µs); 0 for none
 * @param min the least of the channel
 * @param max the greatest of the channel
 * @returns 0 to 1; 0 when there is no pulse or no range
 */
export function fractionOf(pulse: number, min: number, max: number): number {
  if (pulse <= 0 || max <= min) {
    return 0
  }

  return Math.min(1, Math.max(0, (pulse - min) / (max - min)))
}

/**
 * The pulse of a channel in a list the capture holds.
 *
 * @param list the least, the greatest or the latest pulses
 * @param index the channel, 0 based
 * @returns the pulse; 0 when the channel was not seen
 */
function pulseAt(list: readonly number[], index: number): number {
  return list[index] ?? 0
}

/**
 * Whether a pulse is a reading (and not a glitch).
 *
 * @param pulse the pulse (µs)
 * @returns true if it is inside the range a receiver gives
 */
function within(pulse: number): boolean {
  return pulse >= MIN_PULSE && pulse <= MAX_PULSE
}

/** Nothing captured: what a channel's range is taken from when no calibration has run. */
const NOTHING: CalibrationRadio = { mins: [], maxs: [], last: [], glitches: 0, readings: 0 }

/** A channel's RCn_MIN and RCn_MAX on the vehicle: null where it has none. */
export type OwnRange = readonly [number | null, number | null]

/**
 * A channel's own range, with the default for an end the vehicle has no parameter for.
 *
 * @param own the channel's own range on the vehicle
 * @returns the least and the greatest pulse
 */
function ownSpan(own: OwnRange): [number, number] {
  return [own[0] ?? DEFAULT_MIN, own[1] ?? DEFAULT_MAX]
}

/**
 * The range a channel's bar spans: what the calibration captured when it has a range for the channel, else the vehicle's own
 * (RCn_MIN, RCn_MAX), else the default.
 *
 * @param radio what the calibration captured, if any
 * @param index the channel, 0 based
 * @param own the channel's own range on the vehicle
 * @returns the least and the greatest pulse
 */
export function spanOf(radio: CalibrationRadio | undefined, index: number, own: OwnRange): [number, number] {
  const taken = radio ?? NOTHING
  const min = pulseAt(taken.mins, index)
  const max = pulseAt(taken.maxs, index)

  return min > 0 && max > min ? [min, max] : ownSpan(own)
}

/**
 * Whether a calibration ended the way that gives values to write: a radio calibration that the user ended with Done.
 *
 * @param result how the last calibration ended
 * @returns true if it did
 */
export function endedWithDone(result: CalibrationResult | null): boolean {
  return result !== null && result.kind === 'radio' && result.outcome === 'success'
}

/**
 * Whether a channel moved during the calibration: both ends of its range were seen, and the range is wide enough to be real.
 *
 * @param radio what the calibration captured
 * @param index the channel, 0 based
 * @returns true if it moved
 */
export function moved(radio: CalibrationRadio, index: number): boolean {
  const min = pulseAt(radio.mins, index)
  const max = pulseAt(radio.maxs, index)

  return within(min) && within(max) && max - min >= MOVED_AT_LEAST
}

/** A parameter and the value to give it. */
export interface Planned {
  /** The parameter. */
  id: string
  /** The value to give it. */
  value: number
}

/**
 * The trim of a channel: the pulse the stick was at when the user ended, when it is a stick that has one and it is centred, that
 * is within `CENTRED_WITHIN` of the range it was seen in from the middle of it (a stick at an end does not make a trim).
 *
 * @param radio what the calibration captured
 * @param index the channel, 0 based
 * @returns the pulse, or null
 */
function trimOf(radio: CalibrationRadio, index: number): number | null {
  const last = pulseAt(radio.last, index)
  const min = pulseAt(radio.mins, index)
  const max = pulseAt(radio.maxs, index)
  const centred = Math.abs(last - (min + max) / 2) <= (max - min) * CENTRED_WITHIN

  return TRIM_CHANNELS.includes(index + 1) && centred ? last : null
}

/**
 * The channels that have a trim and moved, but whose stick was not centred when the user pressed Done: no trim is chosen for them
 * (a stick held at one end would make that end the middle), and the page says so.
 *
 * @param radio what the calibration captured
 * @returns the channels, 1 based, in order
 */
export function offCentre(radio: CalibrationRadio): number[] {
  return TRIM_CHANNELS.filter(channel => moved(radio, channel - 1) && trimOf(radio, channel - 1) === null)
}

/**
 * What a channel that moved is written as.
 *
 * @param radio what the calibration captured
 * @param index the channel, 0 based
 * @returns its range, and its trim when it has one
 */
function writesOf(radio: CalibrationRadio, index: number): Planned[] {
  const ids = paramsOf(index + 1)
  const trim = trimOf(radio, index)
  const range = [{ id: ids.min, value: pulseAt(radio.mins, index) }, { id: ids.max, value: pulseAt(radio.maxs, index) }]

  return trim === null ? range : [...range, { id: ids.trim, value: trim }]
}

/**
 * What a calibration's capture is written as: RCn_MIN and RCn_MAX of every channel that moved, and RCn_TRIM of roll, pitch and
 * yaw. A parameter the vehicle does not have is left out, so nothing is written to a name that is not there.
 *
 * @param radio what the calibration captured
 * @param present whether the vehicle has a parameter
 * @returns the parameters and their values, in the order of the channels
 */
export function plannedWrites(radio: CalibrationRadio, present: (id: string) => boolean): Planned[] {
  return radio.mins.flatMap((_min, index) => (moved(radio, index) ? writesOf(radio, index) : [])).filter(p => present(p.id))
}
