// What the RC control never sends, whatever the sticks say (plan section 6, rules 4 and 5): the throttle does not jump in
// when the control turns on, and the sticks never make the gesture the vehicle takes for arming or disarming (the rudder at its
// end, the throttle low; for a simulator, a person who turned the sticks' own arm on in Settings lifts only this one). Last,
// whatever is left is checked once more: nothing that an override cannot carry leaves.
import { rangeOk, sendableOr } from './mapping'
import { REST_READS } from './rest'
import { NOT_MINE, type PulseRange, type VehicleChannels } from './types'

/** The throttle is low when it is within this part of its range of the minimum. */
export const LOW_FRACTION = 0.1

/** The yaw is never sent further from its middle than this part of its half range with the throttle low (arming is at 0.89). */
export const RUDDER_LIMIT = 0.8

/**
 * Whether a throttle pulse is at the low end of its range.
 *
 * @param pulse the pulse (`NOT_MINE` is the radio's own, which a vehicle with no receiver reads as the minimum: low)
 * @param range the throttle channel's range
 * @param zone the throttle channel's dead zone (`RCn_DZ`, µs): "low" is at least twice as wide as it, so that a stick the vehicle
 * still reads as the minimum is low
 * @returns true when it is low
 */
export function isLow(pulse: number, range: PulseRange, zone = 0): boolean {
  const reach = Math.max(LOW_FRACTION * (range.max - range.min), 2 * zone)

  return pulse === NOT_MINE || pulse <= range.min + reach
}

/**
 * Whether a read counts as the throttle stick being low: the pad has the stick (`NOT_MINE` is not a read of it), and it is low.
 *
 * @param pulse the throttle pulse the stick makes
 * @param range the throttle channel's range
 * @param zone the throttle channel's dead zone (µs)
 * @returns true when it counts
 */
export function lowRead(pulse: number, range: PulseRange, zone: number): boolean {
  return pulse !== NOT_MINE && isLow(pulse, range, zone)
}

/** Whether the channels may be sent: they wait for `REST_READS` reads in a row with the four sticks at rest, then stay open. */
export interface Gate {
  /** Whether the throttle (and the rest) is sent. */
  open: boolean
  /** How many reads in a row all four sticks were at rest (while the gate is shut). */
  reads: number
}

/** What a gate is when the control turns on, and again after every release and every change of the mapping. */
export const START_GATE: Readonly<Gate> = Object.freeze({ open: false, reads: 0 })

/**
 * The gate after one more read: it opens when the four sticks have been at rest for `REST_READS` reads in a row (a single read at
 * rest between others does not open it), and it stays open.
 *
 * @param gate the gate before
 * @param rested whether this read has all four sticks at rest (`rest.ts`)
 * @returns the gate
 */
export function nextGate(gate: Readonly<Gate>, rested: boolean): Gate {
  if (gate.open) {
    return { open: true, reads: 0 }
  }
  const reads = rested ? gate.reads + 1 : 0

  return { open: reads >= REST_READS, reads }
}

/** What the guards made of the 16 pulses. */
export interface Guarded {
  /** The pulses to send. */
  channels: number[]
  /** The throttle's gate after this read. */
  gate: Gate
  /** Whether the yaw was held back from the arming gesture. */
  yawHeld: boolean
}

/** A yaw pulse, and whether it was held back. */
export interface Held {
  /** The pulse. */
  pulse: number
  /** Whether it was held back from the end of its travel. */
  held: boolean
}

/**
 * Holds the yaw back from the end of its travel.
 *
 * @param yaw the yaw pulse
 * @param range the yaw channel's range
 * @returns the pulse, and whether it was held
 */
export function holdYaw(yaw: number, range: PulseRange): Held {
  const half = yaw >= range.trim ? range.max - range.trim : range.trim - range.min
  const reach = Math.abs(yaw - range.trim)
  if (yaw === NOT_MINE || reach <= RUDDER_LIMIT * half) {
    return { pulse: yaw, held: false }
  }

  return { pulse: Math.round(range.trim + Math.sign(yaw - range.trim) * RUDDER_LIMIT * half), held: true }
}

/**
 * Whether the throttle pulse is low.
 *
 * @param out the pulses
 * @param vehicle which channels are the throttle and the yaw, and their ranges
 * @returns true when it is
 */
function throttleIsLow(out: readonly number[], vehicle: VehicleChannels): boolean {
  return isLow(out[vehicle.throttle - 1] ?? NOT_MINE, vehicle.range(vehicle.throttle), vehicle.throttleDeadZone)
}

/**
 * Holds the yaw back from the arming gesture while the throttle is low.
 *
 * @param out the pulses (changed here)
 * @param vehicle which channels are the throttle and the yaw, and their ranges
 * @param always whether the yaw is held whatever the throttle is (a centred throttle: its middle is not "low"; the vehicle's
 * rudder arm needs the throttle at the bottom only while `RC_OPTIONS` "arming check throttle" is set, which the page does not
 * read; the disarm needs it at the bottom)
 * @returns whether the yaw was held
 */
function holdTheRudder(out: number[], vehicle: VehicleChannels, always: boolean): boolean {
  const yaw = vehicle.yaw - 1
  if (!always && !throttleIsLow(out, vehicle)) {
    return false
  }
  const held = holdYaw(out[yaw] ?? NOT_MINE, vehicle.range(vehicle.yaw))
  out[yaw] = held.pulse

  return held.held
}

