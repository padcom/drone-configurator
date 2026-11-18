// The rest check at turn-on and after every release (plan `drone-configurator-joystick-backend.md`, sections 10.1 item 4 and 11.2
// item 4). With nothing calibrated in the app, this is what catches a trigger that rests at -1 as the roll, a reversed throttle,
// a stuck stick and a mapping to the wrong control: nothing is sent (every channel is the radio's own) until, for `REST_READS`
// reads in a row, the roll, the pitch and the yaw are within `REST_BAND` of their middle (after the inversion, before the dead
// zone and the curve) and the throttle is at rest by its style: LOW for a stick that rests at the bottom, and in its dead zone
// (so that its pulse is exactly the middle of the range) for a spring-centred one. The page says which stick is not at rest.
import { levelOf } from './mapping'
import type { PadSample, Profile, Row } from './types'

/** How many reads in a row all four sticks must be at rest before anything is sent (at 50 reads a second: 200 ms). */
export const REST_READS = 10

/** How far from the middle (of -1 to 1) the roll, the pitch and the yaw may be and still be at rest. */
export const REST_BAND = 0.15

/** How long a control that waits for the sticks to be at rest waits before it turns itself off (ms). */
export const REST_TIMEOUT_MS = 10_000

/** The least a centred throttle's dead zone may be (of its travel): without it the middle is a point no thumb finds. */
export const MIN_CENTRED_ZONE = 0.05

/** The four sticks of the vehicle. */
export type Stick = 'roll' | 'pitch' | 'throttle' | 'yaw'

/** The channels of the vehicle's four sticks (`RCMAP_*`). */
export interface Sticks {
  /** The roll's channel. */
  roll: number
  /** The pitch's channel. */
  pitch: number
  /** The throttle's channel. */
  throttle: number
  /** The yaw's channel. */
  yaw: number
}

/** A stick that is not at rest. */
export interface NotAtRest {
  /** Which stick. */
  stick: Stick
  /** What it reads (after the inversion), or null when the pad does not say. */
  level: number | null
}

/** The order the sticks are looked at (and told) in. */
const ORDER: readonly Stick[] = ['roll', 'pitch', 'throttle', 'yaw']

/**
 * The row that drives a channel.
 *
 * @param profile the mapping
 * @param channel the channel
 * @returns the row, or undefined when none does
 */
function driving(profile: Profile, channel: number): Row | undefined {
  return profile.rows.find(row => row.channel === channel)
}

/** What a look at the sticks is made of. */
interface Look {
  /** The mapping. */
  profile: Profile
  /** What the pad said. */
  sample: PadSample
  /** Whether the throttle's pulse is low (the way the vehicle reads "low": `isLow`): what a throttle that rests low must be. */
  throttleLow: boolean
}

/**
 * What a stick reads and which row drives it.
 *
 * @param look the mapping, the sample and whether the throttle is low
 * @param channel the vehicle's channel for the stick
 * @returns the row and the reading, or null when no row drives the channel or the pad does not say
 */
function readOf(look: Look, channel: number): { row: Row, level: number } | null {
  const row = driving(look.profile, channel)
  const level = row === undefined ? null : levelOf(row, look.sample)

  return row !== undefined && level !== null ? { row, level } : null
}

/**
 * Whether a stick that reads this is at rest: roll, pitch and yaw within the band; the throttle in its row's dead zone for a
 * spring-centred stick, low for one that rests low.
 *
 * @param stick which stick
 * @param level what it reads
 * @param row the row that drives it
 * @param look the mapping, the sample and whether the throttle is low
 * @returns true when it is at rest
 */
function atRest(stick: Stick, level: number, row: Row, look: Look): boolean {
  if (stick !== 'throttle') {
    return Math.abs(level) <= REST_BAND
  }

  return look.profile.throttleStyle === 'centred' ? Math.abs(level) <= row.deadZone : look.throttleLow
}

/**
 * The stick, if it is not at rest.
 *
 * @param stick which stick
 * @param channel the vehicle's channel for the stick
 * @param look the mapping, the sample and whether the throttle is low
 * @returns what it reads, when it is not at rest (or the pad does not say), else null
 */
function unrested(stick: Stick, channel: number, look: Look): NotAtRest | null {
  const one = readOf(look, channel)
  const level = one === null ? null : one.level

  return one !== null && atRest(stick, one.level, one.row, look) ? null : { stick, level }
}

/**
 * Which of the four sticks are not at rest. A stick that has no row or whose pad channel the pad does not say is not at rest.
 *
 * @param profile the mapping
 * @param sample what the pad said
 * @param sticks the channels of the vehicle's four sticks
 * @param throttleLow whether the throttle's pulse is low (`isLow`): what a throttle that rests at the bottom must be
 * @returns the sticks that are not at rest, in the order roll, pitch, throttle, yaw; none when all four are
 */
export function notAtRest(profile: Profile, sample: PadSample, sticks: Sticks, throttleLow: boolean): NotAtRest[] {
  const look: Look = { profile, sample, throttleLow }

  return ORDER.map(stick => unrested(stick, sticks[stick], look)).filter(found => found !== null)
}

/**
 * The words for a stick that is not at rest, once the page has the stick's name: a part of the sentence "Roll is not at the
 * middle: +0.72".
 *
 * @param level what it reads, or null
 * @returns the reading as signed text with two decimals, or a dash
 */
export function levelText(level: number | null): string {
  return level === null ? '—' : `${level >= 0 ? '+' : '-'}${Math.abs(level).toFixed(2)}`
}
