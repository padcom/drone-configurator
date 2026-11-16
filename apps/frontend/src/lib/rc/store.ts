// What the RC control keeps in the settings (the backend's file): whether it is allowed (off unless the settings say on), and
// the mapping of each device, one entry for each (`rc.profile.<the device>`) as JSON. What comes back is read as untrusted: a
// profile that is not whole is no profile, and never a half of one.
import { validChannel } from './mapping'
import type { AxisCalibration, ButtonRow, Profile, Row, StickRow, SwitchRow } from './types'

/** The settings entry that says whether RC control is allowed: `on`, or anything else (or nothing) for off. */
export const RC_ALLOW_KEY = 'rc.allow'

/** The part of the key of a device's mapping that comes before the device. */
export const RC_PROFILE_PREFIX = 'rc.profile.'

/** The version of what is written. */
const VERSION = 1

/** What a value that was read is, before it is known to be anything. */
type Record_ = Record<string, unknown>

/**
 * The key a device's mapping is kept under: the device's id as lower case letters, digits and dashes, short enough for a key.
 *
 * @param device the gamepad's id string
 * @returns the key
 */
export function profileKey(device: string): string {
  const slug = device.toLowerCase().replace(/[^a-z0-9]+/gu, '-').replace(/^-|-$/gu, '').slice(0, 100)

  return `${RC_PROFILE_PREFIX}${slug}`
}

/**
 * Whether the text of the setting says on.
 *
 * @param text what the settings hold under `rc.allow`
 * @returns true only for `on`
 */
export function parseAllow(text: string | undefined): boolean {
  return text === 'on'
}

/**
 * A mapping as the text that is kept.
 *
 * @param profile the mapping
 * @returns JSON
 */
export function serialiseProfile(profile: Profile): string {
  return JSON.stringify({ version: VERSION, device: profile.device, calibrated: profile.calibrated, rows: profile.rows })
}

/**
 * Whether a value is an object.
 *
 * @param value the value
 * @returns true when it is, and not an array or null
 */
function isRecord(value: unknown): value is Record_ {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Whether a value is a number that is a number.
 *
 * @param value the value
 * @returns true for a finite number
 */
function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

/**
 * Whether the named members of a record are all numbers.
 *
 * @param v the record
 * @param keys the names
 * @returns true when they are
 */
function numbers(v: Record_, keys: readonly string[]): boolean {
  return keys.every(key => isNumber(v[key]))
}

/**
 * The axis calibration a value says.
 *
 * @param value what was read
 * @returns the calibration, or null
 */
function calibrationOf(value: unknown): AxisCalibration | null {
  if (!isRecord(value) || !numbers(value, ['min', 'center', 'max'])) {
    return null
  }

  return { min: Number(value.min), center: Number(value.center), max: Number(value.max) }
}

/**
 * A stick a value says.
 *
 * @param v the record
 * @returns the row, or null
 */
function stickOf(v: Record_): StickRow | null {
  const calibration = calibrationOf(v.calibration)
  if (calibration === null || !numbers(v, ['axis', 'deadZone', 'expo']) || typeof v.invert !== 'boolean') {
    return null
  }

  const [channel, axis, deadZone, expo] = [v.channel, v.axis, v.deadZone, v.expo].map(Number)

  return { kind: 'stick', channel: channel!, axis: axis!, invert: v.invert, calibration, deadZone: deadZone!, expo: expo! }
}

/**
 * Whether a value is three pulses.
 *
 * @param value what was read
 * @returns true for an array of three numbers
 */
function isTriple(value: unknown): value is [number, number, number] {
  return Array.isArray(value) && value.length === 3 && value.every(isNumber)
}

/**
 * A switch a value says.
 *
 * @param v the record
 * @returns the row, or null
 */
function switchOf(v: Record_): SwitchRow | null {
  const { pulses } = v
  if (!numbers(v, ['axis']) || typeof v.invert !== 'boolean' || !isTriple(pulses)) {
    return null
  }

  return { kind: 'switch', channel: Number(v.channel), axis: Number(v.axis), invert: v.invert, pulses }
}

/**
 * A button a value says.
 *
 * @param v the record
 * @returns the row, or null
 */
function buttonOf(v: Record_): ButtonRow | null {
  if (!numbers(v, ['button', 'off', 'on'])) {
    return null
  }

  return { kind: 'button', channel: Number(v.channel), button: Number(v.button), off: Number(v.off), on: Number(v.on) }
}

/** The readers of the kinds of rows. */
const READERS = new Map<string, (v: Record_) => Row | null>([['stick', stickOf], ['switch', switchOf], ['button', buttonOf]])

/**
 * Whether a value is a record with a channel of an override.
 *
 * @param value what was read
 * @returns true when it is
 */
function hasChannel(value: unknown): value is Record_ {
  return isRecord(value) && isNumber(value.channel) && validChannel(value.channel)
}

/**
 * A row a value says.
 *
 * @param value what was read
 * @returns the row, or null when it is not a row (a channel that is not one of the 16 is not)
 */
function rowOf(value: unknown): Row | null {
  if (!hasChannel(value)) {
    return null
  }
  const read = READERS.get(String(value.kind))

  return read === undefined ? null : read(value)
}

/**
 * The JSON a text says.
 *
 * @param text what was kept
 * @returns the value, or null for none or for text that is not JSON
 */
function jsonOf(text: string | undefined): unknown {
  try {
    return text === undefined ? null : JSON.parse(text)
  } catch {
    return null
  }
}

/**
 * Whether what was read is a mapping of this version, for this device, with a list of rows.
 *
 * @param data what was read
 * @param device the device the mapping must be for
 * @returns true when it is
 */
function isStored(data: unknown, device: string): data is Record_ & { rows: unknown[] } {
  return isRecord(data) && data.version === VERSION && data.device === device && Array.isArray(data.rows)
}

/**
 * The mapping the text says.
 *
 * @param text what the settings hold under a device's key
 * @param device the device the mapping is for
 * @returns the mapping, or null when there is none, it is not JSON, is of another version or device, or any row of it is wrong
 */
export function parseProfile(text: string | undefined, device: string): Profile | null {
  const data = jsonOf(text)
  if (!isStored(data, device)) {
    return null
  }
  const rows = data.rows.map(rowOf)

  return rows.every(row => row !== null) ? { device, calibrated: data.calibrated === true, rows } : null
}
