import { describe, expect, it } from 'vitest'
import {
  type ChartPoint,
  type Sample,
  decimate,
  draw,
  extentOf,
  moveByKey,
  nearest,
  nearestAny,
  readoutOf,
  runsOf,
  scaleOf,
  stepFrom,
  ticksOf,
  valueAtPointer,
} from './chart'

/**
 * Samples of a flat series with one sample that is different.
 *
 * @param count how many
 * @param spikeAt which one is the spike
 * @param spike its value
 * @returns the samples, one a unit apart
 */
function flatWithSpike(count: number, spikeAt: number, spike: number): Sample[] {
  return Array.from({ length: count }, (_unused, x) => ({ x, y: x === spikeAt ? spike : 1 }))
}

describe('thinning a series', () => {
  it('keeps a spike one sample wide: the bucket it falls in has it as its highest', () => {
    const points = decimate(flatWithSpike(100_000, 54_321, 41), 200)

    expect(points).toHaveLength(200)
    expect(Math.max(...points.map(point => point.max ?? 0))).toBe(41)
    // The line (the mean) hardly shows it; the envelope does.
    expect(Math.max(...points.map(point => point.y ?? 0))).toBeLessThan(3)
    expect(Math.min(...points.map(point => point.min ?? 0))).toBe(1)
  })

  it('returns a series that is short enough as it is, without an envelope', () => {
    const points = decimate(flatWithSpike(10, 3, 9), 200)

    expect(points).toHaveLength(10)
    expect(points[3]).toEqual({ x: 3, y: 9 })
  })

  it('keeps a gap a gap: a bucket of absent samples is an absent point, never a zero', () => {
    const samples: Sample[] = Array.from({ length: 1000 }, (_unused, x) => ({ x, y: x >= 400 && x < 600 ? null : 2 }))
    const points = decimate(samples, 10)

    expect(points.map(point => point.y)).toEqual([2, 2, 2, 2, null, null, 2, 2, 2, 2])
  })

  it('ignores the absent samples of a bucket that has some, and puts each point in the middle of its bucket', () => {
    const points = decimate([{ x: 0, y: 4 }, { x: 1, y: null }, { x: 2, y: 8 }, { x: 3, y: 6 }], 2)

    expect(points).toEqual([{ x: 0.5, y: 4, min: 4, max: 4 }, { x: 2.5, y: 7, min: 6, max: 8 }])
  })
})

describe('the runs of a series', () => {
  it('are cut at every absent point', () => {
    const ys = [1, 2, null, 3, null, null]
    const points: ChartPoint[] = ys.map((y, x) => ({ x, y }))

    expect(runsOf(points).map(run => run.map(point => point.x))).toEqual([[0, 1], [3]])
    expect(runsOf([])).toEqual([])
  })
})

describe('how far a series reaches', () => {
  it('counts the envelope, and has none for a series without a value', () => {
    expect(extentOf([{ x: 1, y: 5, min: 2, max: 9 }, { x: 4, y: 6 }, { x: 8, y: null }])).toEqual({ x: [1, 4], y: [2, 9] })
    expect(extentOf([{ x: 1, y: null }])).toBeNull()
    expect(extentOf([])).toBeNull()
  })
})

describe('scales and ticks', () => {
  it('map the ends of the domain to the ends of the range, and a flat domain to the middle', () => {
    const scale = scaleOf([10, 20], [100, 0])

    expect([scale(10), scale(15), scale(20)]).toEqual([100, 50, 0])
    expect(scaleOf([5, 5], [0, 100])(5)).toBe(50)
  })

  it('give round numbers inside the domain', () => {
    expect(ticksOf([0, 100], 5)).toEqual([0, 20, 40, 60, 80, 100])
    expect(ticksOf([0, 1], 4)).toEqual([0, 0.5, 1])
    expect(ticksOf([-3, 7], 5)).toEqual([-2, 0, 2, 4, 6])
    expect(ticksOf([0.12, 0.34], 4).every(tick => tick >= 0.12 && tick <= 0.34)).toBe(true)
  })
})

