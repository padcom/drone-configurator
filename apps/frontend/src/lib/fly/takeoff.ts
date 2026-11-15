// The rules of a takeoff, without a window: how high it may go and when the vehicle is ready for one. The altitude is metres
// above home. The lowest is 2 m; the highest is the user's setting (50 m unless changed) and never above the vehicle's own fence
// when the fence limits the altitude (FENCE_ENABLE on and bit 0 of FENCE_TYPE: the maximum altitude, FENCE_ALT_MAX); the
// backend's own hard limit is 120 m. The vehicle is ready only when it reports a 3D fix and an EKF that has its position, and it
// is on the ground. A thing the vehicle does not report is not ready: nothing is assumed good.
import type { Telemetry } from '@/generated/app'

/** The lowest altitude (m above home). */
export const TAKEOFF_MIN_M = 2

/** The highest altitude that can be set (m above home): the backend's hard limit. */
export const TAKEOFF_HARD_MAX_M = 120

/** The altitude that is proposed first (m above home). */
export const TAKEOFF_DEFAULT_M = 10

/** The user's highest altitude when nothing was chosen (m). */
export const TAKEOFF_DEFAULT_CEILING_M = 50

/** What the user can choose as the highest altitude (m). */
export const TAKEOFF_CEILINGS = [20, 30, 50, 80, 120] as const

/** How the vehicle's own limit is described. */
export interface Limits {
  /** The lowest altitude. */
  min: number
  /** The highest altitude. */
  max: number
  /** What sets the highest: the user's setting, or the vehicle's fence. */
  by: 'setting' | 'fence'
}

/** Bit 0 of FENCE_TYPE: the fence has a maximum altitude. */
const FENCE_ALT_MAX_BIT = 1

/**
 * Whether the fence is on and limits the altitude.
 *
 * @param value reads a parameter of the vehicle (undefined when it has none, or is not known)
 * @returns true when it does
 */
function fenceLimitsAltitude(value: (id: string) => number | undefined): boolean {
  return value('FENCE_ENABLE') === 1 && ((value('FENCE_TYPE') ?? 0) & FENCE_ALT_MAX_BIT) === FENCE_ALT_MAX_BIT
}

/**
 * The ceiling the vehicle's own fence sets, when it limits the altitude.
 *
 * @param value reads a parameter of the vehicle (undefined when it has none, or is not known)
 * @returns metres above home, or null when no fence limits the altitude
 */
export function fenceCeilingOf(value: (id: string) => number | undefined): number | null {
  const ceiling = value('FENCE_ALT_MAX') ?? 0

  return fenceLimitsAltitude(value) && ceiling > 0 ? ceiling : null
}

/**
 * How high a takeoff may go.
 *
 * @param setting the user's highest altitude (m)
 * @param fence the fence's ceiling (m), or null
 * @returns the limits
 */
export function limitsOf(setting: number, fence: number | null): Limits {
  const user = Math.min(Math.max(setting, TAKEOFF_MIN_M), TAKEOFF_HARD_MAX_M)

  return fence !== null && fence < user
    ? { min: TAKEOFF_MIN_M, max: fence, by: 'fence' }
    : { min: TAKEOFF_MIN_M, max: user, by: 'setting' }
}

/** What is wrong with an altitude. */
export type AltitudeProblem = 'invalid' | 'low' | 'high'

/**
 * Reads an altitude that was typed.
 *
 * @param text what was typed
 * @returns the number, or NaN when it is not a number (no letters, no empty text, no infinity)
 */
export function altitudeOf(text: string): number {
  return /^\s*\d+(?:[.,]\d+)?\s*$/u.test(text) ? Number(text.trim().replace(',', '.')) : Number.NaN
}

/**
 * What is wrong with an altitude, or nothing.
 *
 * @param altitude the altitude (m)
 * @param limits what is allowed
 * @returns the problem, or null when it may be asked for
 */
export function problemOf(altitude: number, limits: Limits): AltitudeProblem | null {
  if (!Number.isFinite(altitude)) {
    return 'invalid'
  }

  if (altitude < limits.min) {
    return 'low'
  }

  return altitude > limits.max ? 'high' : null
}

/** The EKF flags that a takeoff in GUIDED needs: attitude, velocity (horizontal, vertical), position (horizontal, vertical). */
const EKF_READY = 1 | 2 | 4 | 16 | 32

/** The EKF flag for "constant position mode": it has lost its position. */
const EKF_CONST_POSITION = 128

/** The relative altitude (m) above which the vehicle is taken to be in the air. */
const AIRBORNE_M = 1

/** Why the vehicle is not ready for a takeoff. */
export type NotReady = 'gps' | 'ekf' | 'position' | 'air'

/**
 * Whether the EKF has what a takeoff needs and has not lost its position.
 *
 * @param flags the EKF's status flags, when the vehicle reports them
 * @returns true when it is ready
 */
function ekfReady(flags: number | undefined): boolean {
  return flags !== undefined && (flags & EKF_READY) === EKF_READY && (flags & EKF_CONST_POSITION) === 0
}

/**
 * Whether the vehicle reports a 3D fix.
 *
 * @param telemetry what the vehicle reports
 * @returns true when it does
 */
function hasFix(telemetry: Telemetry | null | undefined): boolean {
  return (telemetry?.gps?.fixType ?? 0) >= 3
}

/**
 * Whether the vehicle's EKF has what a takeoff needs.
 *
 * @param telemetry what the vehicle reports
 * @returns true when it has
 */
function hasEkf(telemetry: Telemetry | null | undefined): boolean {
  return ekfReady(telemetry?.ekf?.flags)
}

/**
 * Whether the vehicle reports a position.
 *
 * @param telemetry what the vehicle reports
 * @returns true when it does
 */
function hasPosition(telemetry: Telemetry | null | undefined): boolean {
  return telemetry?.position !== undefined
}

/**
 * Whether the vehicle is on the ground (it reports a position, and is not above the height that counts as the air).
 *
 * @param telemetry what the vehicle reports
 * @returns true when it is
 */
function onTheGround(telemetry: Telemetry | null | undefined): boolean {
  return (telemetry?.position?.relativeAltitude ?? 0) <= AIRBORNE_M
}

/**
 * Why the vehicle is not ready for a takeoff, or nothing: it reports a 3D fix, its EKF has what it needs, and it is on the
 * ground.
 *
 * @param telemetry what the vehicle reports
 * @returns the reason, or null when it is ready
 */
export function notReady(telemetry: Telemetry | null | undefined): NotReady | null {
  const checks: [NotReady, boolean][] = [
    ['gps', hasFix(telemetry)],
    ['ekf', hasEkf(telemetry)],
    ['position', hasPosition(telemetry)],
    ['air', onTheGround(telemetry)],
  ]

  return checks.find(([, good]) => !good)?.[0] ?? null
}
