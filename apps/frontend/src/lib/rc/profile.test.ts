// What a mapping must be before it may drive a vehicle.
import { describe, expect, it } from 'vitest'
import { confirmed } from './confirm'
import { problemsOf } from './profile'
import { newRow, suggestedProfile } from './suggest'
import type { PadLayout, Profile, Row } from './types'
import { TX16S_LAYOUT as LAYOUT } from '@/testing/rcProfiles'

/**
 * A mapping confirmed for the pad, with these rows.
 *
 * @param rows the rows
 * @returns the mapping
 */
function good(rows: Row[]): Profile {
  return confirmed({ ...suggestedProfile('pad', null), rows }, LAYOUT)
}

/**
 * The codes of what is wrong with a mapping.
 *
 * @param profile the mapping
 * @param layout the pad's layout (this pad's by default)
 * @returns the codes, in order
 */
function codes(profile: Profile, layout: PadLayout | null = LAYOUT): string[] {
  return problemsOf(profile, layout).map(problem => problem.code)
}

/**
 * A row on channel and pad channel `n` with its own ends.
 *
 * @param n the channel and the pad channel
 * @param min the pulse at -1
 * @param max the pulse at 1
 * @returns the row
 */
function ended(n: number, min: number, max: number): Row {
  return { ...newRow(n, n), pulseMin: min, pulseMax: max }
}

describe('a mapping that may drive a vehicle', () => {
  it('has no problem: one row for each channel, on channels the pad has, with pulses that an override carries', () => {
    const rows = [newRow(1, 1), newRow(2, 2), ended(5, 1000, 2000)]

    expect(problemsOf(good(rows), LAYOUT)).toEqual([])
  })

  it('is confirmed for this pad: the suggestion is not, a changed row is not, a changed style is not', () => {
    const suggestion = suggestedProfile('pad', null)
    const profile = good(suggestion.rows as Row[])

    expect(codes(suggestion)).toEqual(['unconfirmed'])
    expect(codes({ ...profile, rows: [...profile.rows].reverse() })).toEqual(['unconfirmed'])
    expect(codes({ ...profile, throttleStyle: 'low' })).toEqual(['unconfirmed'])
    expect(codes(profile)).toEqual([])
  })

  it('is confirmed for this pad: another layout is not, and no pad read is not', () => {
    const profile = good(suggestedProfile('pad', null).rows as Row[])

    expect(codes(profile, [...LAYOUT.slice(0, 7), null, ...LAYOUT.slice(8)])).toEqual(['unconfirmed'])
    expect(codes(profile, null)).toEqual(['unconfirmed'])
  })
})

describe('the rows of a mapping', () => {
  it('has a source on the pad: a row with none is a problem', () => {
    expect(problemsOf(good([newRow(1, 0)]), LAYOUT)).toEqual([{ code: 'source', channel: 1 }])
    expect(codes(good([newRow(1, 1.5)]))).toEqual(['source'])
  })

  it('has a source the pad has: a channel it does not have is a problem (and the mapping is not confirmed for that pad)', () => {
    const without12 = [...LAYOUT.slice(0, 11), null, ...LAYOUT.slice(12)]

    expect(problemsOf(good([newRow(1, 12)]), without12)).toEqual([
      { code: 'unconfirmed', channel: 0 },
      { code: 'absent', channel: 1 },
    ])
  })

  it('has no channel outside 1 to 16 and no two rows for one channel', () => {
    expect(codes(good([newRow(0, 1), newRow(17, 2), newRow(2.5, 3)]))).toEqual(['channel', 'channel', 'channel'])
    expect(codes(good([newRow(1, 1), newRow(1, 2)]))).toEqual(['duplicate'])
  })

  it('has a dead zone of 0 to 0.5 and an expo of 0 to 1', () => {
    const rows = [{ ...newRow(1, 1), deadZone: 0.6 }, { ...newRow(2, 2), expo: 1.1 }, { ...newRow(3, 3), deadZone: Number.NaN }]

    expect(codes(good(rows))).toEqual(['zone', 'expo', 'zone'])
  })

  it('has ends that are whole pulses of 800 to 2200 µs', () => {
    const rows = [ended(1, 700, 2000), ended(2, 1000, 2300), ended(3, 1000.5, 2000), ended(4, 1000, 2000)]

    expect(codes(good(rows))).toEqual(['pulse', 'pulse', 'pulse'])
  })
})
