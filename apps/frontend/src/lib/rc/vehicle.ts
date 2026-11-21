// What the vehicle says of its radio channels (its parameters), as the RC control needs it: which channels are the sticks
// (`RCMAP_*`, never assumed to be 1 to 4), the pulses of each (`RCn_MIN`, `RCn_TRIM`, `RCn_MAX`), the dead zone of the throttle
// (`RCn_DZ`), and what each channel does when it is a switch (`RCn_OPTION`). A mapping that drives a channel that arms or disarms
// the vehicle, or whose control channels are not known, may not be used. Values come from ArduPilot's source (RC_Channel.h).
import { DEFAULT_RANGE, type PulseRange, type VehicleChannels } from './types'
import { rangeOk, validChannel } from './mapping'
import { MIN_CENTRED_ZONE } from './rest'
import type { Profile } from './types'

/** The `RCn_OPTION` values that arm, disarm, stop the motors or interlock them (ESTOP, INTERLOCK, DISARM, ARMDISARM). */
export const ARM_FUNCTIONS: readonly number[] = [31, 32, 81, 153, 154, 165]

/** A parameter of the vehicle. */
export interface ParamValue {
  /** Its name. */
  id: string
  /** Its value. */
  value: number
}

/** What the vehicle's parameters say of its radio channels. */
export interface Facts {
  /** The channels of the roll, pitch, throttle and yaw sticks (`RCMAP_ROLL`, `RCMAP_PITCH`, `RCMAP_THROTTLE`, `RCMAP_YAW`). */
  map: { roll: number, pitch: number, throttle: number, yaw: number }
  /** The range of each channel 1 to 16, or null for one the vehicle did not say. */
  ranges: (PulseRange | null)[]
  /** The dead zone of each channel (µs), undefined for one that was not said (never read as 0: it is `unknown`). */
  zones: (number | undefined)[]
  /** The function of each channel (`RCn_OPTION`), undefined for one that was not said (never read as 0, "no function"). */
  options: (number | undefined)[]
  /** Whether the parameter list was downloaded whole: a list that was not has holes that no rule here can name. */
  complete: boolean
}

/** What is wrong, or worth saying, about a mapping and the vehicle together. */
export interface VehicleProblem {
  /**
   * `unknown` (the parameter list is not whole, or a value the mapping needs is not there: channel 0 for the whole list),
   * `range` (a stick channel whose range is not usable), `arm` (a row on a channel
   * that arms or disarms), `zone` (the throttle's dead zone is wide: a warning), `centre` (a centred throttle's row has a dead
   * zone under `MIN_CENTRED_ZONE`: nobody finds the middle of a stick that is a point).
   */
  code: 'unknown' | 'range' | 'arm' | 'zone' | 'centre'
  /** The channel, or 0 for the vehicle as a whole. */
  channel: number
  /** Whether it stops the control (a warning does not). */
  blocks: boolean
}

/**
 * The value of a parameter.
 *
 * @param params the vehicle's parameters
 * @param id the name
 * @returns the value, or undefined
 */
function valueOf(params: readonly ParamValue[], id: string): number | undefined {
  return params.find(param => param.id === id)?.value
}

/**
 * A number of the parameters, for each channel.
 *
 * @param params the vehicle's parameters
 * @param suffix the end of the name: `MIN`, `TRIM`, `MAX`, `DZ` or `OPTION`
 * @returns 16 values (undefined for one that was not said)
 */
function eachChannel(params: readonly ParamValue[], suffix: string): (number | undefined)[] {
  return Array.from({ length: 16 }, (_, index) => valueOf(params, `RC${index + 1}_${suffix}`))
}

/**
 * The range of a channel the vehicle says, when it says all three of its pulses.
 *
 * @param min `RCn_MIN`
 * @param trim `RCn_TRIM`
 * @param max `RCn_MAX`
 * @returns the range, or null
 */
