// What the telemetry cards say, from a Telemetry alone (no DOM). Vue's templates escape the text; the words come
// from the translations and the numbers from the formatters.
import type { Telemetry } from './generated/app'
import type { Format } from './useFormat'

/** Looks up a message, with named values (what `useI18n().t` does). */
export type Translate = (key: string, named?: Record<string, unknown>) => string

/** One card: a label, its value, and whether to draw attention to it. */
export interface Card {
  /** What the value is. */
  label: string
  /** The value, already formatted. */
  value: string
  /** True for a state worth noticing (armed, a stale heartbeat or value). */
  warn: boolean
  /** True when the value is older than `STALE_MS` (its text says so too, so the mark is not colour alone). */
  stale: boolean
}

/** How old a value may be before the cards call it stale: messages come at 1 Hz or faster, so three missed ones. */
export const STALE_MS = 3000

/**
 * Whether a value that arrived `ageMs` ago is too old to trust.
 *
 * @param ageMs how long ago it arrived
 * @param thresholdMs the age above which it is stale
 * @returns true when it is stale
 */
export function isStale(ageMs: number, thresholdMs = STALE_MS): boolean {
  return ageMs > thresholdMs
}

/**
 * A card for a value with an age: stale values say so in words, and are marked.
 *
 * @param label what the value is
 * @param value the formatted value
 * @param ageMs how long ago it arrived, or undefined when the value has no age (nothing to mark)
 * @param translate looks up a message
 * @returns the card
 */
function aged(label: string, value: string, ageMs: number | undefined, translate: Translate): Card {
  if (ageMs === undefined || !isStale(ageMs)) {
    return { label, value, warn: false, stale: false }
  }
  const stale = translate('telemetry.stale', { seconds: Math.round(ageMs / 1000) })

  return { label, value: `${value} · ${stale}`, warn: true, stale: true }
}

/**
 * The battery values: the battery group when the vehicle sent it, else the flat fields.
 *
 * @param t the telemetry
 * @returns voltage and percent remaining, each absent when unknown
 */
const batteryOf = (t: Telemetry) => t.battery ?? { voltage: t.batteryVoltage, remaining: t.batteryRemaining }

/**
 * The attitude: the attitude group when the vehicle sent it, else the flat fields.
 *
 * @param t the telemetry
 * @returns roll, pitch and yaw in degrees, each absent when unknown
 */
const attitudeOf = (t: Telemetry) => t.attitude ?? t

/**
 * The battery card's text.
 *
 * @param t the telemetry
 * @param translate looks up a message
 * @param format formats numbers
 * @returns voltage and remaining charge, or a dash (what the vehicle hasn't reported is never a made-up zero)
 */
export function batteryText(t: Telemetry, translate: Translate, format: Format): string {
  const { voltage: volts, remaining } = batteryOf(t)
  if (volts === undefined) {
    return translate('telemetry.missing')
  }
  const voltage = format.number(volts, 2)

  return remaining === undefined
    ? translate('telemetry.value.voltage', { voltage })
    : translate('telemetry.value.voltageAndCharge', { voltage, percent: format.number(remaining) })
}

/**
 * The attitude card's text.
 *
 * @param t the telemetry
 * @param translate looks up a message
 * @param format formats numbers
 * @returns roll, pitch and yaw, or a dash until all three are known
 */
export function attitudeText(t: Telemetry, translate: Translate, format: Format): string {
  const { roll, pitch, yaw } = attitudeOf(t)
  if (roll === undefined || pitch === undefined || yaw === undefined) {
    return translate('telemetry.missing')
  }

  return translate('telemetry.value.attitude', {
    roll: format.number(roll, 1),
    pitch: format.number(pitch, 1),
    yaw: format.number(yaw),
  })
}

/** The names of MAVLink's GPS_FIX_TYPE values, in order (the messages are `telemetry.fix.<name>`). */
const FIX_NAMES = ['nogps', 'nofix', 'fix2d', 'fix3d', 'dgps', 'rtkfloat', 'rtkfixed', 'static', 'ppp']

/**
 * The GPS card's text: the fix and, when the receiver says, how many satellites.
 *
 * @param gps the GPS group
 * @param translate looks up a message
 * @returns for example "3D fix · 12 satellites"
 */
function gpsText(gps: NonNullable<Telemetry['gps']>, translate: Translate): string {
  const fix = translate(`telemetry.fix.${FIX_NAMES[gps.fixType] ?? 'other'}`)

  return gps.satellites === undefined ? fix : translate('telemetry.value.gps', { fix, satellites: gps.satellites })
}

/**
 * The position card's text: where, and how high above home.
 *
 * @param position the position group
 * @param translate looks up a message
 * @param format formats numbers
 * @returns for example "47.397742° 8.545594° · 20.0 m above home"
 */
function positionText(position: NonNullable<Telemetry['position']>, translate: Translate, format: Format): string {
  return translate('telemetry.value.position', {
    lat: format.number(position.lat, 6),
    lon: format.number(position.lon, 6),
    height: format.number(position.relativeAltitude, 1),
  })
}

/**
 * The speed card's text.
 *
 * @param speed the speed group
 * @param translate looks up a message
 * @param format formats numbers
 * @returns ground speed, air speed and climb rate
 */
function speedText(speed: NonNullable<Telemetry['speed']>, translate: Translate, format: Format): string {
  return translate('telemetry.value.speed', {
    ground: format.number(speed.groundspeed, 1),
    air: format.number(speed.airspeed, 1),
    climb: format.number(speed.climb, 1),
  })
}

/**
 * The cards of the groups the vehicle has sent: none for a group that is absent (nothing is shown that was
 * not reported; the full table of values is its own screen).
 *
 * @param t the telemetry
 * @param translate looks up a message
 * @param format formats numbers
 * @returns the position, GPS and speed cards that have data
 */
function groupCards(t: Telemetry, translate: Translate, format: Format): Card[] {
  const { position, gps, speed } = t
  const cards: Card[] = []
  if (position) {
    const value = positionText(position, translate, format)
    cards.push(aged(translate('telemetry.card.position'), value, position.ageMs, translate))
  }
  if (gps) {
    cards.push(aged(translate('telemetry.card.gps'), gpsText(gps, translate), gps.ageMs, translate))
  }
  if (speed) {
    cards.push(aged(translate('telemetry.card.speed'), speedText(speed, translate, format), speed.ageMs, translate))
  }

  return cards
}

/**
 * Heartbeat, mode, armed state, battery and attitude as cards, then the cards of the other groups that have data.
 *
 * @param t the telemetry
 * @param translate looks up a message
 * @param format formats numbers
 * @returns the cards, in display order
 */
export function cardsFor(t: Telemetry, translate: Translate, format: Format): Card[] {
  const heartbeatStale = isStale(t.heartbeatAgeMs)

  return [
    { label: translate('telemetry.card.mode'), value: t.mode, warn: false, stale: false },
    {
      label: translate('telemetry.card.state'),
      value: translate(t.armed ? 'telemetry.armed' : 'telemetry.disarmed'),
      warn: t.armed,
      stale: false,
    },
    aged(translate('telemetry.card.battery'), batteryText(t, translate, format), t.battery?.ageMs, translate),
    aged(translate('telemetry.card.attitude'), attitudeText(t, translate, format), t.attitude?.ageMs, translate),
    ...groupCards(t, translate, format),
    {
      label: translate('telemetry.card.heartbeat'),
      value: translate('telemetry.value.heartbeatAge', { ms: t.heartbeatAgeMs }),
      warn: heartbeatStale,
      stale: heartbeatStale,
    },
  ]
}
