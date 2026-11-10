// The six cards of the Fly aside (BATTERY, WIND, GPS, LINK, EKF, VIBRATION), from a Telemetry alone (no DOM). Each says which of
// the truth states its value is in (the groups carry their own age); a group the vehicle has not sent is "never reported",
// never a made-up zero.
import type { Telemetry } from './generated/app'
import { isStale } from './telemetryCards'
import type { Translate } from './telemetryCards'
import type { Format } from './useFormat'

/** The state of a card's value, as `TruthValue` has them. */
export type CardState = 'live' | 'stale' | 'last-heard' | 'never'

/** One card of the aside. */
export interface FlyCard {
  /** Which one. */
  id: 'battery' | 'wind' | 'gps' | 'link' | 'ekf' | 'vibration'
  /** Its name, in capitals. */
  label: string
  /** The value, or undefined when it has not been reported. */
  value?: string
  /** The line under it. */
  help?: string
  /** How old the value is, once it is stale. */
  ageMs?: number
  /** What the value is: live, stale, the last that was heard, or never reported. */
  state: CardState
}

/** What a card needs to be drawn from a group. */
interface Reading {
  /** The value. */
  value: string
  /** The line under it. */
  help?: string
  /** How long ago the group arrived. */
  ageMs?: number
}

/** Reads one card from the telemetry: undefined when the vehicle sent nothing for it. */
type Reader = (now: Telemetry, t: Translate, f: Format) => Reading | undefined

/** The names of MAVLink's GPS_FIX_TYPE values, in order. */
const FIX_NAMES = ['nogps', 'nofix', 'fix2d', 'fix3d', 'dgps', 'rtkfloat', 'rtkfixed', 'static', 'ppp']

/** Below this the estimator's variances are healthy (ArduPilot warns at 0.5 and fails at 0.8). */
const EKF_WARN = 0.5

/** From this on the estimator is failing. */
const EKF_FAIL = 0.8

/**
 * The voltage as the battery card says it.
 *
 * @param now the telemetry
 * @param t looks up a message
 * @param f formats numbers
 * @returns the voltage with its unit, or an empty string when the vehicle has not reported it
 */
function voltageText(now: Telemetry, t: Translate, f: Format): string {
  const voltage = now.battery ? now.battery.voltage : now.batteryVoltage

  return voltage === undefined ? '' : t('telemetry.value.voltage', { voltage: f.number(voltage, 2) })
}

/**
 * The charge as the battery card says it.
 *
 * @param now the telemetry
 * @param f formats numbers
 * @returns the percent, or an empty string when the vehicle has not reported it
 */
function chargeText(now: Telemetry, f: Format): string {
  const remaining = now.battery ? now.battery.remaining : now.batteryRemaining

  return remaining === undefined ? '' : `${f.number(remaining)}%`
}

/**
 * The current as the battery card says it.
 *
 * @param now the telemetry
 * @param f formats numbers
 * @returns the current in amperes, or an empty string when the vehicle has not reported it
 */
function currentText(now: Telemetry, f: Format): string {
  const current = now.battery?.current

  return current === undefined ? '' : `${f.number(current, 1)} A`
}

/**
 * The battery card: the charge, with the voltage and the current under it; the voltage alone when the charge is not known.
 *
 * @param now the telemetry
 * @param t looks up a message
 * @param f formats numbers
 * @returns the reading, or undefined when there is neither charge nor voltage
 */
const batteryReader: Reader = (now, t, f) => {
  const lines = [chargeText(now, f), voltageText(now, t, f), currentText(now, f)].filter(Boolean)

  return lines.length === 0 ? undefined : { value: lines[0] ?? '', help: lines.slice(1).join(' · '), ageMs: now.battery?.ageMs }
}

/**
 * The wind card: the speed, and where it comes from.
 *
 * @param now the telemetry
 * @param t looks up a message
 * @param f formats numbers
 * @returns the reading, or undefined without a wind group
 */
const windReader: Reader = (now, t, f) => {
  const { wind } = now

  return wind && {
    value: t('flyCards.wind', { speed: f.number(wind.speed, 1) }),
    help: t('flyCards.windFrom', { degrees: f.number(wind.direction) }),
    ageMs: wind.ageMs,
  }
}

/**
 * The GPS card: the fix and the satellites, and the HDOP under it.
 *
 * @param now the telemetry
 * @param t looks up a message
 * @param f formats numbers
 * @returns the reading, or undefined without a GPS group
 */
