import { describe, expect, it } from 'vitest'
import {
  type ChartPoint,
  type Sample,
  decimate,
  draw,
  extentOf,
  hasValue,
  moveByKey,
  pointAt,
  spacingOf,
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

describe('values that are not numbers', () => {
  const x = scaleOf([0, 10], [0, 100])
  const y = scaleOf([0, 10], [100, 0])
  const points = (ys: Array<number | null>): ChartPoint[] => ys.map((value, at) => ({ x: at, y: value }))

  it('are absent, like null, wherever the points are looked at: runs, reach, drawing, the nearest point, the steps', () => {
    const mixed = points([1, Number.NaN, 3, Number.POSITIVE_INFINITY, 5, Number.NEGATIVE_INFINITY])

    expect(runsOf(mixed).map(run => run.map(point => point.x))).toEqual([[0], [2], [4]])
    expect(extentOf(mixed)).toEqual({ x: [0, 4], y: [1, 5] })
    expect(draw(mixed, x, y)).toMatchObject({ line: '', dots: [[0, 90], [20, 70], [40, 50]] })
    expect(nearest(mixed, 1)).toBe(0)
    expect(nearest(mixed, 3)).toBe(2)
    expect(stepFrom(mixed, 0, 1)).toBe(2)
    expect(stepFrom(mixed, 4, 5)).toBe(4)
    expect(hasValue({ x: 0, y: Number.NaN })).toBe(false)
    expect(hasValue({ x: Number.NaN, y: 1 })).toBe(false)
    expect(hasValue({ x: 0, y: 1 })).toBe(true)
  })

  it('leave a gap in the middle of a line, not a "NaN" in its path or a line to nowhere', () => {
    const drawn = draw(points([1, 2, Number.NaN, 4, 5]), x, y)

    expect(drawn.line).toBe('M0 90L10 80M30 60L40 50')
    expect(drawn.line).not.toContain('NaN')
    expect(drawn.envelope).not.toContain('NaN')
  })
})

describe('a series of values that are not numbers', () => {
  const x = scaleOf([0, 10], [0, 100])
  const y = scaleOf([0, 10], [100, 0])
  const points = (ys: Array<number | null>): ChartPoint[] => ys.map((value, at) => ({ x: at, y: value }))

  it('make a series of nothing but such values a series with no extent', () => {
    expect(extentOf(points([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]))).toBeNull()
    expect(draw(points([Number.NaN, Number.POSITIVE_INFINITY]), x, y)).toEqual({ line: '', dots: [], envelope: '' })
  })

  it('do not poison the reach of a series that also has real values, envelope included', () => {
    const wide: ChartPoint[] = [
      { x: 0, y: 5, min: Number.NaN, max: 8 },
      { x: 1, y: Number.NaN, min: -100, max: 100 },
      { x: 2, y: 6 },
    ]

    expect(extentOf(wide)).toEqual({ x: [0, 2], y: [5, 8] })
  })
})

describe('values that are not numbers, in a thinned series', () => {
  it('are left out of a thinned series: a bucket of them is a gap, and a sample with no place is dropped', () => {
    const inGap = (at: number): boolean => at >= 400 && at < 600
    const samples: Sample[] = Array.from({ length: 1000 }, (_unused, at) => ({ x: at, y: inGap(at) ? Number.NaN : 2 }))
    samples.push({ x: Number.POSITIVE_INFINITY, y: 9 }, { x: Number.NaN, y: 9 })
    const thinned = decimate(samples, 10)

    expect(thinned.map(point => point.y)).toEqual([2, 2, 2, 2, null, null, 2, 2, 2, 2])
    expect(thinned.every(point => Number.isFinite(point.x))).toBe(true)
    expect(JSON.stringify(thinned)).not.toContain('null,"min"')
  })

  it('are scattered over a huge series, and the thinned series is finite throughout', () => {
    const value = (at: number): number => at % 997 === 0 ? Number.NaN : at % 5
    const samples: Sample[] = Array.from({ length: 200_000 }, (_unused, at) => ({ x: at, y: value(at) }))
    const thinned = decimate(samples, 500)
    const reach = extentOf(thinned)

    expect(thinned).toHaveLength(500)
    expect(reach).toEqual({ x: [expect.any(Number), expect.any(Number)], y: [0, 4] })
    expect(thinned.every(point => point.y !== null && Number.isFinite(point.y))).toBe(true)
  })
})

describe('a long series', () => {
  it('has a reach and a thinned form with no limit of its own: 500 000 points, a million thinned to 2 and to 10', () => {
    const long: ChartPoint[] = Array.from({ length: 500_000 }, (_unused, at) => ({ x: at, y: at % 100 }))
    const samples: Sample[] = Array.from({ length: 1_000_000 }, (_unused, at) => ({ x: at, y: at % 100 }))

    expect(extentOf(long)).toEqual({ x: [0, 499_999], y: [0, 99] })
    expect(decimate(samples, 2)).toHaveLength(2)
    expect(decimate(samples, 2).map(point => [point.min, point.max])).toEqual([[0, 99], [0, 99]])
    expect(decimate(samples, 10)).toHaveLength(10)
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

  it('says the range of a point that stands for several samples, never the middle of it as a value', () => {
    // A roll that swung from -40 to 40 in the part: the line is drawn through 0, but no sample was 0.
    const swing = [{ label: 'Roll', points: [{ x: 0, y: 0, min: -40, max: 40 }, { x: 1, y: 3, min: 3, max: 3 }, { x: 2, y: 5 }] }]

    expect(readoutOf(swing, 0, writing)).toBe('0 s: Roll -40 m … 40 m')
    // A part of one value, and a point with no envelope, say the value.
    expect(readoutOf(swing, 1, writing)).toBe('1 s: Roll 3 m')
    expect(readoutOf(swing, 2, writing)).toBe('2 s: Roll 5 m')
  })
})

describe('the readout of series that do not all reach the place', () => {
  const writing = { formatX: (x: number) => `${x} s`, formatY: (y: number) => `${y} m`, noValue: 'no value' }

  it('gives a series that ended earlier no reading at a place beyond its end, nor one before its start', () => {
    const long = Array.from({ length: 60 }, (_unused, at) => ({ x: at, y: at }))
    const short = Array.from({ length: 11 }, (_unused, at) => ({ x: at, y: 12 + at / 100 }))
    const series = [{ label: 'Alt', points: long }, { label: 'Battery', points: short }]

    expect(readoutOf(series, 5, writing)).toBe('5 s: Alt 5 m; Battery 12.05 m')
    expect(readoutOf(series, 10, writing)).toBe('10 s: Alt 10 m; Battery 12.1 m')
    expect(readoutOf(series, 50, writing)).toBe('50 s: Alt 50 m; Battery no value')
    const late = [{ label: 'Late', points: [{ x: 40, y: 1 }, { x: 41, y: 2 }, { x: 42, y: 3 }] }]
    expect(readoutOf(late, 5, writing)).toBe('5 s: Late no value')
  })

  it('reads a series of another rate at its own nearest sample, within half its spacing', () => {
    const fast = Array.from({ length: 101 }, (_unused, at) => ({ x: at / 10, y: at }))
    const slow = Array.from({ length: 11 }, (_unused, at) => ({ x: at, y: at * 100 }))
    const series = [{ label: 'Fast', points: fast }, { label: 'Slow', points: slow }]

    // At 3.2 s the slow series (a sample a second) is 0.2 s from its sample at 3: within half a second, so it is read.
    expect(readoutOf(series, 3.2, writing)).toBe('3.2 s: Fast 32 m; Slow 300 m')
    // At 3.7 s the nearest slow sample is 0.3 s away at 4: also within half a second.
    expect(readoutOf(series, 3.7, writing)).toBe('3.7 s: Fast 37 m; Slow 400 m')
    // Past the end of the slow series by more than half a second: no value.
    expect(readoutOf(series, 10.6, writing)).toBe('10.6 s: Fast no value; Slow no value')
  })
})

describe('the spacing of a series', () => {
  it('has a spacing that is the median gap, found from a hundred pairs, and none for a series of one', () => {
    expect(spacingOf(Array.from({ length: 1000 }, (_unused, at) => ({ x: at * 2, y: at })))).toBe(2)
    expect(spacingOf([{ x: 0, y: 1 }])).toBe(0)
    expect(spacingOf([])).toBe(0)
    expect(pointAt([{ x: 5, y: 1 }], 5)?.y).toBe(1)
    expect(pointAt([{ x: 5, y: 1 }], 5.5)).toBeUndefined()
  })
})