function rangeFrom(min?: number, trim?: number, max?: number): PulseRange | null {
  return min === undefined || trim === undefined || max === undefined ? null : { min, trim, max }
}

/**
 * The channels of the sticks, as the vehicle maps them.
 *
 * @param params the vehicle's parameters
 * @returns the four channels, or null when the vehicle did not say them
 */
function mapOf(params: readonly ParamValue[]): Facts['map'] | null {
  const [roll, pitch, throttle, yaw] = ['ROLL', 'PITCH', 'THROTTLE', 'YAW'].map(name => valueOf(params, `RCMAP_${name}`))
  const all = [roll, pitch, throttle, yaw]

  return all.every(channel => channel !== undefined && validChannel(channel))
    ? { roll: roll!, pitch: pitch!, throttle: throttle!, yaw: yaw! }
    : null
}

/**
 * What the parameters say of the radio channels.
 *
 * @param params the vehicle's parameters
 * @param complete whether the list was downloaded whole (`list === 'complete'`): a list that was not is `unknown`
 * @returns the facts, or null when the vehicle's map of the sticks is not in them
 */
export function factsOf(params: readonly ParamValue[], complete: boolean): Facts | null {
  const map = mapOf(params)
  if (map === null) {
    return null
  }
  const [mins, trims, maxs] = ['MIN', 'TRIM', 'MAX'].map(suffix => eachChannel(params, suffix))
  const ranges = mins!.map((min, index) => rangeFrom(min, trims![index], maxs![index]))

  return {
    map,
    ranges,
    zones: eachChannel(params, 'DZ'),
    options: eachChannel(params, 'OPTION'),
    complete,
  }
}

/**
 * The range the throttle is mapped through: a straight line from `RCn_MIN` (the stick at the bottom) to `RCn_MAX` (at the top),
 * with the middle of the stick in the middle of the pulses. ArduCopter's throttle is exactly that (`RC_Channel::pwm_to_range`:
 * from `RCn_MIN`, plus its dead zone, to `RCn_MAX`) and does not use `RCn_TRIM` at all, which a receiver calibration often
 * leaves at the bottom: mapped through the trim, half of the stick's travel would give nothing and the other half would be twice
 * as steep.
 *
 * @param range the throttle channel's range, as the vehicle says it
 * @returns the same minimum and maximum, with the trim half way between them
 */
function straight(range: PulseRange): PulseRange {
  return { min: range.min, trim: (range.min + range.max) / 2, max: range.max }
}

/**
 * The channels the RC control flies with: which are the throttle and the yaw, the range of each channel (the vehicle's, and the
 * default for a channel it did not say: a switch; the throttle's with its trim in the middle, see `straight`), and the throttle's
 * dead zone.
 *
 * @param facts what the vehicle says
 * @returns the channels
 */
export function vehicleChannels(facts: Facts): VehicleChannels {
  return {
    throttle: facts.map.throttle,
    yaw: facts.map.yaw,
    throttleDeadZone: facts.zones[facts.map.throttle - 1] ?? 0,
    range: channel => {
      const range = facts.ranges[channel - 1] ?? DEFAULT_RANGE

      return channel === facts.map.throttle ? straight(range) : range
    },
  }
}

/**
 * The channels of the four sticks.
 *
 * @param facts what the vehicle says
 * @returns their numbers
 */
function sticksOf(facts: Facts): number[] {
  return [facts.map.roll, facts.map.pitch, facts.map.throttle, facts.map.yaw]
}

/**
 * What is wrong with the sticks' channels: a range the vehicle did not say, or that cannot be used.
 *
 * @param facts what the vehicle says
 * @returns the problems
 */
function rangeProblems(facts: Facts): VehicleProblem[] {
  return sticksOf(facts)
    .filter(channel => {
      const range = facts.ranges[channel - 1]

      return range === null || range === undefined || !rangeOk(range)
    })
    .map(channel => ({ code: 'range' as const, channel, blocks: true }))
}

