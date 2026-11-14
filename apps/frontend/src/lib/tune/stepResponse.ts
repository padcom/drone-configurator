// What the Tune screen measures of the roll rate: the step response, from the DESIRED rate the vehicle was given
// (ATTITUDE_TARGET) and the ACTUAL one it had (ATTITUDE), both as the vehicle sent them (time since boot in ms, degrees a
// second). Nothing is modelled or drawn from the sliders: a number here is measured from points that came, within a stated
// window, or it is null.
//
// A STEP is found in the desired rate: a jump of at least `minStep` within `edgeMs`, after which it holds a new value (within
// 15 % of the jump) for at least `holdMs`. The LATEST such step in the last `windowMs` is the one measured; a step that has
// not held long enough yet is not one (it may be a stick that is still moving), and the one before it is taken instead. From it:
//   overshoot  how far the actual rate went past the new value, in percent of the step (0 when it did not);
//   rise       the time the actual rate took from 10 % to 90 % of the step (null: it did not get to 90 % while the step held);
//   settling   the time from the step until the actual rate stays within `band` (5 %) of the new value (null: it did not
//              settle while the step held).
// The crossings are found between the samples by a straight line, so a vehicle that reports at 25 Hz still gives a rise time
// shorter than its spacing.

/** One point of a rate: the vehicle's clock (ms) and the rate (deg/s). */
export interface RatePoint {
  /** The vehicle's `time_boot_ms`. */
  t: number
  /** The rate in degrees a second. */
  v: number
}

/** What counts as a step, and how far back to look. */
export interface StepOptions {
  /** How far back from the newest point to look for a step (ms). */
  windowMs: number
  /** The least jump of the desired rate that is a step (deg/s). */
  minStep: number
  /** The jump is made within this long (ms). */
  edgeMs: number
  /** The new value is held at least this long (ms). */
  holdMs: number
  /** The band the actual rate settles into, as a fraction of the step. */
  band: number
}

/** The usual: 10 s, a jump of 20 deg/s within 200 ms held for 600 ms, settled within 5 %. */
export const STEP_DEFAULTS: StepOptions = { windowMs: 10_000, minStep: 20, edgeMs: 200, holdMs: 600, band: 0.05 }

/** A step that was found in the desired rate. */
export interface Step {
  /** When the desired rate reached its new value (ms). */
  at: number
  /** Where the desired rate was before (deg/s). */
  from: number
  /** Where it went and stayed (deg/s). */
  to: number
  /** When the new value stopped holding, or the last point (ms). */
  until: number
}

/** The measure of a step: each is null when it could not be measured from what came. */
export interface StepMetrics extends Step {
  /** Percent of the step the actual rate went past the new value. */
  overshootPct: number | null
  /** 10 % to 90 % of the step, in ms. */
  riseMs: number | null
  /** From the step until the actual rate is within the band for good, in ms. */
  settlingMs: number | null
}

/** How much of the new value a hold may wander (fraction of the step). */
const HOLD_WANDER = 0.15

/** How far before the jump the old value is read from (ms). */
const BEFORE_MS = 300

/** What a point that is not there is (an index is always inside the points: this keeps the arithmetic free of holes). */
const NOWHERE: RatePoint = { t: 0, v: 0 }

/**
 * A point of a line.
 *
 * @param line the points
 * @param i the index
 * @returns the point
 */
function pt(line: RatePoint[], i: number): RatePoint {
  return line[i] ?? NOWHERE
}

/**
 * The middle one of some numbers (the mean of the two middle ones for an even count).
 *
 * @param values the numbers, at least one
 * @returns their median
 */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  const high = sorted[mid] ?? 0

  return sorted.length % 2 === 1 ? high : ((sorted[mid - 1] ?? 0) + high) / 2
}

/**
 * Where a jump that is made by point `e` began: the first point within `edgeMs` before it.
 *
 * @param line the points
 * @param e the index of the point that completes the jump
 * @param edgeMs how long a jump may take
 * @returns the index of the point the jump began at
 */
function jumpStart(line: RatePoint[], e: number, edgeMs: number): number {
  let b = e

  while (b > 0 && pt(line, e).t - pt(line, b - 1).t <= edgeMs) {
    b -= 1
  }

  return b
}

