// A mapping of the first version (sticks, switches and buttons of the browser's Gamepad API, each stick with a calibration) as
// a mapping of the 16-channel model, read in memory and written again only when the person saves: an axis `a` is pad channel
// `a + 1`, a button `b` is pad channel `axes + b + 1` (dropped when that is past CH16), a switch's three pulses are the ends of
// its row (a middle that is not half way is lost), and the calibration goes (nothing is calibrated in the app any more). The
// throttle stays as it was flown, a stick that rests low. It is confirmed again only when nothing was lost, the old wizard had
// marked it, and every stick's calibration was near the pad's own range (-1, 0, 1: dropping it moves a pulse a few percent).
import { keyOf } from './confirm'
import { type Record_, hasChannel, isNumber, isRecord, numbers } from './parse'
import type { PadLayout, Profile, Row } from './types'

/** A mapping that was read: what it is, and whether it was converted from the first version (the person must look at it). */
export interface StoredProfile {
  /** The mapping. */
  profile: Profile
  /** Whether it was converted from version 1 (it is not written again until the person saves). */
  converted: boolean
  /** Whether the conversion lost something (a free middle pulse, a button that no longer fits): then it is not confirmed. */
  lossy: boolean
}

/** What a version 1 row became, and what it lost. */
interface Converted {
  /** The row, or null when it has no place in 16 channels. */
  row: Row | null
  /** Whether something was lost (or the calibration was far from the pad's own range). */
  lossy: boolean
}

/** The members of a calibration. */
const CALIBRATION = ['min', 'center', 'max']

/**
 * How many axes a pad has (they are CH1 on, the buttons follow them).
 *
 * @param layout what each channel of the pad is
 * @returns the count
 */
function axesOf(layout: PadLayout): number {
  return layout.filter(kind => kind === 'axis').length
}

/**
 * Whether a version 1 stick's calibration was close to the pad's own range.
 *
 * @param v the stick's record
 * @returns true when it was
 */
function nearDefault(v: Record_): boolean {
  const c = v.calibration

  const gaps = isRecord(c) && numbers(c, CALIBRATION) ? [Number(c.min) + 1, Number(c.max) - 1, Number(c.center)] : [Infinity]

  return gaps.every(gap => Math.abs(gap) <= 0.1)
}

/**
 * A version 1 stick.
 *
 * @param v the record
 * @returns the row, or null when it is not a stick
 */
function fromStick(v: Record_): Converted | null {
  const [channel, axis, deadZone, expo] = [v.channel, v.axis, v.deadZone, v.expo].map(Number)
  const ok = numbers(v, ['axis', 'deadZone', 'expo']) && typeof v.invert === 'boolean'
  const row: Row = { channel: channel!, source: axis! + 1, invert: v.invert === true, deadZone: deadZone!, expo: expo! }

  return ok ? { row, lossy: !nearDefault(v) } : null
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
 * A version 1 switch on an axis.
 *
 * @param v the record
 * @returns the row, or null when it is not a switch
 */
function fromSwitch(v: Record_): Converted | null {
  const { pulses } = v
  if (!numbers(v, ['axis']) || typeof v.invert !== 'boolean' || !isTriple(pulses)) {
    return null
  }
  const [low, middle, high] = pulses
  const row: Row = { channel: Number(v.channel), source: Number(v.axis) + 1, invert: v.invert, deadZone: 0, expo: 0 }

  return { row: { ...row, pulseMin: low, pulseMax: high }, lossy: middle !== (low + high) / 2 }
}

/**
 * A version 1 button.
 *
 * @param v the record
 * @param axes how many axes the pad has
 * @returns the row (null when it falls past CH16), or null when it is not a button
 */
function fromButton(v: Record_, axes: number): Converted | null {
  if (!numbers(v, ['button', 'off', 'on'])) {
    return null
  }
  const source = axes + Number(v.button) + 1
  const fits = source >= 1 && source <= 16
  const plain: Row = { channel: Number(v.channel), source, invert: false, deadZone: 0, expo: 0 }
  const row: Row = { ...plain, pulseMin: Number(v.off), pulseMax: Number(v.on) }

  return { row: fits ? row : null, lossy: !fits }
}

/**
 * A version 1 row.
 *
 * @param value what was read
 * @param axes how many axes the pad has
 * @returns the row and what it lost, or null when it is not a row at all
 */
function convertRow(value: unknown, axes: number): Converted | null {
  if (!hasChannel(value)) {
    return null
  }
  const kinds: Record<string, (v: Record_) => Converted | null> = {
    stick: fromStick,
    switch: fromSwitch,
    button: v => fromButton(v, axes),
  }
  const read = kinds[String(value.kind)]

  return read === undefined ? null : read(value)
}

/**
 * The mapping the converted rows make.
 *
 * @param converted the rows
 * @param calibrated whether the wizard had marked the old mapping
 * @param device the device
 * @param layout what each channel of the pad is now
 * @returns the mapping
 */
function assemble(converted: Converted[], calibrated: boolean, device: string, layout: PadLayout): StoredProfile {
  const rows = converted.flatMap(one => (one.row === null ? [] : [one.row]))
  const lossy = !calibrated || converted.some(one => one.lossy || one.row === null)
  const profile: Profile = { device, rows, throttleStyle: 'low', confirmedKey: null }

  return { profile: lossy ? profile : { ...profile, confirmedKey: keyOf(profile, layout) }, converted: true, lossy }
}

/**
 * Whether a row was converted.
 *
 * @param one what `convertRow` said
 * @returns true when it is a row
 */
function isConverted(one: Converted | null): one is Converted {
  return one !== null
}

/**
 * The mapping of version 1 that a record says, as version 2 (it needs the pad: where its buttons go depends on its axes).
 *
 * @param data what was read
 * @param device the device the mapping must be for
 * @param layout what each channel of the pad is now
 * @returns the mapping with whether it lost something, or null when a row is not one
 */
export function readV1(data: Record_ & { rows: unknown[] }, device: string, layout: PadLayout): StoredProfile | null {
  const converted = data.rows.map(row => convertRow(row, axesOf(layout)))

  return converted.every(isConverted) ? assemble(converted, data.calibrated === true, device, layout) : null
}
