// The performance budgets (#22): apps/frontend/budgets.json says them, this judges measurements against them. A timing is a set
// of samples, judged on the MEDIAN against the budget and on the 95th percentile against the budget times its `noise`: one slow
// sample on a busy CI runner must not fail the build, a change that makes every other sample slow must. A size has one sample.
// Every verdict is written to the run's log and, in GitHub Actions, to the job's summary, so a budget that creeps up is seen
// before it fails.
import { appendFileSync, existsSync, readFileSync } from 'node:fs'
import { expect } from 'vitest'

/** One budget, as budgets.json says it. */
export interface Budget {
  /** What the samples are in: `ms` or `KiB`. */
  unit: string
  /** The most the median may be. */
  budget: number
  /** How many times the budget the 95th percentile may be (1 for an exact measurement). */
  noise: number
  /** What is measured, from where to where. */
  what: string
  /** The specs that measure it, relative to apps/frontend, separated by ", ". */
  measuredBy: string
}

/** The budgets, by name. */
export const BUDGETS: Record<string, Budget> = (JSON.parse(
  readFileSync(new URL('../budgets.json', import.meta.url), 'utf8'),
) as { budgets: Record<string, Budget> }).budgets

/** What a set of samples gave against its budget. */
export interface Verdict {
  /** The budget's name. */
  name: string
  /** The unit of the numbers. */
  unit: string
  /** How many samples were judged. */
  samples: number
  /** The median of the samples. */
  median: number
  /** The 95th percentile of the samples. */
  p95: number
  /** The most the median may be. */
  budget: number
  /** The most the 95th percentile may be. */
  limit95: number
  /** Whether both are within their limits. */
  ok: boolean
  /** The verdict in one line, for the log and a failing expectation. */
  line: string
}

/**
 * A number to a tenth, for people.
 *
 * @param value the number
 * @returns it rounded
 */
const tenth = (value: number): number => Math.round(value * 10) / 10

/**
 * A percentile of some numbers: the value at that share of them, sorted (the median of an even count is the upper middle).
 *
 * @param values the numbers
 * @param share between 0 and 1
 * @returns the value, 0 for no numbers
 */
export function percentile(values: number[], share: number): number {
  const sorted = [...values].sort((a, b) => a - b)

  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * share))] ?? 0
}

/**
 * The budget of a name in budgets.json.
 *
 * @param name the budget's name
 * @returns the budget
 * @throws {Error} for a name budgets.json doesn't have
 */
export function budgetOf(name: string): Budget {
  const budget = BUDGETS[name]
  if (!budget) {
    throw new Error(`apps/frontend/budgets.json has no budget "${name}"`)
  }

  return budget
}

/**
 * A verdict in one line: whether it is within the budget, and the numbers.
 *
 * @param verdict the verdict, without its line
 * @returns the line
 */
function sentence(verdict: Omit<Verdict, 'line'>): string {
  const { name, unit, median, p95, budget, limit95, samples } = verdict
  const within = verdict.ok ? 'within' : 'OVER'

  return `${within} budget ${name}: median ${tenth(median)} ${unit} (budget ${budget}), `
    + `95th ${tenth(p95)} ${unit} (at most ${tenth(limit95)}), ${samples} samples`
}

/**
 * Judges samples against a budget: the median must be within it and the 95th percentile within it times its noise.
 *
 * @param name the budget's name in budgets.json
 * @param samples the measurements, in the budget's unit
 * @param budget the budget (budgets.json's by default; a test of the judging gives its own)
 * @returns the verdict
 * @throws {Error} without samples: a check that measured nothing must not pass
 */
export function judge(name: string, samples: number[], budget: Budget = budgetOf(name)): Verdict {
  if (samples.length === 0) {
    throw new Error(`no samples for the budget "${name}"`)
  }
  const median = percentile(samples, 0.5)
  const p95 = percentile(samples, 0.95)
  const limit95 = budget.budget * budget.noise
  const verdict = {
    name, unit: budget.unit, samples: samples.length, median, p95, budget: budget.budget, limit95,
    ok: median <= budget.budget && p95 <= limit95,
  }

  return { ...verdict, line: sentence(verdict) }
}

/** The head of the summary's table of verdicts. */
const SUMMARY_HEADER = '| Budget | Median | 95th | Budget | Samples |'

/**
 * A verdict as a row of the job summary's table, with the table's head before the first one.
 *
 * @param summary the summary file (GITHUB_STEP_SUMMARY)
 * @param verdict the verdict
 */
function addRow(summary: string, verdict: Verdict): void {
  if (!existsSync(summary) || !readFileSync(summary, 'utf8').includes(SUMMARY_HEADER)) {
    appendFileSync(summary, `\n### Performance budgets\n\n${SUMMARY_HEADER}\n|---|---|---|---|---|\n`)
  }
  const mark = verdict.ok ? '✅' : '❌'
  const limits = `${verdict.budget} (95th ≤ ${tenth(verdict.limit95)}) ${verdict.unit}`
  const numbers = `${tenth(verdict.median)} | ${tenth(verdict.p95)}`
  appendFileSync(summary, `| ${mark} ${verdict.name} | ${numbers} | ${limits} | ${verdict.samples} |\n`)
}

/**
 * Says a verdict in the run's log and, in GitHub Actions, as a row of the job's summary.
 *
 * @param verdict the verdict
 */
export function report(verdict: Verdict): void {
  console.info(verdict.line)
  const summary = process.env.GITHUB_STEP_SUMMARY
  if (summary) {
    addRow(summary, verdict)
  }
}

/**
 * Judges samples against their budget, says the verdict, and fails the test when the budget is missed.
 *
 * @param name the budget's name in budgets.json
 * @param samples the measurements, in the budget's unit
 * @returns the verdict
 */
export function expectWithinBudget(name: string, samples: number[]): Verdict {
  const verdict = judge(name, samples)
  report(verdict)
  expect(verdict.ok, verdict.line).toBe(true)

  return verdict
}