/**
 * The value before a jump: the middle of the points in the 300 ms before it (or the point it began at, when there are none).
 *
 * @param line the points
 * @param b the index of the point the jump began at
 * @returns the old value
 */
function before(line: RatePoint[], b: number): number {
  const earlier = line.slice(0, b).filter(point => pt(line, b).t - point.t <= BEFORE_MS).map(point => point.v)

  return earlier.length > 0 ? median(earlier) : pt(line, b).v
}

/**
 * How long the desired rate holds a value, from a point on.
 *
 * @param line the points
 * @param e the index the hold begins at
 * @param to the value held
 * @param size the size of the step (the wander is a fraction of it)
 * @returns the index of the last point that is still within the wander of the value
 */
function holdEnd(line: RatePoint[], e: number, to: number, size: number): number {
  let last = e

  while (last + 1 < line.length && Math.abs(pt(line, last + 1).v - to) <= HOLD_WANDER * Math.abs(size)) {
    last += 1
  }

  return last
}

/**
 * The value the desired rate goes to and stays at: the middle of what follows the jump (a ramp that is still settling does not
 * move it much).
 *
 * @param line the desired rate
 * @param e the index of the first point after the jump
 * @param from the value before the jump
 * @returns the new value
 */
function plateau(line: RatePoint[], e: number, from: number): number {
  const first = pt(line, e).v
  const last = holdEnd(line, e, first, first - from)

  return median(line.slice(e, last + 1).map(point => point.v))
}

/**
 * The step that completes at point `e`, if one does and it holds long enough.
 *
 * @param line the desired rate
 * @param e the index of the point that may complete a step
 * @param options what counts as a step
 * @returns the step, or null
 */
function stepAt(line: RatePoint[], e: number, options: StepOptions): Step | null {
  const from = before(line, jumpStart(line, e, options.edgeMs))
  const to = plateau(line, e, from)
  if (Math.abs(to - from) < options.minStep) {
    return null
  }
  const at = pt(line, e).t
  const until = pt(line, holdEnd(line, e, to, to - from)).t

  return until - at >= options.holdMs ? { at, from, to, until } : null
}

/**
 * Whether a step begins its hold at point `e`: the point before it is not yet at the new value (else the step began earlier).
 *
 * @param line the desired rate
 * @param e the index of the point
 * @param step the step found at it
 * @returns true when `e` is the first point of the hold
 */
function startsHold(line: RatePoint[], e: number, step: Step): boolean {
  return e > 0 && Math.abs(pt(line, e - 1).v - step.to) > HOLD_WANDER * Math.abs(step.to - step.from)
}

/**
 * The latest step in some points, looking back from the newest.
 *
 * @param line the desired rate, in order of time
 * @param options what counts as a step
 * @returns the step, or null
 */
function latestStep(line: RatePoint[], options: StepOptions): Step | null {
  for (let e = line.length - 1; e > 0; e -= 1) {
    const found = stepAt(line, e, options)
    if (found !== null && startsHold(line, e, found)) {
      return found
    }
  }

  return null
}

/**
 * The latest step of the desired rate in the window.
 *
 * @param desired the desired rate, in order of time
 * @param options what counts as a step (STEP_DEFAULTS where not given)
 * @returns the step, or null when there is none in the window
 */
export function findStep(desired: RatePoint[], options: Partial<StepOptions> = {}): Step | null {
  const used = { ...STEP_DEFAULTS, ...options }
  const newest = desired.at(-1)?.t

  return newest === undefined ? null : latestStep(desired.filter(point => newest - point.t <= used.windowMs), used)
}

/**
 * Whether a line goes through a level between two points.
 *
 * @param a the first point
 * @param b the second point
 * @param level the level
 * @param up whether the rate is rising to it
 * @returns true when it is below the level at `a` and at or past it at `b` (the other way when not `up`)
 */
function crosses(a: RatePoint, b: RatePoint, level: number, up: boolean): boolean {
  return up ? a.v < level && b.v >= level : a.v > level && b.v <= level
}

