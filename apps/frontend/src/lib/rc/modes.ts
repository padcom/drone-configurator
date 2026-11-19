// What a copter's flight mode does with the pilot's throttle, for the RC control with a CENTRED throttle (plan
// `drone-configurator-joystick-backend.md`, section 11.1, from ArduCopter's source: `get_pilot_desired_climb_rate_ms`,
// `get_pilot_desired_throttle`). In a `climb` mode the throttle is a climb rate and its middle is no climb; in a `thrust` mode
// the middle is about hover thrust and the vehicle does not hold its altitude, so a centred throttle is never flown there; an
// `ignores` mode takes no throttle from the pilot at all (the mode commands the altitude), so a centred stick does no harm. A
// mode that is not here, a vehicle that is not a multicopter's, and a mode that is not known are `thrust`: never the safe guess.
// (`has_manual_throttle()` is not a test for this: it is false for DRIFT and FLIP, which read the pilot's thrust.)

/** What a mode does with the pilot's throttle. */
export type ModeClass = 'climb' | 'ignores' | 'thrust'

/** A copter mode: its number (`custom_mode`), its name as ArduPilot says it, and what it does with the throttle. */
export interface CopterMode {
  /** `custom_mode` of the heartbeat. */
  number: number
  /** The name. */
  name: string
  /** What the mode does with the pilot's throttle. */
  kind: ModeClass
}

/** Every ArduCopter mode this plan knows (`mode.h`). */
export const COPTER_MODES: readonly CopterMode[] = [
  { number: 0, name: 'STABILIZE', kind: 'thrust' },
  { number: 1, name: 'ACRO', kind: 'thrust' },
  { number: 2, name: 'ALT_HOLD', kind: 'climb' },
  { number: 3, name: 'AUTO', kind: 'ignores' },
  { number: 4, name: 'GUIDED', kind: 'ignores' },
  { number: 5, name: 'LOITER', kind: 'climb' },
  { number: 6, name: 'RTL', kind: 'ignores' },
  { number: 7, name: 'CIRCLE', kind: 'climb' },
  { number: 9, name: 'LAND', kind: 'ignores' },
  { number: 11, name: 'DRIFT', kind: 'thrust' },
  { number: 13, name: 'SPORT', kind: 'climb' },
  { number: 14, name: 'FLIP', kind: 'thrust' },
  { number: 15, name: 'AUTOTUNE', kind: 'climb' },
  { number: 16, name: 'POSHOLD', kind: 'climb' },
  { number: 17, name: 'BRAKE', kind: 'ignores' },
  { number: 18, name: 'THROW', kind: 'ignores' },
  { number: 19, name: 'AVOID_ADSB', kind: 'ignores' },
  { number: 20, name: 'GUIDED_NOGPS', kind: 'ignores' },
  { number: 21, name: 'SMART_RTL', kind: 'ignores' },
  { number: 22, name: 'FLOWHOLD', kind: 'climb' },
  { number: 23, name: 'FOLLOW', kind: 'ignores' },
  { number: 24, name: 'ZIGZAG', kind: 'climb' },
  { number: 25, name: 'SYSTEMID', kind: 'thrust' },
  { number: 26, name: 'AUTOROTATE', kind: 'ignores' },
  { number: 27, name: 'AUTO_RTL', kind: 'ignores' },
  { number: 28, name: 'TURTLE', kind: 'thrust' },
]

/**
 * What a mode (by its number) does with the pilot's throttle.
 *
 * @param number the heartbeat's `custom_mode`
 * @returns its class; `thrust` for a number that is not known
 */
export function classOfNumber(number: number): ModeClass {
  return COPTER_MODES.find(mode => mode.number === number)?.kind ?? 'thrust'
}

/**
 * What a mode (by its name) does with the pilot's throttle.
 *
 * @param name the mode's name, as the vehicle's list or the telemetry says it (case, and a space for an underscore, are free)
 * @returns its class; `thrust` for a name that is not known, or none
 */
export function classOfName(name: string | undefined): ModeClass {
  const wanted = (name ?? '').trim().toUpperCase().replace(/[\s-]+/gu, '_')

  return COPTER_MODES.find(mode => mode.name === wanted)?.kind ?? 'thrust'
}

/**
 * Whether a control may START in a mode. Only the centred throttle has a rule: it starts in a mode that reads the throttle as a
 * climb rate, whether the vehicle is armed or not. A mode that is not known (no heartbeat) is refused.
 *
 * @param centred whether the throttle is centred
 * @param mode the mode's name, or undefined when it is not known
 * @returns true when it may start
 */
export function startAllowed(centred: boolean, mode: string | undefined): boolean {
  return !centred || classOfName(mode) === 'climb'
}

/**
 * Whether a control that is on may go on in a mode: the centred throttle goes on in the climb modes and in the modes that ignore
 * the throttle (a failsafe RTL or a Land, a mission), and any other mode releases it at once.
 *
 * @param centred whether the throttle is centred
 * @param mode the mode's name, or undefined when it is not known
 * @returns true when it may go on
 */
export function continueAllowed(centred: boolean, mode: string | undefined): boolean {
  return !centred || classOfName(mode) !== 'thrust'
}
