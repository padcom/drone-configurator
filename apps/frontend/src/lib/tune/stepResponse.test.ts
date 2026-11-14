// The step detector and the metrics, on responses of which the answer is known: a first-order lag (rise 2.197 time constants,
// settling to 5 % in 3.0, no overshoot) and a second-order response (damping 0.5: 16.3 % overshoot), sampled as the vehicle does
// (25 Hz) and finer, with and without noise, with no step, with several, and with points missing. Nothing in it is drawn from a
// model of the vehicle: the signals are the test's own, the module sees only points.
import { describe, expect, it } from 'vitest'
import { type RatePoint, findStep, measureStep } from './stepResponse'

const T0 = 100_000
const RATE = 57.3

/** The levels the desired rate has, from when (ms after T0). */
type Levels = [at: number, level: number][]

/** How a signal is sampled: how long, and how far apart (ms). */
interface Sampling {
  end: number
  dt: number
}

/**
 * What a measure is, when there is one.
 *
 * @param value the measure, or null
 * @returns the measure
 * @throws {Error} when there is none
 */
function need<T>(value: T | null): T {
  if (value === null) {
    throw new Error('there is no step')
  }

  return value
}

/**
 * The level of the signal at a time: the level of the last entry that is not later.
 *
 * @param levels what it is and from when
 * @param at the time (ms after T0)
 * @returns the level
 */
function levelAt(levels: Levels, at: number): number {
  return levels.filter(([from]) => from <= at).at(-1)?.[1] ?? 0
}

/**
 * The desired rate sampled, a step being one sample.
 *
 * @param levels what it is and from when
 * @param sampling how long and how often
 * @returns the points
 */
function desiredOf(levels: Levels, sampling: Sampling): RatePoint[] {
  const out: RatePoint[] = []

  for (let at = 0; at <= sampling.end; at += sampling.dt) {
    out.push({ t: T0 + at, v: levelAt(levels, at) })
  }

  return out
}

/**
 * The response of a system with a damping `zeta` and a natural frequency `wn`, integrated in steps of 1 ms and sampled.
 *
 * @param levels what the system is given
 * @param sampling how long and how often
 * @param system the damping and the natural frequency (rad/s)
 * @param system.zeta the damping
 * @param system.wn the natural frequency
 * @returns the points
 */
function secondOrder(levels: Levels, sampling: Sampling, system: { zeta: number, wn: number }): RatePoint[] {
  const out: RatePoint[] = []
  let x = 0
  let v = 0

  for (let at = 0; at <= sampling.end; at += 1) {
    v += (system.wn * system.wn * (levelAt(levels, at) - x) - 2 * system.zeta * system.wn * v) * 0.001
    x += v * 0.001

    if (at % sampling.dt === 0) {
      out.push({ t: T0 + at, v: x })
    }
  }

  return out
}

/**
 * The response of a first-order lag, sampled.
 *
 * @param levels what the system is given
 * @param sampling how long and how often
 * @param tau the time constant (ms)
 * @returns the points
 */
function lagOf(levels: Levels, sampling: Sampling, tau: number): RatePoint[] {
  const out: RatePoint[] = []
  let x = 0

  for (let at = 0; at <= sampling.end; at += 1) {
    x += (levelAt(levels, at) - x) * (1 - Math.exp(-1 / tau))

    if (at % sampling.dt === 0) {
      out.push({ t: T0 + at, v: x })
    }
  }

  return out
}

/**
 * Noise that is the same every run (a linear congruential generator), within +-`size`.
 *
 * @param line the points
 * @param size the most it adds
 * @returns the points with noise
 */
function noisy(line: RatePoint[], size: number): RatePoint[] {
  let seed = 12_345

  return line.map(point => {
    seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648

    return { t: point.t, v: point.v + ((seed / 2_147_483_648) * 2 - 1) * size }
  })
}

const UP: Levels = [[0, 0], [1000, RATE]]
const FINE: Sampling = { end: 3000, dt: 10 }
const VEHICLE: Sampling = { end: 3000, dt: 40 }
const DAMPED = { zeta: 0.5, wn: 15 }

describe('a first-order response', () => {
  it('has no overshoot, a rise of 2.2 time constants and a settling of 3 (to 5 %)', () => {
    const metrics = need(measureStep(desiredOf(UP, FINE), lagOf(UP, FINE, 100)))

    expect(metrics.at).toBe(T0 + 1000)
    expect(metrics.overshootPct).toBeCloseTo(0, 5)
    expect(metrics.riseMs).toBeGreaterThan(210)
    expect(metrics.riseMs).toBeLessThan(230)
    expect(metrics.settlingMs).toBeGreaterThan(290)
    expect(metrics.settlingMs).toBeLessThan(315)
  })

  it('is measured as well at the 25 Hz the vehicle reports at, the crossings found between the samples', () => {
    const metrics = need(measureStep(desiredOf(UP, VEHICLE), lagOf(UP, VEHICLE, 100)))

    expect(Math.abs(Number(metrics.riseMs) - 220)).toBeLessThan(15)
    expect(Math.abs(Number(metrics.settlingMs) - 300)).toBeLessThan(40)
  })

  it('is measured through noise on both lines', () => {
    const desired = noisy(desiredOf(UP, VEHICLE), 1.5)
    const metrics = need(measureStep(desired, noisy(lagOf(UP, VEHICLE, 100), 1.5)))

    expect(Math.abs(Number(metrics.riseMs) - 220)).toBeLessThan(40)
    expect(Number(metrics.overshootPct)).toBeLessThan(6)
  })
})

