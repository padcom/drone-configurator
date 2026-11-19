import { describe, expect, it } from 'vitest'
import { isConfirmed } from './confirm'
import { RC_PROFILE_PREFIX, parseAllow, parseProfile, profileKey, serialiseProfile } from './store'
import { newRow, suggestedProfile } from './suggest'
import type { Profile } from './types'
import { TX16S_LAYOUT, confirmedSuggestion } from '@/testing/rcProfiles'

const TX16S = 'OpenTX Radiomaster TX16S Joystick (Vendor: 1209 Product: 4f54)'

/**
 * A confirmed mapping with a row of every shape: a stick, one with ends and one inverted.
 *
 * @returns the mapping
 */
function full(): Profile {
  const base = confirmedSuggestion(TX16S, 'centred')
  const ended = { ...newRow(5, 6), invert: true, deadZone: 0, pulseMin: 1000, pulseMax: 2000 }

  return { ...base, rows: [...base.rows, ended, { ...newRow(6, 9), expo: 0.25 }] }
}

/**
 * The text of the full mapping, with a change made to its first row.
 *
 * @param change what to do to the row
 * @returns JSON
 */
function withFirstRow(change: (row: Record<string, unknown>) => void): string {
  const data = JSON.parse(serialiseProfile(full())) as { rows: Record<string, unknown>[] }

  change(data.rows[0]!)

  return JSON.stringify(data)
}

describe('the key of a mapping', () => {
  it('is the device\'s id as letters, digits and dashes, and short enough for a key', () => {
    expect(profileKey(TX16S)).toBe('rc.profile.opentx-radiomaster-tx16s-joystick-vendor-1209-product-4f54')
    expect(profileKey('  !!x!!  ')).toBe(`${RC_PROFILE_PREFIX}x`)
    expect(profileKey('a'.repeat(500)).length).toBeLessThanOrEqual(128)
  })
})

describe('what is kept for a mapping', () => {
  it('reads back what was written: the rows, the throttle style and what was confirmed', () => {
    const profile = full()

    expect(parseProfile(serialiseProfile(profile), TX16S)).toEqual(profile)
    expect(parseProfile(serialiseProfile({ ...profile, throttleStyle: 'low' }), TX16S)?.throttleStyle).toBe('low')
    expect(parseProfile(serialiseProfile({ ...profile, confirmedKey: null }), TX16S)?.confirmedKey).toBeNull()
  })

  it('is confirmed again only for the pad it was confirmed for (the key says which)', () => {
    const profile = parseProfile(serialiseProfile(confirmedSuggestion(TX16S)), TX16S)!

    expect(isConfirmed(profile, TX16S_LAYOUT)).toBe(true)
    expect(isConfirmed(profile, TX16S_LAYOUT.slice(0, 15))).toBe(false)
  })

  it('has the default throttle style for a style that is not one, and is written as version 2', () => {
    const data = JSON.parse(serialiseProfile(full())) as Record<string, unknown>

    expect(data.version).toBe(2)
    expect(parseProfile(JSON.stringify({ ...data, throttleStyle: 'sideways' }), TX16S)?.throttleStyle).toBe('centred')
  })
})

describe('what is kept for another device or another version', () => {
  it('is nothing for a device that has none, text that is not JSON, another version or another device', () => {
    const text = serialiseProfile(full())

    expect(parseProfile(undefined, TX16S)).toBeNull()
    expect(parseProfile('{', TX16S)).toBeNull()
    expect(parseProfile('[]', TX16S)).toBeNull()
    expect(parseProfile(text.replace('"version":2', '"version":3'), TX16S)).toBeNull()
    expect(parseProfile(text, 'another pad')).toBeNull()
  })

  it('is nothing when any row is not whole: a channel not of the 16, a number that is not', () => {
    expect(parseProfile(withFirstRow(row => { row.channel = 17 }), TX16S)).toBeNull()
    expect(parseProfile(withFirstRow(row => { row.channel = '3' }), TX16S)).toBeNull()
    expect(parseProfile(withFirstRow(row => { row.deadZone = null }), TX16S)).toBeNull()
    expect(parseProfile(withFirstRow(row => { row.source = 'x' }), TX16S)).toBeNull()
  })

  it('is nothing when a row is not whole: a flag that is not, an end with no other', () => {
    expect(parseProfile(withFirstRow(row => { row.invert = 1 }), TX16S)).toBeNull()
    expect(parseProfile(withFirstRow(row => { row.pulseMin = 1000 }), TX16S)).toBeNull()
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

  it('keeps the suggestion not confirmed: it is a starting point, never a mapping that was looked at', () => {
    expect(suggestedProfile(TX16S, null).confirmedKey).toBeNull()
  })
})