/**
 * Where a rate crosses a level for the first time, between the samples (a straight line).
 *
 * @param line the points
 * @param level the level
 * @param up whether the rate is rising to it
 * @returns the time of the crossing, or null when it does not cross in the points
 */
function crossing(line: RatePoint[], level: number, up: boolean): number | null {
  for (let i = 1; i < line.length; i += 1) {
    const a = pt(line, i - 1)
    const b = pt(line, i)
    if (crosses(a, b, level, up)) {
      return a.t + (b.t - a.t) * ((level - a.v) / (b.v - a.v))
    }
  }

  return null
}

/**
 * The rise of the actual rate: from 10 % to 90 % of the step.
 *
 * @param span the actual rate, from just before the step to the end of its hold
 * @param step the step
 * @returns the time in ms, or null when it did not get to 90 % (or was past 10 % at the start)
 */
function riseOf(span: RatePoint[], step: Step): number | null {
  const size = step.to - step.from
  const t10 = crossing(span, step.from + 0.1 * size, size > 0)
  const t90 = crossing(span, step.from + 0.9 * size, size > 0)

  return t10 !== null && t90 !== null && t90 >= t10 ? t90 - t10 : null
}

/**
 * The overshoot of the actual rate over the step, in percent of the step.
 *
 * @param actual the actual rate, in the span of the step
 * @param step the step
 * @returns the percent (0 for none)
 */
function overshootOf(actual: RatePoint[], step: Step): number {
  const sign = Math.sign(step.to - step.from)
  const past = Math.max(0, ...actual.map(point => (point.v - step.to) * sign))

  return (past / Math.abs(step.to - step.from)) * 100
}

/**
 * When the rate came back into the band for the last time, from the time of the step.
 *
 * @param out the last point outside the band
 * @param into the point after it, which is inside
 * @param step the step
 * @param limit the half width of the band (deg/s)
 * @returns the time from the step in ms
 */
function enteredBand(out: RatePoint, into: RatePoint, step: Step, limit: number): number {
  const edge = step.to + Math.sign(out.v - step.to) * limit

  return out.t + (into.t - out.t) * ((edge - out.v) / (into.v - out.v)) - step.at
}

/**
 * How long the actual rate takes to get within the band of the new value for good.
 *
 * @param actual the actual rate, in the span of the step
 * @param step the step
 * @param band the band, as a fraction of the step
 * @returns the time from the step in ms, or null when it is not within the band at the end of the span
 */
function settlingOf(actual: RatePoint[], step: Step, band: number): number | null {
  const limit = band * Math.abs(step.to - step.from)
  const last = actual.findLastIndex(point => Math.abs(point.v - step.to) > limit)
  if (actual.length === 0 || last === actual.length - 1) {
    return null
  }

  return last < 0 ? 0 : enteredBand(pt(actual, last), pt(actual, last + 1), step, limit)
}

/**
 * The metrics of a step.
 *
 * @param step the step
 * @param actual the actual rate
 * @param used what counts as a step
 * @returns the step with its overshoot, rise and settling
 */
function measured(step: Step, actual: RatePoint[], used: StepOptions): StepMetrics {
  // The actual rate from just before the step to the end of its hold.
  const span = actual.filter(point => point.t >= step.at - used.edgeMs && point.t <= step.until)
  const after = span.filter(point => point.t >= step.at)

  return {
    ...step,
    overshootPct: after.length > 0 ? overshootOf(after, step) : null,
    riseMs: riseOf(span, step),
    settlingMs: settlingOf(after, step, used.band),
  }
}

/**
 * Measures the latest step of the desired rate against the actual rate.
 *
 * @param desired the desired rate, in order of time
 * @param actual the actual rate, in order of time
 * @param options what counts as a step (STEP_DEFAULTS where not given)
 * @returns the step with its overshoot, rise and settling (each null when the points do not say), or null when there is no step
 */
export function measureStep(desired: RatePoint[], actual: RatePoint[], options: Partial<StepOptions> = {}): StepMetrics | null {
  const used = { ...STEP_DEFAULTS, ...options }
  const step = findStep(desired, used)

  return step === null ? null : measured(step, actual, used)
}
