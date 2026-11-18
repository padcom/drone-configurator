// "Confirm this mapping": the key of what was looked at.
import { describe, expect, it } from 'vitest'
import { confirmed, isConfirmed, keyOf, layoutKey } from './confirm'
import { suggestedProfile } from './suggest'
import { TX16S_LAYOUT as LAYOUT } from '@/testing/rcProfiles'

describe('the layout of a pad as text', () => {
  it('says a for an axis, b for a button and a dash for a channel the pad has not', () => {
    expect(layoutKey(LAYOUT)).toBe('aaaaaaaabbbbbbbb')
    expect(layoutKey(['axis', 'button'])).toBe('ab--------------')
  })
})

describe('a confirmed mapping', () => {
  const profile = suggestedProfile('pad', null)

  it('is confirmed for the pad and the layout it was confirmed for, and for nothing else', () => {
    const sure = confirmed(profile, LAYOUT)

    expect(isConfirmed(profile, LAYOUT)).toBe(false)
    expect(isConfirmed(sure, LAYOUT)).toBe(true)
    expect(isConfirmed(sure, [...LAYOUT.slice(0, 8), ...Array.from({ length: 8 }, () => null)])).toBe(false)
    expect(isConfirmed({ ...sure, device: 'another pad' }, LAYOUT)).toBe(false)
    expect(isConfirmed({ ...sure, throttleStyle: 'low' }, LAYOUT)).toBe(false)
    expect(isConfirmed({ ...sure, rows: sure.rows.map(row => ({ ...row, expo: 0.1 })) }, LAYOUT)).toBe(false)
    expect(isConfirmed(sure, null)).toBe(false)
  })

  it('has a key that tells one mapping from another, and is the same for the same one', () => {
    expect(keyOf(profile, LAYOUT)).toBe(keyOf({ ...profile }, LAYOUT))
    expect(keyOf(profile, LAYOUT)).not.toBe(keyOf({ ...profile, throttleStyle: 'low' }, LAYOUT))
    expect(keyOf(profile, LAYOUT)).toMatch(/^[0-9a-f]{8}$/u)
  })
})
