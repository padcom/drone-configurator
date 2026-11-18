// "The reading looks wrong" while the control is on: each way one of the four sticks goes wrong is a fault, and a good reading
// (even a little past 1) is not.
import { describe, expect, it } from 'vitest'
import { FAULT_LEVEL, padFault } from './fault'
import type { Sticks } from './rest'
import type { PadLayout, PadSample } from './types'
import { TX16S_LAYOUT, confirmedSuggestion } from '@/testing/rcProfiles'

const STICKS: Sticks = { roll: 1, pitch: 2, throttle: 3, yaw: 4 }
const PROFILE = confirmedSuggestion('pad', 'centred')

/**
 * What the pad says: the first four channels as given, the rest at rest.
 *
 * @param first CH1 to CH4
 * @returns the sample
 */
function sample(first: readonly (number | null)[]): PadSample {
  return { channels: [...first, ...Array.from({ length: 12 }, () => -1)] }
}

/**
 * The pad channel that drives a stick in the mapping.
 *
 * @param index the stick (0 roll, 1 pitch, 2 throttle, 3 yaw)
 * @returns the pad's channel, 1 to 16
 */
function profileSource(index: number): number {
  return PROFILE.rows.find(row => row.channel === index + 1)!.source
}

/**
 * Whether the fault is seen.
 *
 * @param channels CH1 to CH4
 * @param layout what each channel is
 * @param profile the mapping
 * @returns the answer
 */
function seen(channels: readonly (number | null)[], layout: PadLayout | null = TX16S_LAYOUT, profile = PROFILE): boolean {
  return padFault(profile, layout, sample(channels), STICKS)
}

/**
 * Four readings with one of them replaced.
 *
 * @param index which
 * @param value what it reads
 * @returns the readings
 */
function with1(index: number, value: number | null): (number | null)[] {
  return [0, 1, 2, 3].map(at => at === index ? value : 0)
}

describe('a stick that reads right while the control is on', () => {
  it('is no fault when all four read in range, even a little past the end', () => {
    expect(seen([0, 0, 0, 0])).toBe(false)
    expect(seen([1, -1, 1, -1])).toBe(false)
    expect(seen([FAULT_LEVEL, 0, 0, -FAULT_LEVEL])).toBe(false)
  })
})

describe('a stick that reads wrong while the control is on', () => {
  it.each([0, 1, 2, 3])('is a fault when stick %i reads past 1.05, either way', index => {
    expect([1.06, -1.06, 3].map(value => seen(with1(index, value)))).toEqual([true, true, true])
  })

  it.each([0, 1, 2, 3])('is a fault when stick %i reads no number, or nothing', index => {
    expect([Number.NaN, Number.POSITIVE_INFINITY, null].map(value => seen(with1(index, value)))).toEqual([true, true, true])
  })

  it.each([0, 1, 2, 3])('is a fault when the pad channel of stick %i is not an axis any more', index => {
    const layout = TX16S_LAYOUT.map((kind, at) => at === profileSource(index) - 1 ? 'button' as const : kind)

    expect(seen([0, 0, 0, 0], layout)).toBe(true)
  })

  it('is a fault when the pad is not read, or the stick has no row', () => {
    const without = { ...PROFILE, rows: PROFILE.rows.filter(row => row.channel !== STICKS.pitch) }

    expect(seen([0, 0, 0, 0], null)).toBe(true)
    expect(seen([0, 0, 0, 0], TX16S_LAYOUT, without)).toBe(true)
  })
})