describe('drawing a series', () => {
  const x = scaleOf([0, 10], [0, 100])
  const y = scaleOf([0, 10], [100, 0])

  it('is a line through a run, a gap between runs, and a dot for a point that stands alone', () => {
    const ys = [0, 10, null, 5, null, 5]
    const drawn = draw(ys.map((value, at) => ({ x: at, y: value })), x, y)

    expect(drawn.line).toBe('M0 100L10 0')
    expect(drawn.dots).toEqual([[30, 50], [50, 50]])
    expect(drawn.envelope).toBe('')
  })

  it('has the envelope of a run: the highest forward, the lowest back, closed', () => {
    const drawn = draw([{ x: 0, y: 5, min: 4, max: 6 }, { x: 10, y: 5, min: 5, max: 9 }], x, y)

    expect(drawn.line).toBe('M0 50L100 50')
    expect(drawn.envelope).toBe('M0 40L100 10L100 50L0 60Z')
  })

  it('draws a one-sample spike that stands alone as a vertical stroke, and draws nothing for no value', () => {
    expect(draw([{ x: 5, y: 1, min: 1, max: 9 }], x, y).envelope).toBe('M50 10L50 90')
    expect(draw([{ x: 5, y: null }], x, y)).toEqual({ line: '', dots: [], envelope: '' })
  })
})

describe('the point under the cursor', () => {
  const points: ChartPoint[] = [{ x: 0, y: 1 }, { x: 10, y: null }, { x: 20, y: 3 }, { x: 30, y: 4 }]

  it('is the nearest one that has a value, and none when none has', () => {
    expect([nearest(points, 1), nearest(points, 11), nearest(points, 99)]).toEqual([0, 2, 3])
    expect(nearest([{ x: 0, y: null }], 0)).toBe(-1)
    expect(nearest([], 0)).toBe(-1)
  })

  it('is, for the readout, the nearest of all the points, so that a gap says "no value"', () => {
    expect([nearestAny(points, 9), nearestAny(points, 24), nearestAny(points, 100)]).toEqual([1, 2, 3])
    expect(nearestAny([], 0)).toBe(-1)
  })

  it('moves by a step over the points that have a value, stops at the ends, and starts at an end', () => {
    const step = (from: number, steps: number) => stepFrom(points, from, steps)

    expect([step(0, 1), step(2, 1), step(3, 1), step(0, -1)]).toEqual([2, 3, 3, 0])
    expect([step(-1, 1), step(-1, -1), step(0, 10), step(3, -10)]).toEqual([0, 3, 3, 0])
    expect(stepFrom([{ x: 0, y: null }], -1, 1)).toBe(-1)
  })
})

describe('the keys of the cursor', () => {
  const line: ChartPoint[] = Array.from({ length: 30 }, (_unused, x) => ({ x, y: x }))

  it('move it a sample, ten with Shift, to the ends with Home and End, and from nowhere to an end', () => {
    expect(moveByKey('ArrowRight', false, line, 5)).toEqual({ kind: 'to', x: 6 })
    expect(moveByKey('ArrowLeft', true, line, 25)).toEqual({ kind: 'to', x: 15 })
    expect(moveByKey('Home', false, line, 25)).toEqual({ kind: 'to', x: 0 })
    expect(moveByKey('End', false, line, 3)).toEqual({ kind: 'to', x: 29 })
    expect(moveByKey('ArrowRight', false, line, null)).toEqual({ kind: 'to', x: 0 })
    expect(moveByKey('ArrowLeft', false, line, null)).toEqual({ kind: 'to', x: 29 })
  })

  it('let it go with Escape, and leave every other key alone', () => {
    expect(moveByKey('Escape', false, line, 5)).toEqual({ kind: 'release' })
    expect(moveByKey('a', false, line, 5)).toEqual({ kind: 'ignore' })
    expect(moveByKey('Tab', true, line, 5)).toEqual({ kind: 'ignore' })
  })

  it('give no place when no point has a value', () => {
    expect(moveByKey('ArrowRight', false, [{ x: 0, y: null }], null)).toEqual({ kind: 'to', x: null })
  })
})

describe('the place under the pointer', () => {
  it('is along the domain by how far over the plot the pointer is, and none for a plot with no width', () => {
    expect(valueAtPointer(300, 100, 400, [0, 8])).toBe(4)
    expect(valueAtPointer(100, 100, 400, [0, 8])).toBe(0)
    expect(valueAtPointer(300, 100, 0, [0, 8])).toBeNull()
  })
})

describe('the readout', () => {
  const writing = { formatX: (x: number) => `${x} s`, formatY: (y: number) => `${y} m`, noValue: 'no value' }

  it('writes the place and what each series has there, "no value" where one has none', () => {
    const series = [
      { label: 'A', points: [{ x: 0, y: 1 }, { x: 1, y: 2 }] },
      { label: 'B', points: [{ x: 0, y: 5 }, { x: 1, y: null }] },
    ]

    expect(readoutOf(series, 0, writing)).toBe('0 s: A 1 m; B 5 m')
    expect(readoutOf(series, 1, writing)).toBe('1 s: A 2 m; B no value')
    expect(readoutOf([], 2, writing)).toBe('2 s: ')
  })
})
