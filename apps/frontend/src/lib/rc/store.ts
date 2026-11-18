// What the RC control keeps in the settings (the backend's file): whether it is allowed (off unless the settings say on), and
// the mapping of each device, one entry for each (`rc.profile.<the device>`) as JSON. What comes back is read as untrusted: a
// profile that is not whole is no profile, and never a half of one. Version 2 is the 16-channel model (a row reads a pad
// channel, nothing is calibrated, the mapping is confirmed and has a throttle style); version 1 is converted on reading
// (`migrate.ts`), in memory, and written again only when the person saves.
import { readV1 } from './migrate'
import type { StoredProfile } from './migrate'
import { type Record_, hasChannel, isRecord, numbers } from './parse'
import { DEFAULT_THROTTLE_STYLE, type PadLayout, type Profile, type Row, type ThrottleStyle } from './types'

export type { StoredProfile } from './migrate'

/** The settings entry that says whether RC control is allowed: `on`, or anything else (or nothing) for off. */
export const RC_ALLOW_KEY = 'rc.allow'

/**
 * The settings entry that says whether the sticks may make the vehicle's own arm and disarm gesture (the rudder guard is lifted):
 * `on`, or anything else (or nothing) for off. It is read like `rc.allow` (`parseAllow`): only the exact text `on` is on.
 */
export const RC_RUDDER_ARM_KEY = 'rc.rudderArm'

/** The part of the key of a device's mapping that comes before the device. */
export const RC_PROFILE_PREFIX = 'rc.profile.'

/** The version of what is written. */
const VERSION = 2

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
  const { device, throttleStyle, confirmedKey, rows } = profile

  return JSON.stringify({ version: VERSION, device, throttleStyle, confirmedKey, rows })
}

/**
 * The ends of a row a record says: both, or neither (one end alone is not a row).
 *
 * @param v the record
 * @returns the ends, `{}` for none, or null when they are not both numbers
 */
function endsOf(v: Record_): { pulseMin?: number, pulseMax?: number } | null {
  if (v.pulseMin === undefined && v.pulseMax === undefined) {
    return {}
  }

  return numbers(v, ['pulseMin', 'pulseMax']) ? { pulseMin: Number(v.pulseMin), pulseMax: Number(v.pulseMax) } : null
}

/**
 * Whether a record has what a row has besides its channel and its ends.
 *
 * @param v the record
 * @returns true when it has
 */
function isPlainRow(v: Record_): boolean {
  return numbers(v, ['source', 'deadZone', 'expo']) && typeof v.invert === 'boolean'
}

/**
 * A row a value of version 2 says.
 *
 * @param value what was read
 * @returns the row, or null when it is not one (a channel that is not one of the 16 is not)
 */
function rowOf(value: unknown): Row | null {
  if (!hasChannel(value) || !isPlainRow(value)) {
    return null
  }
  const ends = endsOf(value)
  const [channel, source, deadZone, expo] = [value.channel, value.source, value.deadZone, value.expo].map(Number)

  const row: Row = { channel: channel!, source: source!, invert: value.invert === true, deadZone: deadZone!, expo: expo! }

  return ends === null ? null : { ...row, ...ends }
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
 * The throttle style a value says.
 *
 * @param value what was read
 * @returns the style, or the default for anything else
 */
function styleOf(value: unknown): ThrottleStyle {
  return value === 'centred' || value === 'low' ? value : DEFAULT_THROTTLE_STYLE
}

/**
 * The mapping of version 2 that a record says.
 *
 * @param data what was read
 * @param device the device the mapping must be for
 * @returns the mapping, or null when any row of it is wrong
 */
function readV2(data: Record_ & { rows: unknown[] }, device: string): StoredProfile | null {
  const rows = data.rows.map(rowOf)
  const confirmedKey = typeof data.confirmedKey === 'string' ? data.confirmedKey : null
  const throttleStyle = styleOf(data.throttleStyle)
  const profile: Profile = { device, rows: rows.filter(row => row !== null), throttleStyle, confirmedKey }

  return rows.every(row => row !== null) ? { profile, converted: false, lossy: false } : null
}

/**
 * Whether what was read is a mapping for this device, with a list of rows.
 *
 * @param data what was read
 * @param device the device the mapping must be for
 * @returns true when it is
 */
function isStored(data: unknown, device: string): data is Record_ & { rows: unknown[] } {
  return isRecord(data) && data.device === device && Array.isArray(data.rows)
}

/**
 * A mapping of the first version, when the pad is known.
 *
 * @param data what was read
 * @param device the device
 * @param layout what each channel of the pad is now, or null
 * @returns the converted mapping, or null
 */
function readOld(data: Record_ & { rows: unknown[] }, device: string, layout: PadLayout | null): StoredProfile | null {
  return data.version === 1 && layout !== null ? readV1(data, device, layout) : null
}

/**
 * The mapping the text says, with whether it was converted from the first version.
 *
 * @param text what the settings hold under a device's key
 * @param device the device the mapping is for
 * @param layout what each channel of the pad is now, or null when the pad is not read (a mapping of version 1 needs it)
 * @returns the mapping, or null when there is none, it is not JSON, is of another version or device, or any row of it is wrong
 */
export function readProfile(text: string | undefined, device: string, layout: PadLayout | null): StoredProfile | null {
  const data = jsonOf(text)
  if (!isStored(data, device)) {
    return null
  }

  return data.version === VERSION ? readV2(data, device) : readOld(data, device, layout)
}

/**
 * The mapping the text says.
 *
 * @param text what the settings hold under a device's key
 * @param device the device the mapping is for
 * @param layout what each channel of the pad is now, or null
 * @returns the mapping, or null (see `readProfile`)
 */
export function parseProfile(text: string | undefined, device: string, layout: PadLayout | null = null): Profile | null {
  return readProfile(text, device, layout)?.profile ?? null
}
