// A mapping of the first version, as the 16-channel model: sticks, switches and buttons, with a calibration.
import { describe, expect, it } from 'vitest'
import { isConfirmed } from './confirm'
import { readProfile } from './store'
import type { PadLayout } from './types'
import { TX16S_LAYOUT } from '@/testing/rcProfiles'

const TX16S = 'OpenTX Radiomaster TX16S Joystick (Vendor: 1209 Product: 4f54)'

/**
 * A mapping of the first version, as text.
 *
 * @param rows the rows
 * @param calibrated whether the wizard had marked it
 * @returns JSON
 */
function v1(rows: unknown[], calibrated = true): string {
  return JSON.stringify({ version: 1, device: TX16S, calibrated, rows })
}

const NEAR = { min: -0.95, center: 0.02, max: 0.97 }
const FAR = { min: -0.5, center: 0, max: 1 }
const stick = (channel: number, axis: number, calibration = NEAR) => (
  { kind: 'stick', channel, axis, invert: false, calibration, deadZone: 0.08, expo: 0 }
)
const switchRow = (pulses: number[]) => ({ kind: 'switch', channel: 5, axis: 5, invert: true, pulses })
const button = (n: number) => ({ kind: 'button', channel: 6, button: n, off: 1000, on: 2000 })
const four = [stick(1, 0), stick(2, 1), stick(3, 2), stick(4, 3)]

/**
 * A mapping of the first version, read for the TX16S.
 *
 * @param rows the rows
 * @param calibrated whether the wizard had marked it
 * @returns what was read
 */
function read(rows: unknown[], calibrated = true) {
  return readProfile(v1(rows, calibrated), TX16S, TX16S_LAYOUT)!
}

describe('a stick of the first version', () => {
  it('is converted when the pad is known: an axis a reads pad channel a + 1, confirmed if it was near the range', () => {
    const one = read(four)

    expect(one.converted).toBe(true)
    expect(one.lossy).toBe(false)
    expect(one.profile.rows.map(row => [row.channel, row.source])).toEqual([[1, 1], [2, 2], [3, 3], [4, 4]])
    expect(isConfirmed(one.profile, TX16S_LAYOUT)).toBe(true)
  })

  it('keeps the throttle as it was flown: a stick that rests low', () => {
    expect(read([stick(3, 2)]).profile.throttleStyle).toBe('low')
  })

  it('is not converted without the pad (where a button goes depends on its axes)', () => {
    expect(readProfile(v1([stick(1, 0)]), TX16S, null)).toBeNull()
  })

  it('is not confirmed when its calibration was far from the pad\'s own range', () => {
    const far = read([stick(1, 0, FAR)])

    expect(far.lossy).toBe(true)
    expect(isConfirmed(far.profile, TX16S_LAYOUT)).toBe(false)
  })

  it('is not confirmed when the wizard never marked it', () => {
    expect(isConfirmed(read(four, false).profile, TX16S_LAYOUT)).toBe(false)
  })
})

describe('a switch and a button of the first version', () => {
  it('has a switch\'s three pulses as the ends of its row', () => {
    const even = read([stick(1, 0), switchRow([1000, 1500, 2000])])

    const row = { channel: 5, source: 6, invert: true, deadZone: 0, expo: 0, pulseMin: 1000, pulseMax: 2000 }

    expect(even.profile.rows[1]).toEqual(row)
    expect(even.lossy).toBe(false)
  })

  it('loses a middle that is not half way, and is then not confirmed', () => {
    const odd = read([stick(1, 0), switchRow([1000, 1300, 2000])])

    expect(odd.lossy).toBe(true)
    expect(isConfirmed(odd.profile, TX16S_LAYOUT)).toBe(false)
  })

  it('puts a button after the axes: button b is pad channel axes + b + 1', () => {
    const [, row] = read([stick(1, 0), button(2)]).profile.rows

    expect(row).toMatchObject({ channel: 6, source: 11, pulseMin: 1000, pulseMax: 2000 })
  })
})

describe('a button of the first version that does not fit', () => {
  it('drops a button that falls past CH16, and is then not confirmed', () => {
    const dropped = read([stick(1, 0), button(9)])

    expect(dropped.profile.rows).toHaveLength(1)
    expect(dropped.lossy).toBe(true)
    expect(isConfirmed(dropped.profile, TX16S_LAYOUT)).toBe(false)
  })

  it('counts only the axes of the pad it is read with', () => {
    const small: PadLayout = ['axis', 'axis', 'button', 'button', ...Array.from({ length: 12 }, () => null)]
    const one = readProfile(v1([stick(1, 0), button(1)]), TX16S, small)!

    expect(one.profile.rows[1]!.source).toBe(4)
  })
})

describe('a mapping of the first version that is not whole', () => {
  it('is nothing when a row of it is not one', () => {
    expect(readProfile(v1([{ kind: 'knob', channel: 1 }]), TX16S, TX16S_LAYOUT)).toBeNull()
    expect(readProfile(v1([{ ...stick(1, 0), deadZone: null }]), TX16S, TX16S_LAYOUT)).toBeNull()
  })

  it('is left as it is for another device', () => {
    expect(readProfile(v1([stick(1, 0)]), 'another pad', TX16S_LAYOUT)).toBeNull()
  })
})
