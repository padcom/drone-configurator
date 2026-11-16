import { describe, expect, it } from 'vitest'
import { calibrated } from './edits'
import { RC_PROFILE_PREFIX, parseAllow, parseProfile, profileKey, serialiseProfile } from './store'
import { suggestedProfile } from './suggest'
import type { Profile } from './types'

const TX16S = 'OpenTX Radiomaster TX16S Joystick (Vendor: 1209 Product: 4f54)'

/**
 * A mapping with one row of each kind.
 *
 * @returns the mapping
 */
function full(): Profile {
  const base = calibrated(suggestedProfile(TX16S, null), new Map([[0, { min: -0.9, center: 0.05, max: 0.95 }]]))

  return {
    ...base,
    rows: [
      ...base.rows,
      { kind: 'switch', channel: 5, axis: 5, invert: true, pulses: [1000, 1500, 2000] },
      { kind: 'button', channel: 6, button: 2, off: 1000, on: 2000 },
    ],
  }
}

describe('the key of a mapping', () => {
  it('is the device\'s id as letters, digits and dashes, and short enough for a key', () => {
    expect(profileKey(TX16S)).toBe('rc.profile.opentx-radiomaster-tx16s-joystick-vendor-1209-product-4f54')
    expect(profileKey('  !!x!!  ')).toBe(`${RC_PROFILE_PREFIX}x`)
    expect(profileKey('a'.repeat(500)).length).toBeLessThanOrEqual(128)
  })
})

describe('what is kept for a mapping', () => {
  it('reads back what was written, rows of every kind, and whether it was calibrated', () => {
    const profile = full()

    expect(parseProfile(serialiseProfile(profile), TX16S)).toEqual(profile)
    expect(parseProfile(serialiseProfile({ ...profile, calibrated: false }), TX16S)?.calibrated).toBe(false)
  })
})

describe('what is kept for another device or another version', () => {
  it('is nothing for a device that has none, text that is not JSON, another version or another device', () => {
    const text = serialiseProfile(full())

    expect(parseProfile(undefined, TX16S)).toBeNull()
    expect(parseProfile('{', TX16S)).toBeNull()
    expect(parseProfile('[]', TX16S)).toBeNull()
    expect(parseProfile(text.replace('"version":1', '"version":2'), TX16S)).toBeNull()
    expect(parseProfile(text, 'another pad')).toBeNull()
  })

  it('is nothing when any row is not whole: a channel not of the 16, a number that is not, a kind that is not known', () => {
    const rows = (change: (row: Record<string, unknown>) => void) => {
      const data = JSON.parse(serialiseProfile(full())) as { rows: Record<string, unknown>[] }

      change(data.rows[0]!)

      return JSON.stringify(data)
    }

    expect(parseProfile(rows(row => { row.channel = 17 }), TX16S)).toBeNull()
    expect(parseProfile(rows(row => { row.channel = '3' }), TX16S)).toBeNull()
    expect(parseProfile(rows(row => { row.deadZone = null }), TX16S)).toBeNull()
    expect(parseProfile(rows(row => { row.invert = 1 }), TX16S)).toBeNull()
    expect(parseProfile(rows(row => { row.kind = 'knob' }), TX16S)).toBeNull()
    expect(parseProfile(rows(row => { row.calibration = { min: 0 } }), TX16S)).toBeNull()
  })
})

describe('what is kept for the rows of a mapping that are wrong', () => {
  it('is nothing for a switch with other than three pulses, or a button with a pulse that is not a number', () => {
    const data = JSON.parse(serialiseProfile(full())) as { rows: Record<string, unknown>[] }
    data.rows[4]!.pulses = [1000, 2000]

    expect(parseProfile(JSON.stringify(data), TX16S)).toBeNull()
    data.rows[4]!.pulses = [1000, 1500, 2000]
    data.rows[5]!.on = 'high'
    expect(parseProfile(JSON.stringify(data), TX16S)).toBeNull()
  })
})

describe('whether control is allowed', () => {
  it('is on only when the settings say on: a missing entry, and anything else, is off', () => {
    expect(parseAllow('on')).toBe(true)
    expect(parseAllow('off')).toBe(false)
    expect(parseAllow(undefined)).toBe(false)
    expect(parseAllow('ON')).toBe(false)
    expect(parseAllow('')).toBe(false)
  })
})
