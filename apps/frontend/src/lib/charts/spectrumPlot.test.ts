import { describe, expect, it } from 'vitest'
import { niceStep, plotOf } from './spectrumPlot'

const box = { width: 100, height: 50 }
const format = (value: number) => String(value)

describe('the step of the marks', () => {
  it('is 1, 2 or 5 times a power of ten, about the count asked for', () => {
    expect(niceStep(500, 6)).toBe(50)
    expect(niceStep(1000, 6)).toBe(100)
    expect(niceStep(60, 6)).toBe(10)
    expect(niceStep(0.9, 6)).toBe(0.1)
  })

  it('is 1 for a span that is nothing', () => {
    expect(niceStep(0, 6)).toBe(1)
    expect(niceStep(Number.NaN, 6)).toBe(1)
    expect(niceStep(10, 0)).toBe(1)
  })
})

describe('the plot of a spectrum', () => {
  it('draws the first bin on the left and the last on the right, the largest amplitude at the top', () => {
    const plot = plotOf([{ name: 'x', amplitude: [0, 2, 1] }, { name: 'y', amplitude: [0, 1, 0] }], 500, box, format)

    expect(plot.top).toBe(2)
    expect(plot.lines.map(line => line.d)).toEqual(['M0.0,50.0L50.0,0.0L100.0,25.0', 'M0.0,50.0L50.0,25.0L100.0,50.0'])
    expect(plot.xTicks.map(tick => tick.label).join(' ')).toBe('0 50 100 150 200 250 300 350 400 450 500')
    expect(plot.xTicks[10]?.at).toBe(100)
    expect(plot.yTicks[0]).toEqual({ at: 50, label: '0' })
  })

  it('draws nothing for a spectrum with no amplitude, a spectrum with no frequency, or numbers that are not numbers', () => {
    expect(plotOf([{ name: 'x', amplitude: [0, 0, 0] }], 500, box, format).lines).toEqual([])
    expect(plotOf([{ name: 'x', amplitude: [0, 1, 0] }], 0, box, format).lines).toEqual([])
    expect(plotOf([{ name: 'x', amplitude: [Number.NaN, Number.NaN] }], 500, box, format).lines).toEqual([])
    expect(plotOf([], 500, box, format).top).toBe(0)
  })

  it('leaves a number that is not a number out of the top', () => {
    expect(plotOf([{ name: 'x', amplitude: [Number.POSITIVE_INFINITY, 1, 0] }], 500, box, format).top).toBe(1)
  })
})
