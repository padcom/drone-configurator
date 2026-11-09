// What the HUD shows, from a Telemetry alone (no canvas, no DOM): numbers in SI units, each absent when the vehicle
// has not reported it, and whether the picture is of the last that was heard.
import type { Telemetry } from '../generated/app'
import { isStale } from '../telemetryCards'

/** A value of the HUD and whether it is older than `STALE_MS`. */
export interface HudValue {
  /** The value, or undefined when the vehicle has not reported it. */
  value: number | undefined
  /** True when it is too old to trust (the HUD draws it dimmed). */
  stale: boolean
}

/** Everything the HUD draws. */
export interface HudModel {
  /** Roll in degrees, positive right wing down. */
  roll: HudValue
  /** Pitch in degrees, positive nose up. */
  pitch: HudValue
  /** Heading in degrees, 0 to 360. */
  heading: HudValue
  /** Ground speed in metres per second. */
  speed: HudValue
  /** Height above home in metres. */
  altitude: HudValue
  /** Climb rate in metres per second, positive up. */
  climb: HudValue
  /** Battery charge left, percent. */
  battery: HudValue
  /** The flight mode, as the vehicle names it. */
  mode: string
  /** Whether the motors are armed. */
  armed: boolean
  /** True while the vehicle is not heard from (heartbeat stale, or the link is being brought back). */
  silent: boolean
}

const ABSENT: HudValue = Object.freeze({ value: undefined, stale: false })

/** The model before any telemetry has arrived: nothing known, nothing armed. */
const EMPTY: HudModel = {
  roll: ABSENT,
  pitch: ABSENT,
  heading: ABSENT,
  speed: ABSENT,
  altitude: ABSENT,
  climb: ABSENT,
  battery: ABSENT,
  mode: '',
  armed: false,
  silent: false,
}

/** A group of values that arrived together, with how long ago (the flat fields have no age). */
interface Aged {
  ageMs?: number
}

/**
 * Whether a value is the last that was heard rather than a live one.
 *
 * @param ageMs how long ago it arrived, if it has an age
 * @param silent whether everything is to be taken as the last that was heard
 * @returns true when it is old
 */
function isOld(ageMs: number | undefined, silent: boolean): boolean {
  return silent || (ageMs !== undefined && isStale(ageMs))
}

/**
 * A value with an age.
 *
 * @param value the value, if reported
 * @param ageMs how long ago it arrived, if it has an age
 * @param silent whether everything is to be taken as the last that was heard
 * @returns the HUD value
 */
function valueOf(value: number | undefined, ageMs: number | undefined, silent: boolean): HudValue {
  const known = Number.isFinite(value)

  return { value: known ? value : undefined, stale: known && isOld(ageMs, silent) }
}

/**
 * A degree value wrapped into 0 to 360.
 *
 * @param degrees an angle, if known
 * @returns the angle in range, or undefined
 */
function wrapDegrees(degrees: number | undefined): number | undefined {
  return degrees === undefined ? undefined : ((degrees % 360) + 360) % 360
}

/**
 * The groups the HUD reads from: the group when the vehicle sent it, else the flat fields.
 *
 * @param t the telemetry
 * @returns the attitude, the battery and the group that has the heading
 */
function sources(t: Telemetry) {
  return {
    attitude: t.attitude ?? { roll: t.roll, pitch: t.pitch, ageMs: undefined },
    battery: t.battery ?? { remaining: t.batteryRemaining, ageMs: undefined },
    course: t.speed ?? t.position,
  }
}

/**
 * One value of a group.
 *
 * @param group the group, if the vehicle sent it
 * @param read picks the value
 * @param silent whether everything is to be taken as the last that was heard
 * @returns the HUD value, absent without the group
 */
function pick<G extends Aged>(group: G | undefined, read: (g: G) => number | undefined, silent: boolean): HudValue {
  return group ? valueOf(read(group), group.ageMs, silent) : ABSENT
}

/**
 * The HUD's values for the telemetry.
 *
 * @param t the telemetry, or undefined before any has arrived
 * @param reconnecting whether the link is being brought back (everything is then the last that was heard)
 * @returns what to draw; with no telemetry every value is absent
 */
export function hudModel(t: Telemetry | undefined, reconnecting = false): HudModel {
  if (t === undefined) {
    return { ...EMPTY }
  }
  const silent = reconnecting || isStale(t.heartbeatAgeMs)
  const { attitude, battery, course } = sources(t)

  return {
    roll: pick(attitude, g => g.roll, silent),
    pitch: pick(attitude, g => g.pitch, silent),
    heading: pick(course, g => wrapDegrees(g.heading), silent),
    speed: pick(t.speed, g => g.groundspeed, silent),
    altitude: pick(t.position, g => g.relativeAltitude, silent),
    climb: pick(t.speed, g => g.climb, silent),
    battery: pick(battery, g => g.remaining, silent),
    mode: t.mode,
    armed: t.armed,
    silent,
  }
}
