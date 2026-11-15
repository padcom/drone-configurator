import { describe, expect, it } from 'vitest'
import { EKF_GOOD, ekfWith, ready } from '@/testing/takeoff'
import {
  TAKEOFF_CEILINGS, TAKEOFF_DEFAULT_CEILING_M, TAKEOFF_HARD_MAX_M, altitudeOf, fenceCeilingOf, limitsOf, notReady, problemOf,
} from './takeoff'

describe('the fence that limits a takeoff', () => {
  const values = (map: Record<string, number>) => (id: string) => map[id]

  it('is the maximum altitude of the fence when the fence is on and has that limit', () => {
    expect(fenceCeilingOf(values({ FENCE_ENABLE: 1, FENCE_TYPE: 1, FENCE_ALT_MAX: 30 }), true)).toBe(30)
    // the other bits (circle 2, polygon 4) say nothing of the altitude
    expect(fenceCeilingOf(values({ FENCE_ENABLE: 1, FENCE_TYPE: 7, FENCE_ALT_MAX: 80 }), true)).toBe(80)
  })

  it('is UNKNOWN, never "no fence", when the parameters that say what it is are not there (and the list is not whole)', () => {
    expect(fenceCeilingOf(values({}), false)).toBe('unknown')
    expect(fenceCeilingOf(values({ FENCE_TYPE: 1, FENCE_ALT_MAX: 30 }), false)).toBe('unknown')
    expect(fenceCeilingOf(values({ FENCE_ENABLE: 1 }), true)).toBe('unknown')
    expect(fenceCeilingOf(values({ FENCE_ENABLE: 1, FENCE_TYPE: 1 }), true)).toBe('unknown')
  })

  it('is none for a firmware without a fence: the whole list of parameters is there, and has no FENCE_ENABLE', () => {
    expect(fenceCeilingOf(values({}), true)).toBeNull()
  })

  it('is none when the fence is off, or has no altitude limit', () => {
    expect(fenceCeilingOf(values({ FENCE_ENABLE: 0, FENCE_TYPE: 1, FENCE_ALT_MAX: 30 }), true)).toBeNull()
    expect(fenceCeilingOf(values({ FENCE_ENABLE: 1, FENCE_TYPE: 6, FENCE_ALT_MAX: 30 }), true)).toBeNull()
    expect(fenceCeilingOf(values({ FENCE_ENABLE: 1, FENCE_TYPE: 6 }), true)).toBeNull()
  })
})

describe('how high a takeoff may go', () => {
  it('is 2 m up to the setting, and 50 m by default', () => {
    expect(limitsOf(TAKEOFF_DEFAULT_CEILING_M, null)).toEqual({ min: 2, max: 50, by: 'setting' })
    expect(limitsOf(80, null)).toEqual({ min: 2, max: 80, by: 'setting' })
  })

  it('is never above the fence, when the fence is lower than the setting', () => {
    expect(limitsOf(50, 30)).toEqual({ min: 2, max: 30, by: 'fence' })
    expect(limitsOf(50, 100)).toEqual({ min: 2, max: 50, by: 'setting' })
  })

  it('is held inside the hard limits whatever the setting says', () => {
    expect(limitsOf(500, null).max).toBe(TAKEOFF_HARD_MAX_M)
    expect(limitsOf(0, null).max).toBe(2)
    expect(TAKEOFF_CEILINGS.every(metres => metres <= TAKEOFF_HARD_MAX_M)).toBe(true)
  })
})

describe('the altitude that was typed', () => {
  it('reads a number of metres, with a point or a comma', () => {
    expect(altitudeOf('10')).toBe(10)
    expect(altitudeOf(' 12.5 ')).toBe(12.5)
    expect(altitudeOf('7,5')).toBe(7.5)
  })

  it('is not a number for anything else', () => {
    for (const text of ['', ' ', 'abc', '10m', '-5', '1e3', 'Infinity', '1.2.3', '0x10']) {
      expect(altitudeOf(text), text).toBeNaN()
    }
  })

  it('has a problem outside the limits, and none inside them', () => {
    const limits = limitsOf(50, null)

    expect(problemOf(Number.NaN, limits)).toBe('invalid')
    expect(problemOf(1.9, limits)).toBe('low')
    expect(problemOf(2, limits)).toBeNull()
    expect(problemOf(50, limits)).toBeNull()
    expect(problemOf(50.1, limits)).toBe('high')
  })
})

describe('whether the vehicle is ready to take off', () => {
  it('is ready with a 3D fix, the EKF\'s position, and on the ground', () => {
    expect(notReady(ready())).toBeNull()
  })

  it('is not ready without a 3D fix, or without a GPS group at all (what is not reported is not good)', () => {
    expect(notReady(ready({ gps: { fixType: 2, ageMs: 100 } }))).toBe('gps')
    expect(notReady(ready({ gps: undefined }))).toBe('gps')
    expect(notReady(null)).toBe('gps')
  })

  it('is not ready when the EKF lacks a position or has lost it, or is not reported', () => {
    expect(notReady(ready({ ekf: undefined }))).toBe('ekf')
    expect(notReady(ready({ ekf: ekfWith(1 | 2 | 4) }))).toBe('ekf')
    expect(notReady(ready({ ekf: ekfWith(EKF_GOOD | 128) }))).toBe('ekf')
  })

  it('is not ready without a position, or in the air', () => {
    expect(notReady(ready({ position: undefined }))).toBe('position')
    expect(notReady(ready({ position: { ...ready().position!, relativeAltitude: 3 } }))).toBe('air')
  })
})

describe('a group of the telemetry that has gone quiet', () => {
  it('is not reported: an old fix, EKF or position is not ready', () => {
    const old = { ageMs: 10_000 }

    expect(notReady(ready())).toBeNull()
    expect(notReady(ready({ gps: { fixType: 3, satellites: 12, ...old } }))).toBe('gps')
    expect(notReady(ready({ ekf: { ...ekfWith(EKF_GOOD), ...old } }))).toBe('ekf')
    expect(notReady(ready({ position: { ...ready().position!, ...old } }))).toBe('position')
  })
})
