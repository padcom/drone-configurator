// Finding the steps of a flight log: the coarse pass shows where the desired rate jumps, the places are asked again as windows,
// and the step of each window is measured. All of it on series of which the answer is known.
import { describe, expect, it } from 'vitest'
import type { SeriesPoint, SeriesResult } from '@/generated/app'
import {
  type Cut, type LogStep, MAX_CANDIDATES, MAX_STEPS, candidatesOf, loggedRate, ratePointsOf, rankedSteps, stepOfWindow,
} from './flightSteps'
import type { RatePoint } from './stepResponse'

const CUT: Cut = { fromUs: 0, toUs: 199_999_999, buckets: 2000 }

/**
 * A coarse series of a flat rate with jumps: every part holds one value, the part of a jump holds the two.
 *
 * @param jumps where each jump is (part index) and the value it goes to
 * @returns the parts
 */
function coarse(jumps: [number, number][]): SeriesPoint[] {
  const out: SeriesPoint[] = []
  let level = 0

  for (let index = 0; index < CUT.buckets; index += 1) {
    const jump = jumps.find(([at]) => at === index)
    const before = level
    level = jump === undefined ? level : jump[1]
    out.push({ index, min: Math.min(before, level), max: Math.max(before, level), count: 10 })
  }

  return out
}

/**
 * A series result of some points.
 *
 * @param points the parts that have samples
 * @returns the result
 */
function resultOf(points: SeriesPoint[]): SeriesResult {
  return { message: 'RATE', field: 'RDes', found: true, unit: 'deg/s', points, invalid: 0 }
}

describe('where the desired rate jumps', () => {
  it('finds the parts that hold a jump, the largest first, and a window of the time around each', () => {
    const found = candidatesOf(coarse([[500, 57], [1200, 0], [1700, 30]]), CUT)

    expect(found.map(place => Math.round(place.jump))).toEqual([57, 57, 30])
    // 100 us a part: part 500 is at 50.05 ms of 200 s ... the log is 200 s long, so a part is 100 ms
    expect(found[0]?.atUs).toBeCloseTo((500 + 0.5) * 100_000, 0)
    expect(found[0]?.window.fromUs).toBe(Math.round((500.5 * 100_000) - 800_000))
    expect(found[0]?.window.toUs).toBe(Math.round((500.5 * 100_000) + 4_000_000))
  })

  it('finds nothing in a rate that does not jump by a step', () => {
    expect(candidatesOf(coarse([[500, 10], [900, 0]]), CUT)).toEqual([])
    expect(candidatesOf([], CUT)).toEqual([])
  })

  it('finds a jump between two parts as well as inside one', () => {
    const points: SeriesPoint[] = [
      { index: 10, min: 0, max: 0, count: 5 },
      { index: 11, min: 40, max: 40, count: 5 },
      { index: 12, min: 40, max: 40, count: 5 },
    ]

    expect(candidatesOf(points, CUT).map(place => place.jump)).toEqual([40])
  })
})

describe('which of the places are kept', () => {
  it('does not take a gap in the points (a part with no samples) for a jump', () => {
    const points: SeriesPoint[] = [{ index: 10, min: 0, max: 0, count: 5 }, { index: 40, min: 40, max: 40, count: 5 }]

    expect(candidatesOf(points, CUT)).toEqual([])
  })

  it('keeps places that are at least two seconds apart, and at most six, and the window stays inside the log', () => {
    const many = coarse(Array.from({ length: 12 }, (_, i) => [100 + i * 150, (i % 2) * 60] as [number, number]))
    const found = candidatesOf(many, CUT)

    expect(found).toHaveLength(MAX_CANDIDATES)

    for (const place of found) {
      expect(place.window.fromUs).toBeGreaterThanOrEqual(0)
      expect(place.window.toUs).toBeLessThanOrEqual(CUT.toUs)
    }
    const close = candidatesOf(coarse([[100, 60], [105, 0]]), CUT)

    expect(close).toHaveLength(1)
  })
})