/** Whether the ranges of the throttle and yaw channels can be used. */
interface Usable {
  /** The throttle's range. */
  throttle: boolean
  /** The yaw's range. */
  yaw: boolean
}

/**
 * Whether the ranges of the throttle and the yaw can be used (a range that is not numbers, or is upside down, is not flown).
 *
 * @param vehicle which channels are the throttle and the yaw, and their ranges
 * @returns which of them can
 */
function usable(vehicle: VehicleChannels): Usable {
  return { throttle: rangeOk(vehicle.range(vehicle.throttle)), yaw: rangeOk(vehicle.range(vehicle.yaw)) }
}

/**
 * The gate after a read: by what the caller says of the sticks (`rested`), or, when it does not, by the throttle alone being low.
 *
 * @param gate the gate before
 * @param channels the pulses the mapping made
 * @param vehicle which channel is the throttle, and its range
 * @param rested whether all four sticks are at rest, when the caller knows
 * @returns the gate
 */
function gateOf(gate: Readonly<Gate>, channels: readonly number[], vehicle: VehicleChannels, rested?: boolean): Gate {
  const pulse = channels[vehicle.throttle - 1] ?? NOT_MINE

  return nextGate(gate, rested ?? lowRead(pulse, vehicle.range(vehicle.throttle), vehicle.throttleDeadZone ?? 0))
}

/**
 * Holds the yaw back when the ranges of the throttle and the yaw can be used.
 *
 * @param out the pulses (changed here)
 * @param vehicle which channels are the throttle and the yaw, and their ranges
 * @param ok which ranges can be used
 * @param always whether the yaw is held whatever the throttle is
 * @returns whether the yaw was held
 */
function holdIfFlyable(out: number[], vehicle: VehicleChannels, ok: Usable, always: boolean): boolean {
  return ok.throttle && ok.yaw && holdTheRudder(out, vehicle, always)
}

/**
 * Whether the yaw is held back from the arming gesture: always, unless the person turned the sticks' arm and disarm on AND the
 * vehicle is known to be disarmed (the arm gesture) or known to be armed and landed (the disarm gesture on the ground). Armed in
 * the air (ArduCopter lets a rudder disarm happen there in the manual-throttle modes), a stale or no heartbeat, a failsafe or a
 * vehicle that is booting are all "not on the ground": the hold stays, with the option on too.
 *
 * @param option whether the option is on for this control
 * @param armed whether the vehicle is armed, or undefined when that is not known
 * @param landed whether the vehicle says it is landed (a fresh heartbeat of STANDBY)
 * @returns true when the yaw is held back
 */
export function rudderHeld(option: boolean, armed: boolean | undefined, landed: boolean): boolean {
  if (!option || armed === undefined) {
    return true
  }

  return armed && !landed
}

/** What the guards are asked for. */
export interface GuardOptions {
  /**
   * Whether the yaw is held back from the arming gesture (the default). Only a person who turned the sticks' own arm and
   * disarm on (Settings, for a simulator) lifts it: the throttle's gate and every other check stay as they are.
   */
  holdRudder?: boolean
  /**
   * Whether all four sticks are at rest in this read (`rest.ts`): the gate opens after `REST_READS` such reads in a row. Without
   * it the gate looks at the throttle alone being low.
   */
  rested?: boolean
  /**
   * Whether the throttle is spring-centred: the yaw is then held whatever the throttle is (its middle is not "low": the vehicle's
   * rudder arm needs the throttle at the bottom only while `RC_OPTIONS` "arming check throttle" is set, which the page does not
   * read; the disarm needs it at the bottom).
   */
  centred?: boolean
}

/**
 * Makes every channel the radio's own while the gate is shut (nothing is sent until the four sticks have been at rest), and the
 * yaw while its range cannot be used.
 *
 * @param out the pulses (changed here)
 * @param vehicle which channels are the throttle and the yaw
 * @param ok which ranges can be used
 * @param open whether the gate is open
 */
function blank(out: number[], vehicle: VehicleChannels, ok: Usable, open: boolean): void {
  if (!open) {
    out.fill(NOT_MINE)
  }
  if (!ok.yaw) {
    out[vehicle.yaw - 1] = NOT_MINE
  }
}

/**
 * Makes the pulses safe to send: every channel is the radio's own until the four sticks have been at rest for a while, the yaw is
 * held back from the arming gesture while the throttle is low (always, for a centred throttle), a throttle or yaw whose range is
 * not usable is the radio's own, and whatever an override cannot carry is the radio's own too (the last check, whatever the
 * mapping did).
 *
 * @param channels the 16 pulses the mapping made
 * @param vehicle which channels are the throttle and the yaw, and their ranges
 * @param gate the gate before this read
 * @param options `holdRudder: false` lifts the hold of the yaw (the sticks may arm and disarm); the rest is never lifted
 * @returns what to send
 */
export function guard(
  channels: readonly number[],
  vehicle: VehicleChannels,
  gate: Readonly<Gate>,
  options: GuardOptions = {},
): Guarded {
  const ok = usable(vehicle)
  const next = ok.throttle ? gateOf(gate, channels, vehicle, options.rested) : { ...START_GATE }
  const out = [...channels]

  blank(out, vehicle, ok, next.open)

  const yawHeld = options.holdRudder !== false && holdIfFlyable(out, vehicle, ok, options.centred === true)

  return { channels: out.map(sendableOr), gate: next, yawHeld }
}
