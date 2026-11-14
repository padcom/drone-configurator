// What the response chart of the Tune screen draws and says, from the points of the stream and nothing else: the two lines (the
// time along the bottom is seconds before the newest point, so that it runs from about -10 to 0), and the numbers of the metrics
// as text, a dash where one could not be measured. No slider, no parameter and no model has a part in it.
import type { ChartPoint } from '@/lib/charts/chart'
import { STEP_DEFAULTS, type RatePoint, type StepMetrics } from './stepResponse'

/** What a number that could not be measured is shown as. */
export const DASH = '—'

/** How many seconds of the points are drawn (the window the step is looked for in). */
export const SHOWN_S = STEP_DEFAULTS.windowMs / 1000

/**
 * The newest time of some lines.
 *
 * @param lines the lines
 * @returns the newest `t` of any, or null when they are all empty
 */
function newestOf(lines: RatePoint[][]): number | null {
  const times = lines.flatMap(line => line.map(point => point.t))

  return times.length === 0 ? null : Math.max(...times)
}

/**
 * The points of a line as the chart draws them: seconds from the origin (the newest point of the chart, when none is given: the
 * last SHOWN_S seconds are drawn then, and all of the points when it is).
 *
 * @param line the points
 * @param newest the newest time of the chart (ms)
 * @param origin the time the axis counts from (ms), if it is not the newest
 * @returns the chart's points
 */
function chartPoints(line: RatePoint[], newest: number, origin: number | undefined): ChartPoint[] {
  return line
    .filter(point => origin !== undefined || newest - point.t <= SHOWN_S * 1000)
    .map(point => ({ x: (point.t - (origin ?? newest)) / 1000, y: point.v }))
}

/** The two lines of the chart, as points. */
interface Lines {
  actual: ChartPoint[]
  desired: ChartPoint[]
}

/**
 * The two lines of the chart.
 *
 * @param actual the actual rate
 * @param desired the desired rate
 * @param origin the time the axis counts from (ms), when it is not the newest point (a step of a log)
 * @returns the points of each, in seconds before the newest point or from the origin (empty when nothing came)
 */
export function linesOf(actual: RatePoint[], desired: RatePoint[], origin?: number): Lines {
  const newest = newestOf([actual, desired])

  if (newest === null) {
    return { actual: [], desired: [] }
  }

  return { actual: chartPoints(actual, newest, origin), desired: chartPoints(desired, newest, origin) }
}

/** The numbers of the metrics, as text. */
export interface MetricTexts {
  /** The overshoot, in percent of the step. */
  overshoot: string
  /** The rise, from 10 to 90 %. */
  rise: string
  /** The settling to within 5 %. */
  settling: string
}

/**
 * A number as text with a unit, or the dash.
 *
 * @param value the number, or null
 * @param unit the unit written after it
 * @param digits how many decimals
 * @returns the text
 */
function withUnit(value: number | null | undefined, unit: string, digits: number): string {
  return value === null || value === undefined || !Number.isFinite(value) ? DASH : `${value.toFixed(digits)} ${unit}`
}

/**
 * The metrics as text.
 *
 * @param metrics what was measured, or null when there is no step
 * @returns the three numbers, each a dash where it could not be measured
 */
export function metricTexts(metrics: StepMetrics | null): MetricTexts {
  return {
    overshoot: withUnit(metrics?.overshootPct, '%', 1),
    rise: withUnit(metrics?.riseMs, 'ms', 0),
    settling: withUnit(metrics?.settlingMs, 'ms', 0),
  }
}
