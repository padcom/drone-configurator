// Steps of the desired rate in a flight log, found and measured: the pure part of "Analyse the last flight". The backend gives
// a signal as a number of parts of the time with the smallest and largest value of each (`logs.local.series`), so it is looked
// at in two passes. A COARSE pass of a whole log shows where the desired rate jumps: a part that holds a jump in itself (its
// largest value is far from its smallest), or a part that is far from the one before it. The places with the largest jumps are
// then asked again as a short window of the time (about 5 s, in 2000 parts: a part of a few milliseconds, a sample of the log or
// less), and the step response of that window is measured by lib/tune/stepResponse.ts, as it is of the live stream. Nothing is
// made up: a window with no step that holds is no step, and a log that is logged too slowly to see a rise is told so by its rate.
import type { SeriesPoint, SeriesResult } from '@/generated/app'
import { type RatePoint, type StepMetrics, STEP_DEFAULTS, measureStep } from './stepResponse'

/** The part of the time a series was asked for: where it begins and ends (microseconds of the log) and into how many parts. */
export interface Cut {
  /** Where the time begins (microseconds of the log). */
  fromUs: number
  /** Where it ends. */
  toUs: number
  /** Into how many parts it is cut. */
  buckets: number
}

/** A place in the log where the desired rate jumps, and a window of the time to look at it in. */
export interface Candidate {
  /** Where the jump is (microseconds of the log). */
  atUs: number
  /** How big it is (deg/s). */
  jump: number
  /** The window to ask for: a little before it and a few seconds after. */
  window: { fromUs: number, toUs: number }
}

/** A step that was measured in a window of a log. */
export interface LogStep {
  /** When it is (microseconds of the log). */
  atUs: number
  /** The size of the step (deg/s, with its sign). */
  size: number
  /** What was measured of it. */
  metrics: StepMetrics
  /** The desired rate in the window, for the chart. */
  desired: RatePoint[]
  /** The actual rate in the window, for the chart. */
  actual: RatePoint[]
}

/** How much of the time before a jump, and after it, is looked at (microseconds). */
const BEFORE_US = 800_000
const AFTER_US = 4_000_000

/** The places of a log asked about in the fine pass, at the most, and how close two of them may be (microseconds). */
export const MAX_CANDIDATES = 6
const APART_US = 2_000_000

/** The longest time between two parts with samples that is still one signal and not a gap in the log (microseconds). */
const NEAR_US = 500_000

/** The steps that are kept, at the most. */
export const MAX_STEPS = 8

/**
 * How big a part of the time is.
 *
 * @param cut the cut
 * @returns microseconds
 */
function partOf(cut: Cut): number {
  return (cut.toUs - cut.fromUs + 1) / cut.buckets
}

/**
 * The size of the largest jump a part of the time has in itself or leaves to the next part with a value. A part is shorter than
 * the time between two samples when the log is short or logged slowly, so the next part that has a value is not always the one
 * right after: it is the next one when it is no more than NEAR_US away (a longer silence is a gap in the log, not a jump).
 *
 * @param point a part with samples
 * @param next the next part with samples
 * @param part how long a part is (microseconds)
 * @returns the jump (deg/s), 0 for none
 */
function jumpAt(point: SeriesPoint, next: SeriesPoint | undefined, part: number): number {
  const inside = point.max - point.min
  const gap = next === undefined || (next.index - point.index) * part > NEAR_US
    ? 0
    : Math.max(next.min - point.max, point.min - next.max)

  return Math.max(inside, gap)
}

/**
 * The largest of the places, those that are not near a larger one.
 *
 * @param sorted the places, the largest first
 * @returns at most MAX_CANDIDATES of them
 */
function apart(sorted: Candidate[]): Candidate[] {
  const kept: Candidate[] = []

  for (const candidate of sorted) {
    if (kept.length < MAX_CANDIDATES && kept.every(other => Math.abs(other.atUs - candidate.atUs) >= APART_US)) {
      kept.push(candidate)
    }
  }

  return kept
}

/**
 * The places of a log where the desired rate jumps by at least `minStep`, the largest first, not two of them within two seconds.
 *
 * @param points the parts of the coarse series (those with samples, in order)
 * @param cut how the series was cut
 * @param minStep the least jump (deg/s)
 * @returns at most MAX_CANDIDATES places, each with the window to look at
 */
export function candidatesOf(points: SeriesPoint[], cut: Cut, minStep = STEP_DEFAULTS.minStep): Candidate[] {
  const part = partOf(cut)
  const found: Candidate[] = []

  points.forEach((point, i) => {
    const jump = jumpAt(point, points[i + 1], part)
    if (jump >= minStep) {
      const atUs = cut.fromUs + (point.index + 0.5) * part
      const fromUs = Math.max(cut.fromUs, Math.round(atUs - BEFORE_US))
      const toUs = Math.min(cut.toUs, Math.round(atUs + AFTER_US))
      found.push({ atUs, jump, window: { fromUs, toUs } })
    }
  })

  return apart(found.sort((a, b) => b.jump - a.jump))
}

/**
 * The points of a series as the step module takes them: the time of a part is its middle, in milliseconds of the log, and its
 * value the middle of its smallest and largest (a part of a few milliseconds holds one sample, or none).
 *
 * @param result what the backend said of the series
 * @param cut how it was cut
 * @returns the points, in order of time; none when the log has no such series
 */
export function ratePointsOf(result: SeriesResult | undefined, cut: Cut): RatePoint[] {
  if (result === undefined || !result.found) {
    return []
  }
  const part = partOf(cut)

  return result.points.map(point => ({ t: (cut.fromUs + (point.index + 0.5) * part) / 1000, v: (point.min + point.max) / 2 }))
}

/**
 * The step of a window, measured.
 *
 * @param desired the desired rate in the window
 * @param actual the actual rate in the window
 * @returns the step, or null when the window has none that holds
 */
export function stepOfWindow(desired: RatePoint[], actual: RatePoint[]): LogStep | null {
  const metrics = measureStep(desired, actual)

  return metrics === null ? null : { atUs: metrics.at * 1000, size: metrics.to - metrics.from, metrics, desired, actual }
}

/**
 * The steps to offer: the largest first, at most MAX_STEPS, no two of the same moment.
 *
 * @param steps the steps that were measured
 * @returns the steps to list
 */
export function rankedSteps(steps: LogStep[]): LogStep[] {
  const kept: LogStep[] = []

  for (const step of [...steps].sort((a, b) => Math.abs(b.size) - Math.abs(a.size))) {
    if (kept.length < MAX_STEPS && kept.every(other => Math.abs(other.atUs - step.atUs) >= 500_000)) {
      kept.push(step)
    }
  }

  return kept
}

/**
 * How often a message was logged, from how many there are and how long the log is.
 *
 * @param count how many messages
 * @param firstUs the first time of the log
 * @param lastUs the last time of the log
 * @returns messages a second, or null for a log with no time
 */
export function loggedRate(count: number, firstUs: number, lastUs: number): number | null {
  return lastUs > firstUs && count > 1 ? (count - 1) / ((lastUs - firstUs) / 1e6) : null
}

/** The slowest logging (Hz) of the rate message at which a rise of about 100 ms can be seen: two samples in it. */
export const MIN_RATE_HZ = 20
