// The rules of guided control on the page, without a window: what the user chose in Settings (how to confirm a Go here, what
// to do when the
// vehicle's GCS failsafe is off, how high, how far from home and how fast it may be asked to go), and when the vehicle is
// ready for it. The
// backend checks all of it again (apps/backend/guided.pi), and the vehicle's own fence besides: this is what the page can say
// before it
// asks, in words. A thing the vehicle does not report is not ready: nothing is assumed good.
import type { FailsafePolicy, GuidedLimits, Telemetry } from '@/generated/app'
import { isStale } from './telemetryCards'

/** How a Go here is confirmed: not at all, with a plain confirmation, or with a hold. */
export type GuidedConfirmation = 'none' | 'plain' | 'hold'

/** What the user chose. */
export interface GuidedPreferences {
  /** How a Go here is confirmed. */
  confirmation: GuidedConfirmation
  /** What happens when the vehicle's GCS failsafe (FS_GCS_ENABLE) is off: `block` refuses, `warn` goes and says so. */
  failsafe: FailsafePolicy
  /** The highest altitude (m above home), the farthest from home (m) and the greatest speed (m/s) a command may ask for. */
  maxAltitude: number
  /**
   *
   */
  maxDistance: number
  /**
   *
   */
  maxSpeed: number
  /** The speed a Go here flies at (m/s; never above `maxSpeed`). */
  speed: number
}

/** The safe defaults: a plain confirmation, the failsafe blocks, 50 m, 500 m from home, 10 m/s, and a Go here at 5 m/s. */
export const GUIDED_DEFAULTS: GuidedPreferences = {
  confirmation: 'plain', failsafe: 'block', maxAltitude: 50, maxDistance: 500, maxSpeed: 10, speed: 5,
}

/** What can be chosen for each number (the backend's hard limits are 120 m, 5000 m and 30 m/s). */
export const MAX_ALTITUDES = [20, 30, 50, 80, 120] as const

export const MAX_DISTANCES = [100, 200, 500, 1000, 2000, 5000] as const

export const MAX_SPEEDS = [3, 5, 10, 15, 20, 30] as const

export const SPEEDS = [2, 3, 5, 8, 10, 15] as const

/** The lowest altitude a command may ask for (m above home). */
export const MIN_ALTITUDE_M = 2

/**
 * A choice among numbers, or the default when it is not one of them.
 *
 * @param text what the settings hold
 * @param choices what can be chosen
 * @param fallback the default
 * @returns the number
 */
export function numberOf(text: string | undefined, choices: readonly number[], fallback: number): number {
  const value = Number(text)

  return choices.includes(value) ? value : fallback
}

/**
 * How a Go here is confirmed, from what the settings hold (anything else is the default).
 *
 * @param text what the settings hold
 * @returns the level
 */
export function confirmationOf(text: string | undefined): GuidedConfirmation {
  return text === 'none' || text === 'hold' ? text : GUIDED_DEFAULTS.confirmation
}

/**
 * What to do with a failsafe that is off, from what the settings hold (anything else is the default: block).
 *
 * @param text what the settings hold
 * @returns the policy
 */
export function failsafeOf(text: string | undefined): FailsafePolicy {
  return text === 'warn' ? 'warn' : GUIDED_DEFAULTS.failsafe
}

/**
 * What the backend is told the limits are: the user's, and a speed that does not go beyond them.
 *
 * @param prefs what the user chose
 * @returns the limits of a request
 */
export function limitsOf(prefs: GuidedPreferences): GuidedLimits {
  return { maxAltitude: prefs.maxAltitude, maxDistance: prefs.maxDistance, maxSpeed: prefs.maxSpeed }
}

/**
 * The speed a Go here flies at: the setting, and never above the greatest speed.
 *
 * @param prefs what the user chose
 * @returns metres a second
 */
export function speedOf(prefs: GuidedPreferences): number {
  return Math.min(prefs.speed, prefs.maxSpeed)
}

/** A place on the globe. */
export interface Place {
  /**
   *
   */
  lat: number
  /**
   *
   */
  lon: number
}

/** Metres of a degree of latitude. */
const METRES_PER_DEGREE = 111_320

/**
 * How far two places are from each other (m): flat-earth, which is all a few kilometres need (the backend's own is the same).
 *
 * @param from the first place
 * @param to the second place
 * @returns metres
 */