describe('the points of a series', () => {
  it('are at the middle of their parts, in milliseconds, with the middle of the smallest and largest value', () => {
    const cut: Cut = { fromUs: 1_000_000, toUs: 1_999_999, buckets: 1000 }
    const points = ratePointsOf(resultOf([{ index: 0, min: 2, max: 4, count: 3 }, { index: 10, min: 7, max: 7, count: 1 }]), cut)

    expect(points).toEqual([{ t: 1000.5, v: 3 }, { t: 1010.5, v: 7 }])
  })

  it('are none for a series the log does not have', () => {
    expect(ratePointsOf(undefined, CUT)).toEqual([])
    expect(ratePointsOf({ ...resultOf([]), found: false }, CUT)).toEqual([])
  })
})

/**
 * The points of a first-order response to a step, sampled every `dt` ms.
 *
 * @param dt the spacing of the samples
 * @param level the level the step goes to
 * @returns the desired and the actual points
 */
function stepWindow(dt: number, level: number): { desired: RatePoint[], actual: RatePoint[] } {
  const desired: RatePoint[] = []
  const actual: RatePoint[] = []
  let x = 0

  for (let t = 0; t <= 4000; t += dt) {
    const wanted = t >= 800 ? level : 0
    x += (wanted - x) * (1 - Math.exp(-dt / 100))
    desired.push({ t: 50_000 + t, v: wanted })
    actual.push({ t: 50_000 + t, v: x })
  }

  return { desired, actual }
}

/**
 * The step of a window of a size, measured.
 *
 * @param dt the spacing of the samples
 * @param size its size
 * @returns the step
 * @throws {Error} when there is none
 */
function measured(dt: number, size: number): LogStep {
  const { desired, actual } = stepWindow(dt, size)
  const step = stepOfWindow(desired, actual)
  if (step === null) {
    throw new Error('no step')
  }

  return step
}

describe('the step of a window', () => {
  it('is measured as the live one is: its size, when it is, and the rise of a lag of 100 ms', () => {
    const step = measured(10, 57)

    expect(step.size).toBe(57)
    expect(step.atUs).toBe(50_800 * 1000)
    expect(step.metrics.riseMs).toBeGreaterThan(200)
    expect(step.metrics.riseMs).toBeLessThan(240)
  })

  it('is none in a window that has no step that holds', () => {
    const { desired, actual } = stepWindow(10, 5)

    expect(stepOfWindow(desired, actual)).toBeNull()
    expect(stepOfWindow([], [])).toBeNull()
  })

  it('has the sign of a step down', () => {
    expect(measured(10, -40).size).toBe(-40)
  })
})

describe('the steps that are listed', () => {
  /**
   * A step of a size at a time (the metrics are not what is looked at here).
   *
   * @param size its size
   * @param atUs when it is
   * @returns the step
   */
  function stepAt(size: number, atUs: number): LogStep {
    return { ...measured(40, size), atUs }
  }

  it('are the largest first, and the same moment is listed once', () => {
    const listed = rankedSteps([stepAt(30, 10_000_000), stepAt(-60, 20_000_000), stepAt(45, 30_000_000), stepAt(44, 30_100_000)])

    expect(listed.map(step => step.size)).toEqual([-60, 45, 30])
  })

  it('are eight at the most', () => {
    const steps = Array.from({ length: 12 }, (_, i) => stepAt(30 + i, (i + 1) * 5_000_000))

    expect(rankedSteps(steps)).toHaveLength(MAX_STEPS)
    expect(rankedSteps(steps)[0]?.size).toBe(41)
  })
})

describe('how often a message was logged', () => {
  it('is the number of intervals a second, and none for a log with no time or one message', () => {
    expect(loggedRate(251, 0, 10_000_000)).toBeCloseTo(25, 5)
    expect(loggedRate(1, 0, 10_000_000)).toBeNull()
    expect(loggedRate(100, 5, 5)).toBeNull()
  })
})