/**
 * The rows of a mapping that drive a channel that arms or disarms the vehicle (or stops its motors).
 *
 * @param facts what the vehicle says
 * @param profile the mapping
 * @returns the problems
 */
function armProblems(facts: Facts, profile: Profile): VehicleProblem[] {
  return profile.rows
    .filter(row => ARM_FUNCTIONS.includes(facts.options[row.channel - 1] ?? 0))
    .map(row => ({ code: 'arm' as const, channel: row.channel, blocks: true }))
}

/**
 * What the vehicle did not say that the mapping needs: the function of a channel a row drives (a missing value is NOT "no
 * function"), and the dead zone of the throttle channel (NOT 0).
 *
 * @param facts what the vehicle says
 * @param profile the mapping
 * @returns the problems: each `unknown`, and each stops the control
 */
function missingProblems(facts: Facts, profile: Profile): VehicleProblem[] {
  const driven = profile.rows
    .filter(row => facts.options[row.channel - 1] === undefined)
    .map(row => ({ code: 'unknown' as const, channel: row.channel, blocks: true }))
  const { throttle } = facts.map

  return facts.zones[throttle - 1] === undefined ? [...driven, { code: 'unknown', channel: throttle, blocks: true }] : driven
}

/**
 * How wide the throttle channel's range is.
 *
 * @param facts what the vehicle says
 * @returns the pulses from its minimum to its maximum, 0 when the vehicle did not say a range that can be used
 */
function throttleSpan(facts: Facts): number {
  const range = facts.ranges[facts.map.throttle - 1]

  return range !== undefined && range !== null && rangeOk(range) ? range.max - range.min : 0
}

/**
 * The warning that the throttle's dead zone is so wide that "low" is wider than the plain tenth of its range.
 *
 * @param facts what the vehicle says
 * @returns the warning, or nothing
 */
function zoneProblems(facts: Facts): VehicleProblem[] {
  const span = throttleSpan(facts)
  const zone = (facts.zones[facts.map.throttle - 1] ?? 0) * 2

  return span > 0 && zone > 0.1 * span ? [{ code: 'zone', channel: facts.map.throttle, blocks: false }] : []
}

/**
 * A centred throttle's row must have a dead zone of at least `MIN_CENTRED_ZONE`, so that the middle of the stick is a place a
 * thumb finds and the pulse there is exactly the middle of the range.
 *
 * @param facts what the vehicle says
 * @param profile the mapping
 * @returns the problem, or nothing
 */
function centreProblems(facts: Facts, profile: Profile): VehicleProblem[] {
  const row = profile.rows.find(candidate => candidate.channel === facts.map.throttle)

  // (written so that a dead zone that is not a number is a problem too: `NaN < 0.05` is false, and the middle was then no place)
  return row !== undefined && !(row.deadZone >= MIN_CENTRED_ZONE) ? [{ code: 'centre', channel: row.channel, blocks: true }] : []
}

/**
 * What is wrong with a mapping and the vehicle together: the parameters, a range that cannot be used, a row on a channel that
 * arms or disarms the vehicle, and (a warning) a throttle dead zone so wide that "low" is wider than a plain tenth of its range.
 *
 * @param facts what the vehicle says, or null when it is not known
 * @param profile the mapping
 * @returns the problems, none when the vehicle and the mapping agree
 */
export function vehicleProblems(facts: Facts | null, profile: Profile): VehicleProblem[] {
  if (facts === null || !facts.complete) {
    return [{ code: 'unknown', channel: 0, blocks: true }]
  }

  const centred = profile.throttleStyle === 'centred'

  return [
    ...rangeProblems(facts),
    ...missingProblems(facts, profile),
    ...armProblems(facts, profile),
    ...(centred ? centreProblems(facts, profile) : zoneProblems(facts)),
  ]
}
