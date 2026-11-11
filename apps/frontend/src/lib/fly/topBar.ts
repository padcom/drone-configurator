// What the top bar says, from the link and the telemetry alone (no DOM). Like everywhere, what the vehicle has not reported
// is a dash, never a made-up value: the cells show only while the link is up and a heartbeat has come, and a heartbeat
// that has gone quiet is said so in words.
import type { Connection, Telemetry } from '@/generated/app'
import { batteryText, isStale } from './telemetryCards'
import type { Translate } from './telemetryCards'
import type { Format } from '@/i18n/useFormat'

/** One of the five live cells. */
export interface Cell {
  /** Which one. */
  id: 'mode' | 'state' | 'battery' | 'gps' | 'link'
  /** Its name, in capitals. */
  label: string
  /** Its value, already formatted. */
  value: string
  /** True for an armed vehicle: the cell is filled amber (the text says ARMED too). */
  armed: boolean
  /** True when the vehicle has not reported it: `value` is a dash, which the bar gives a screen reader the words for. */
  missing: boolean
}

/** The cell of the vehicle and the link. */
export interface VehicleCell {
  /** The first line: the vehicle's type, or the state of the link when there is no vehicle to name. */
  title: string
  /** The second line. */
  sub: string
  /** How it is drawn: `ok` for a link that is up, `warn` for one that is lost or being brought back, `idle` for none. */
  tone: 'ok' | 'warn' | 'idle'
}

/** The names of MAVLink's GPS_FIX_TYPE values, in order (the messages are `telemetry.fix.<name>`). */
const FIX_NAMES = ['nogps', 'nofix', 'fix2d', 'fix3d', 'dgps', 'rtkfloat', 'rtkfixed', 'static', 'ppp']

/**
 * The battery cell: the charge when the vehicle says it, else the voltage.
 *
 * @param now the telemetry
 * @param translate looks up a message
 * @param format formats numbers
 * @returns for example "87%", or the voltage, or a dash
 */
function batteryValue(now: Telemetry, translate: Translate, format: Format): string {
  // The battery group when the vehicle sent it, else the flat fields (as the battery card does).
  const remaining = now.battery ? now.battery.remaining : now.batteryRemaining

  return remaining === undefined ? batteryText(now, translate, format) : `${format.number(remaining)}%`
}

/**
 * The GPS cell: the fix and, when the receiver says, how many satellites.
 *
 * @param now the telemetry
 * @param translate looks up a message
 * @returns for example "3D fix · 14", or a dash when no GPS group came
 */
function gpsValue(now: Telemetry, translate: Translate): string {
  const { gps } = now
  if (!gps) {
    return translate('telemetry.missing')
  }
  const fix = translate(`telemetry.fix.${FIX_NAMES[gps.fixType] ?? 'other'}`)

  return gps.satellites === undefined ? fix : `${fix} · ${gps.satellites}`
}

/**
 * Appends how old the heartbeat is, once it is stale.
 *
 * @param text what the cell says
 * @param now the telemetry
 * @param translate looks up a message
 * @returns the text, with its age when the heartbeat has gone quiet
 */
function withAge(text: string, now: Telemetry, translate: Translate): string {
  return isStale(now.heartbeatAgeMs)
    ? `${text} · ${translate('telemetry.stale', { seconds: Math.round(now.heartbeatAgeMs / 1000) })}`
    : text
}

/**
 * The five live cells: MODE, STATE, BATTERY, GPS and LINK.
 *
 * @param now the telemetry of a link that is up, or null (every cell is a dash)
 * @param translate looks up a message
 * @param format formats numbers
 * @returns the cells, in order
 */
export function cellsFor(now: Telemetry | null, translate: Translate, format: Format): Cell[] {
  const missing = translate('telemetry.missing')
  const label = (id: Cell['id']) => translate(`topBar.cell.${id}`)
  const cell = (id: Cell['id'], value: string, armed = false): Cell => {
    const dash = value === missing

    return { id, label: label(id), value, armed, missing: dash }
  }
  if (!now) {
    return (['mode', 'state', 'battery', 'gps', 'link'] as const).map(id => cell(id, missing))
  }

  return [
    cell('mode', withAge(now.mode, now, translate)),
    cell('state', withAge(translate(now.armed ? 'telemetry.armed' : 'telemetry.disarmed'), now, translate), now.armed),
    cell('battery', batteryValue(now, translate, format)),
    cell('gps', gpsValue(now, translate)),
    // Nothing measures the quality of the link yet: a dash, not a made-up percentage.
    cell('link', missing),
  ]
}

/** How each state of the link is drawn. */
const TONES: Record<Connection['state'], VehicleCell['tone']> = {
  disconnected: 'idle',
  connecting: 'idle',
  connected: 'ok',
  lost: 'warn',
  reconnecting: 'warn',
}

/**
 * The first line: the vehicle's type while the link is up, else the state of the link.
 *
 * @param connection the link's state
 * @param translate looks up a message
 * @returns the title
 */
function titleOf(connection: Connection, translate: Translate): string {
  const type = connection.state === 'connected' ? connection.vehicle?.type : undefined

  return type ?? translate(`connection.state.${connection.state}`)
}

/**
 * Which try this is, and how long until the next.
 *
 * @param connection the link's state
 * @param translate looks up a message
 * @returns for example "try 3, the next in 4 s"
 */
function retryText(connection: Connection, translate: Translate): string {
  const seconds = Math.ceil((connection.nextRetryMs ?? 0) / 1000)

  return translate('connection.retrying', { attempt: connection.attempt ?? 1, seconds })
}

/**
 * The second line: which try this is and when the next comes while the link is brought back, else the autopilot and the
 * system of the vehicle, or "No vehicle".
 *
 * @param connection the link's state
 * @param translate looks up a message
 * @returns the second line
 */
function subOf(connection: Connection, translate: Translate): string {
  if (connection.state === 'reconnecting') {
    return retryText(connection, translate)
  }

  return connection.vehicle ? translate('topBar.vehicleSub', { ...connection.vehicle }) : translate('topBar.noVehicle')
}

/**
 * The vehicle and link cell.
 *
 * @param connection the link's state
 * @param translate looks up a message
 * @returns its two lines and how it is drawn
 */
export function vehicleCellFor(connection: Connection, translate: Translate): VehicleCell {
  return { title: titleOf(connection, translate), sub: subOf(connection, translate), tone: TONES[connection.state] }
}