const gpsReader: Reader = (now, t, f) => {
  const { gps } = now
  if (!gps) {
    return undefined
  }
  const fix = [t(`telemetry.fix.${FIX_NAMES[gps.fixType] ?? 'other'}`), gps.satellites].filter(part => part !== undefined)

  return {
    value: fix.join(' · '),
    help: gps.hdop === undefined ? undefined : t('flyCards.hdop', { hdop: f.number(gps.hdop, 1) }),
    ageMs: gps.ageMs,
  }
}

/**
 * The word for the worst variance of the estimator. (It takes the worst of four variances, which turns "failing" on earlier
 * than ArduPilot's own combined check: on the cautious side, on purpose.)
 *
 * @param worst the highest variance
 * @returns `failing`, `degraded` or `healthy`
 */
function ekfWord(worst: number): string {
  if (worst >= EKF_FAIL) {
    return 'failing'
  }

  return worst >= EKF_WARN ? 'degraded' : 'healthy'
}

/**
 * The estimator card: a word for the worst of its variances, and the number under it.
 *
 * @param now the telemetry
 * @param t looks up a message
 * @param f formats numbers
 * @returns the reading, or undefined without an estimator group
 */
const ekfReader: Reader = (now, t, f) => {
  const { ekf } = now
  if (!ekf) {
    return undefined
  }
  const worst = Math.max(ekf.velocityVariance, ekf.positionHorizVariance, ekf.positionVertVariance, ekf.compassVariance)

  return {
    value: t(`flyCards.ekf.${ekfWord(worst)}`),
    help: t('flyCards.worstVariance', { variance: f.number(worst, 2) }),
    ageMs: ekf.ageMs,
  }
}

/**
 * The vibration card: the worst axis, and the three under it.
 *
 * @param now the telemetry
 * @param t looks up a message
 * @param f formats numbers
 * @returns the reading, or undefined without a vibration group
 */
const vibrationReader: Reader = (now, t, f) => {
  const { vibration } = now
  if (!vibration) {
    return undefined
  }
  const [x, y, z] = [vibration.x, vibration.y, vibration.z].map(axis => f.number(axis, 0))

  return {
    value: t('flyCards.vibration', { value: f.number(Math.max(vibration.x, vibration.y, vibration.z), 0) }),
    help: t('flyCards.axes', { x, y, z }),
    ageMs: vibration.ageMs,
  }
}

// Nothing measures the quality of the link yet: its card is never reported.
const linkReader: Reader = () => undefined

const READERS: [FlyCard['id'], Reader][] = [
  ['battery', batteryReader],
  ['wind', windReader],
  ['gps', gpsReader],
  ['link', linkReader],
  ['ekf', ekfReader],
  ['vibration', vibrationReader],
]

/**
 * Whether a value that arrived `ageMs` ago is still live.
 *
 * @param ageMs how long ago it arrived, if it has an age
 * @returns `stale` once it is too old, else `live`
 */
function freshness(ageMs: number | undefined): CardState {
  return isStale(ageMs ?? 0) ? 'stale' : 'live'
}

/**
 * The state of a card's value.
 *
 * @param reading the reading, if the vehicle sent one
 * @param silent whether the vehicle is not heard from (the link is being brought back, or the heartbeat has gone quiet)
 * @returns the state
 */
function stateOf(reading: Reading | undefined, silent: boolean): CardState {
  if (!reading) {
    return 'never'
  }

  return silent ? 'last-heard' : freshness(reading.ageMs)
}

/**
 * The six cards.
 *
 * @param now the telemetry, or null without a vehicle (every card is then never reported)
 * @param reconnecting whether the link is being brought back
 * @param t looks up a message
 * @param f formats numbers
 * @returns the cards, in order
 */
export function flyCards(now: Telemetry | null, reconnecting: boolean, t: Translate, f: Format): FlyCard[] {
  const silent = now !== null && (reconnecting || isStale(now.heartbeatAgeMs))

  return READERS.map(([id, read]) => {
    const reading = now ? read(now, t, f) : undefined
    const card: FlyCard = { id, label: t(`flyCards.label.${id}`), state: stateOf(reading, silent) }

    return reading ? { ...card, value: reading.value, help: reading.help, ageMs: reading.ageMs } : card
  })
}
