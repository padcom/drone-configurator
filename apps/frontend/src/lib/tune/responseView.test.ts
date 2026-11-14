import { describe, expect, it } from 'vitest'
import { DASH, SHOWN_S, linesOf, metricTexts } from './responseView'

describe('the lines of the response chart', () => {
  it('are the points that came, in seconds before the newest one, and nothing when nothing came', () => {
    expect(linesOf([], [])).toEqual({ actual: [], desired: [] })
    const lines = linesOf([{ t: 9000, v: 1 }, { t: 10_000, v: 2 }], [{ t: 9500, v: 5 }])

    expect(lines.actual).toEqual([{ x: -1, y: 1 }, { x: 0, y: 2 }])
    expect(lines.desired).toEqual([{ x: -0.5, y: 5 }])
  })

  it('show only the last seconds of the window', () => {
    const lines = linesOf([{ t: 0, v: 1 }, { t: SHOWN_S * 1000 + 1, v: 2 }], [])

    expect(lines.actual).toEqual([{ x: 0, y: 2 }])
  })
})

describe('the numbers of the metrics', () => {
  it('are a dash where there is none, and carry their unit', () => {
    expect(metricTexts(null)).toEqual({ overshoot: DASH, rise: DASH, settling: DASH })
    const step = { at: 0, from: 0, to: 57, until: 1000 }

    expect(metricTexts({ ...step, overshootPct: 16.34, riseMs: 109.6, settlingMs: null })).toEqual({
      overshoot: '16.3 %',
      rise: '110 ms',
      settling: DASH,
    })
  })
})
