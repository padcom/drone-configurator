// @vitest-environment node
// The judging of the performance budgets (e2e/budgets.ts) and the file that says them (budgets.json): what passes, what a
// deliberate slowdown does to a passing set of samples, and that every budget names the spec that measures it.
import { existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { BUDGETS, type Budget, budgetOf, judge, percentile } from './budgets'

/** A budget for these tests: 100 ms, the 95th percentile within twice that. */
const SWITCH: Budget = { unit: 'ms', budget: 100, noise: 2, what: 'a test', measuredBy: 'e2e/budgets.test.ts' }

/** Switch times as a healthy app gives them (ms): mostly a few frames, one slow sample. */
const HEALTHY = [18, 17, 21, 16, 19, 33, 17, 18, 20, 16, 17, 140, 19, 18, 16, 17, 22, 18, 17, 16]

/**
 * The same samples with a slowdown added to some of them, as a regression would.
 *
 * @param samples the samples
 * @param ms what is added
 * @param every to every this-many-th sample (1: to all)
 * @returns the slowed samples
 */
function slowedDown(samples: number[], ms: number, every: number): number[] {
  return samples.map((value, i) => (i % every === 0 ? value + ms : value))
}

/**
 * Whether every spec a budget names exists.
 *
 * @param measuredBy the specs, relative to apps/frontend, separated by ", "
 * @returns the specs that don't exist
 */
function missingSpecs(measuredBy: string): string[] {
  return measuredBy.split(', ').filter(spec => !existsSync(new URL(`../${spec}`, import.meta.url)))
}

describe('the judging of a budget', () => {
  it('passes samples whose median and 95th percentile are within it, with one slow sample', () => {
    const verdict = judge('screenSwitch', HEALTHY, SWITCH)

    expect(verdict.ok).toBe(true)
    expect(verdict.median).toBe(18)
    expect(verdict.line).toContain('within budget screenSwitch: median 18 ms')
  })

  it('refuses to judge nothing: a check that measured nothing does not pass', () => {
    expect(() => judge('screenSwitch', [], SWITCH)).toThrow('no samples')
  })

  it('takes the upper middle as the median of an even count', () => {
    expect(percentile([1, 2, 3, 4], 0.5)).toBe(3)
    expect(percentile([5], 0.95)).toBe(5)
  })
})

describe('a deliberate slowdown', () => {
  it('fails the budget when it makes every sample slow (the median)', () => {
    const verdict = judge('screenSwitch', slowedDown(HEALTHY, 100, 1), SWITCH)

    expect(verdict.ok).toBe(false)
    expect(verdict.line).toMatch(/^OVER budget screenSwitch: median 118 ms/u)
  })

  it('fails the budget when it hits every fourth sample hard enough (the 95th percentile)', () => {
    const verdict = judge('screenSwitch', slowedDown(HEALTHY, 250, 4), SWITCH)

    expect(verdict.median).toBeLessThanOrEqual(100)
    expect(verdict.p95).toBeGreaterThan(200)
    expect(verdict.ok).toBe(false)
  })
})

describe('budgets.json', () => {
  it('has the budgets #22 names, with the values it asks for', () => {
    const { coldStart, screenSwitch, longTask, initialJs } = BUDGETS

    expect([coldStart, screenSwitch, longTask].map(budget => budget && budget.budget)).toEqual([2000, 100, 50])
    expect(initialJs && initialJs.unit).toBe('KiB')
  })

  it('has the telemetry budgets #26 names: 20 updates a second at most, under 5% of the main thread at idle', () => {
    expect(budgetOf('telemetryUpdates')).toMatchObject({ budget: 20, unit: '/s', noise: 1 })
    expect(budgetOf('telemetryIdleCpu')).toMatchObject({ budget: 5, unit: '%' })
  })

  it.each(Object.entries(BUDGETS))('says what %s is, its unit, its budget, a noise of 1 or more, and its specs', (_, budget) => {
    expect(budget.what.length).toBeGreaterThan(10)
    expect(['ms', 'KiB', '/s', '%']).toContain(budget.unit)
    expect(budget.budget).toBeGreaterThan(0)
    expect(budget.noise).toBeGreaterThanOrEqual(1)
    expect(missingSpecs(budget.measuredBy)).toEqual([])
  })
})
