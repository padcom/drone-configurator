// What the RC control never sends, whatever the sticks say (plan section 6, rules 4 and 5): the throttle does not jump in
// when the control turns on, and the sticks never make the gesture the vehicle takes for arming or disarming (the rudder at its
// end, the throttle low).
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
 * @returns true when it is low
 */
export function isLow(pulse: number, range: PulseRange): boolean {
  return pulse === NOT_MINE || pulse <= range.min + LOW_FRACTION * (range.max - range.min)
}

/** Whether the throttle may be sent: `waiting` until the stick has been at the low end once, then `open`. */
export type ThrottleState = 'waiting' | 'open'

/**
 * The state after one more read: the throttle opens when the stick is low, and stays open. (It is made `waiting` again by the
 * caller, on every enable, release and change of the mapping.)
 *
 * @param state the state before
 * @param pulse the throttle pulse the stick makes
 * @param range the throttle channel's range
 * @returns the state
 */
export function nextThrottleState(state: ThrottleState, pulse: number, range: PulseRange): ThrottleState {
  const low = pulse !== NOT_MINE && isLow(pulse, range)

  return state === 'open' || low ? 'open' : 'waiting'
}

/** What the guards made of the 16 pulses. */
export interface Guarded {
  /** The pulses to send. */
  channels: number[]
  /** The throttle's state after this read. */
  state: ThrottleState
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
 * Holds the yaw back from the arming gesture while the throttle is low.
 *
 * @param out the pulses (changed here)
 * @param vehicle which channels are the throttle and the yaw, and their ranges
 * @returns whether the yaw was held
 */
function holdTheRudder(out: number[], vehicle: VehicleChannels): boolean {
  const yaw = vehicle.yaw - 1
  if (!isLow(out[vehicle.throttle - 1] ?? NOT_MINE, vehicle.range(vehicle.throttle))) {
    return false
  }
  const held = holdYaw(out[yaw] ?? NOT_MINE, vehicle.range(vehicle.yaw))
  out[yaw] = held.pulse

  return held.held
}

/**
 * Makes the pulses safe to send: the throttle channel is the radio's own until the stick has been low once, and the yaw is held
 * back from the arming gesture while the throttle is low.
 *
 * @param channels the 16 pulses the mapping made
 * @param vehicle which channels are the throttle and the yaw, and their ranges
 * @param state the throttle's state before this read
 * @returns what to send
 */
export function guard(channels: readonly number[], vehicle: VehicleChannels, state: ThrottleState): Guarded {
  const t = vehicle.throttle - 1
  const next = nextThrottleState(state, channels[t] ?? NOT_MINE, vehicle.range(vehicle.throttle))
  const out = [...channels]
  if (next === 'waiting') {
    out[t] = NOT_MINE
  }

  return { channels: out, state: next, yawHeld: holdTheRudder(out, vehicle) }
}