export function distanceM(from: Place, to: Place): number {
  const middle = ((from.lat + to.lat) / 2 * Math.PI) / 180
  const north = (to.lat - from.lat) * METRES_PER_DEGREE
  const east = (to.lon - from.lon) * METRES_PER_DEGREE * Math.cos(middle)

  return Math.hypot(north, east)
}

/** The height above home (m) above which the vehicle is taken to be in the air: the backend's rule. */
const AIRBORNE_M = 1

/** Why guided control is not offered now. */
export type GuidedBlock = 'params' | 'air' | 'landing' | 'high' | 'position' | 'home' | 'target' | 'far'

/** What the rules need to know. */
export interface GuidedState {
  /** What the vehicle reports. */
  telemetry: Telemetry | null | undefined
  /** Whether the complete list of the vehicle's parameters is there (the fence says what it limits only by it). */
  listComplete: boolean
  /** The place the user picked on the map. */
  target: Place | null
  /** What the user chose. */
  prefs: GuidedPreferences
}

/**
 * Whether a group of the telemetry is there and not old.
 *
 * @param group a group of the telemetry
 * @returns true when it is fresh
 */
function fresh(group: { ageMs: number } | undefined): boolean {
  return group !== undefined && !isStale(group.ageMs)
}

/**
 * Whether the telemetry has a group of the position or of home that is not old.
 *
 * @param telemetry what the vehicle reports
 * @param group which
 * @returns true when it has
 */
function hasFresh(telemetry: Telemetry | null | undefined, group: 'position' | 'home'): boolean {
  return fresh(telemetry?.[group])
}

/**
 * Whether the vehicle is in the air: above the height that counts as such.
 *
 * @param telemetry what the vehicle reports
 * @returns true when it is
 */
function isInTheAir(telemetry: Telemetry | null | undefined): boolean {
  return (telemetry?.position?.relativeAltitude ?? 0) > AIRBORNE_M
}

/** The modes of a vehicle that is coming home or landing: the user changes the mode on purpose, a Go here does not. */
const LANDING_MODES = ['RTL', 'SMART_RTL', 'LAND']

/**
 * Whether the vehicle is returning home or landing.
 *
 * @param telemetry what the vehicle reports
 * @returns true when it is
 */
function isLanding(telemetry: Telemetry | null | undefined): boolean {
  return LANDING_MODES.includes(telemetry?.mode ?? '')
}

/**
 * Whether the vehicle is above the highest altitude the user allows: a Go here keeps the altitude, so it would have to come down.
 *
 * @param state what is known
 * @returns true when it is
 */
function isTooHigh(state: GuidedState): boolean {
  return Math.round(state.telemetry?.position?.relativeAltitude ?? 0) > state.prefs.maxAltitude
}

/**
 * Whether a place is farther from home than the user allows.
 *
 * @param state what is known
 * @returns true when it is
 */
function isTooFar(state: GuidedState): boolean {
  const home = state.telemetry?.home

  return home !== undefined && state.target !== null && distanceM(home, state.target) > state.prefs.maxDistance
}

/**
 * Why a Go here is not offered, or nothing: the complete parameter list is there, the vehicle is in the air and reports its
 * position and
 * home, a place is picked, and the place is within the distance the user allows from home.
 *
 * @param state what is known
 * @returns the first reason, or null
 */
export function goHereBlock(state: GuidedState): GuidedBlock | null {
  const checks: [GuidedBlock, boolean][] = [
    ['params', state.listComplete],
    ['position', hasFresh(state.telemetry, 'position')],
    ['air', isInTheAir(state.telemetry)],
    ['landing', !isLanding(state.telemetry)],
    ['home', hasFresh(state.telemetry, 'home')],
    ['high', !isTooHigh(state)],
    ['target', state.target !== null],
    ['far', !isTooFar(state)],
  ]

  return checks.find(([, good]) => !good)?.[0] ?? null
}

/**
 * The altitude a Go here keeps: where the vehicle is, in whole metres, and not below 2 m. It is NOT held to the user's highest
 * altitude:
 * a vehicle above it would be sent down, so it is refused (`high`) instead.
 *
 * @param telemetry what the vehicle reports
 * @returns metres above home
 */
export function altitudeToKeep(telemetry: Telemetry | null | undefined): number {
  return Math.max(Math.round(telemetry?.position?.relativeAltitude ?? MIN_ALTITUDE_M), MIN_ALTITUDE_M)
}