describe('a second-order response with a damping of 0.5', () => {
  const fine = need(measureStep(desiredOf(UP, { end: 3000, dt: 1 }), secondOrder(UP, { end: 3000, dt: 1 }, DAMPED)))

  it('has the overshoot of the theory, 16.3 %', () => {
    expect(fine.overshootPct).toBeGreaterThan(15.8)
    expect(fine.overshootPct).toBeLessThan(16.8)
  })

  it('is measured at 25 Hz as it is finer, within a sample', () => {
    const coarse = need(measureStep(desiredOf(UP, VEHICLE), secondOrder(UP, VEHICLE, DAMPED)))

    expect(Math.abs(Number(coarse.overshootPct) - Number(fine.overshootPct))).toBeLessThan(2.5)
    expect(Math.abs(Number(coarse.riseMs) - Number(fine.riseMs))).toBeLessThan(25)
    expect(Math.abs(Number(coarse.settlingMs) - Number(fine.settlingMs))).toBeLessThan(90)
  })

  it('is measured through noise', () => {
    const metrics = need(measureStep(noisy(desiredOf(UP, VEHICLE), 1.5), noisy(secondOrder(UP, VEHICLE, DAMPED), 1.5)))

    expect(Math.abs(Number(metrics.overshootPct) - 16.3)).toBeLessThan(4)
  })
})

describe('finding no step', () => {
  it('finds none in a desired rate that does not move, or moves less than a step', () => {
    const still = desiredOf([[0, 0]], { end: 5000, dt: 40 })

    expect(findStep(still)).toBeNull()
    expect(findStep(noisy(desiredOf([[0, 5]], { end: 5000, dt: 40 }), 8))).toBeNull()
    expect(measureStep(still, lagOf([[0, 0]], { end: 5000, dt: 40 }, 100))).toBeNull()
    expect(findStep([])).toBeNull()
  })

  it('looks only at the window: a step older than it is not found', () => {
    const desired = desiredOf(UP, { end: 16_000, dt: 40 })

    expect(findStep(desired)).toBeNull()
    expect(findStep(desired, { windowMs: 20_000 })?.at).toBe(T0 + 1000)
  })
})

describe('finding the latest step', () => {
  const DOWN: Levels = [[0, 0], [1000, RATE], [3000, 0]]

  it('takes the latest step, a step down too, and measures what is below the new value as the overshoot', () => {
    const sampling = { end: 5000, dt: 10 }
    const metrics = need(measureStep(desiredOf(DOWN, sampling), secondOrder(DOWN, sampling, DAMPED)))

    expect(metrics.at).toBe(T0 + 3000)
    expect([metrics.from, metrics.to]).toEqual([RATE, 0])
    expect(metrics.overshootPct).toBeGreaterThan(15)
    expect(metrics.overshootPct).toBeLessThan(18)
  })

  it('does not take a step that has not held long enough yet: the one before it is measured', () => {
    const sampling = { end: 3300, dt: 10 }
    const metrics = need(measureStep(desiredOf(DOWN, sampling), lagOf(DOWN, sampling, 100)))

    expect(metrics.at).toBe(T0 + 1000)
    expect(metrics.to).toBe(RATE)
  })

  it('takes a ramp of a few samples as one step', () => {
    const step = need(findStep(desiredOf([[0, 0], [1000, 20], [1040, 40], [1080, RATE]], VEHICLE)))

    expect([step.from, step.to, step.at]).toEqual([0, RATE, T0 + 1080])
  })
})

describe('what cannot be measured is null, and the step is still there', () => {
  it('has the step and no metrics when no actual rate came', () => {
    const metrics = need(measureStep(desiredOf(UP, VEHICLE), []))

    expect(metrics.at).toBe(T0 + 1000)
    expect([metrics.overshootPct, metrics.riseMs, metrics.settlingMs]).toEqual([null, null, null])
  })

  it('has no rise when the actual rate never gets to 90 %, and no settling when it does not stay in the band', () => {
    const desired = desiredOf(UP, VEHICLE)
    const slow = need(measureStep(desired, lagOf(UP, VEHICLE, 5000)))
    const ringing = need(measureStep(desired, secondOrder(UP, VEHICLE, { zeta: 0, wn: 15 })))

    expect([slow.riseMs, slow.settlingMs, ringing.settlingMs]).toEqual([null, null, null])
    expect(ringing.overshootPct).toBeGreaterThan(90)
  })
})
