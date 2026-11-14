// The motors and outputs of a Copter, as the Setup page needs them: what the ESC protocol can be set to, the spin thresholds
// and the order they must be in, and the live servo outputs as rows. Nothing here talks to the vehicle: the page writes through
// the parameter panel (the one question, each read back, refused while the vehicle is armed or may be), and the outputs are
// read-only.
import type { ServoGroup } from '@/generated/app'

/** The parameter that says how the ESCs are driven (the protocol of the outputs). A change takes effect at the next boot. */
export const PWM_TYPE = 'MOT_PWM_TYPE'

/** The thresholds of the motor outputs, as a part of the throttle range: where the motors spin armed, at least, at most. */
export const SPIN_ARM = 'MOT_SPIN_ARM'

export const SPIN_MIN = 'MOT_SPIN_MIN'

export const SPIN_MAX = 'MOT_SPIN_MAX'

/** Every parameter the page writes. */
export const MOTOR_PARAMS: readonly string[] = [PWM_TYPE, SPIN_ARM, SPIN_MIN, SPIN_MAX]

/** The spin thresholds, in the order they must be in (arm not above min, min not above max). */
export const SPIN_PARAMS: readonly string[] = [SPIN_ARM, SPIN_MIN, SPIN_MAX]

/**
 * What the ESC protocol (MOT_PWM_TYPE) can be set to: ArduPilot's list, copied from its source (libraries/AP_Motors/
 * AP_MotorsMulticopter.cpp, the Values of PWM_TYPE: the same in Copter-4.7.2, which CI's SITL is, and in the 4.8 development
 * tree). A value that is not here (a removed one, a newer firmware's) has no name and is shown as its number, never as a name
 * that was guessed. The names are the protocols' own, the same in every language.
 */
export const PWM_TYPES: { value: number, label: string }[] = [
  { value: 0, label: 'Normal' },
  { value: 1, label: 'OneShot' },
  { value: 2, label: 'OneShot125' },
  { value: 3, label: 'Brushed' },
  { value: 4, label: 'DShot150' },
  { value: 5, label: 'DShot300' },
  { value: 6, label: 'DShot600' },
  { value: 7, label: 'DShot1200' },
  { value: 8, label: 'PWMRange' },
  { value: 9, label: 'PWMAngle' },
]

/**
 * The range ArduPilot documents for each spin threshold (the Range of MOT_SPIN_ARM, MOT_SPIN_MIN and MOT_SPIN_MAX): a value
 * outside it is not taken, and the page says the range.
 */
export const SPIN_RANGES: Readonly<Record<string, readonly [number, number]>> = {
  [SPIN_ARM]: [0, 0.2],
  [SPIN_MIN]: [0, 0.25],
  [SPIN_MAX]: [0.9, 1],
}

/**
 * A spin threshold as typed: a number inside the threshold's documented range, else it is not taken.
 *
 * @param typed what was typed
 * @param low the least it may be
 * @param high the most it may be
 * @returns the value, or null
 */
export function parseFraction(typed: string, low: number, high: number): number | null {
  const text = typed.trim()
  if (text === '') {
    return null
  }
  const value = Number(text.replace(',', '.'))

  // (NaN is neither above `low` nor below `high`)
  return value >= low && value <= high ? value : null
}

/** How the spin thresholds are wrong, if they are. */
export type SpinProblem = 'order' | null

/**
 * Whether one threshold is above the next, when the vehicle has both (equal is allowed: ArduPilot refuses only a threshold
 * above the next, AP_MotorsMulticopter.cpp).
 *
 * @param low the threshold that must not be above, or null
 * @param high the threshold that must not be below, or null
 * @returns true if they are in the wrong order
 */
function above(low: number | null, high: number | null): boolean {
  return low !== null && high !== null && low > high
}

/**
 * Whether the spin thresholds are out of order: the armed spin must not be above the lowest the motors spin at, and that not
 * above the highest (ArduPilot refuses a vehicle whose thresholds are in a worse order; equal ones are valid, both 0 included).
 * A threshold the vehicle does not have is not judged.
 *
 * @param arm MOT_SPIN_ARM, or null
 * @param min MOT_SPIN_MIN, or null
 * @param max MOT_SPIN_MAX, or null
 * @returns `order` when they are out of order, else null
 */
export function spinProblem(arm: number | null, min: number | null, max: number | null): SpinProblem {
  return above(arm, min) || above(min, max) ? 'order' : null
}

/** How long (ms) after the vehicle last reported its outputs they are no longer shown: they would look current. */
export const OUTPUTS_OLD_MS = 3000

/**
 * Whether the vehicle has stopped reporting its outputs (the latest report is older than OUTPUTS_OLD_MS).
 *
 * @param group the servo group of the telemetry, or undefined
 * @returns true if there is a group and it is old
 */
export function outputsOld(group: ServoGroup | undefined): boolean {
  return group !== undefined && group.ageMs > OUTPUTS_OLD_MS
}

/** One output of the vehicle, as a row of the table. */
export interface OutputRow {
  /** The number of the output: 16 for each port before it, and its place in the port. */
  output: number
  /** The pulse (µs). */
  pulse: number
  /** Where the pulse is in 1000 to 2000 µs, 0 to 1, for a bar. */
  fraction: number
}

/**
 * The ports of a report that is not old.
 *
 * @param group the servo group of the telemetry, or undefined
 * @returns its ports, none when there is no group or it is old
 */
function livePorts(group: ServoGroup | undefined): ServoGroup['ports'] {
  return group === undefined || outputsOld(group) ? [] : group.ports
}

/**
 * The outputs the vehicle has said it uses (an output with no pulse is not used and is left out), by number; none when the
 * report is old.
 *
 * @param group the servo group of the telemetry, or undefined before the vehicle has sent any
 * @returns the rows, in order
 */
export function outputRows(group: ServoGroup | undefined): OutputRow[] {
  const rows: OutputRow[] = []
  for (const port of livePorts(group)) {
    port.outputs.forEach((pulse, index) => {
      if (pulse > 0) {
        rows.push({ output: port.port * 16 + index + 1, pulse, fraction: Math.min(1, Math.max(0, (pulse - 1000) / 1000)) })
      }
    })
  }

  return rows
}
