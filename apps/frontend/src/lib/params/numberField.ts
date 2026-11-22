// What a numeric parameter field does with a number, from plain values (no DOM): the text for a stored value in the
// unit it is shown in, what a typed text stands for (and why it is not a value), and a step of the arrow keys. Limits
// and the step are in the stored unit (the metadata's); the text is in the shown one (lib/params/units.ts).
import { plainNumber } from './paramValue'
import { type UnitView, shownText, toDisplay, toStored } from './units'

/** What a numeric field knows about the parameter. */
export interface NumberSpec {
  /** How the unit is shown. */
  view: UnitView
  /** The lowest value, in the stored unit. */
  min?: number
  /** The highest value, in the stored unit. */
  max?: number
  /** The step of the arrow keys, in the stored unit (1 when none). */
  step?: number
  /** The parameter holds whole numbers: a typed value with decimals is taken as the nearest whole number. */
  integer?: boolean
}

/** Why a text is not a value: nothing typed, not a number, under the lowest, over the highest. */
export interface Problem {
  /** Which. */
  code: 'empty' | 'nan' | 'low' | 'high'
  /** The limit that was passed, in the shown unit (for `low` and `high`). */
  limit?: number
}

/** What a typed text stands for. */
export type Parsed = { ok: true, stored: number } | { ok: false, problem: Problem }

/**
 * The text of a stored value in the shown unit.
 *
 * @param stored the stored value
 * @param spec what the field knows
 * @returns the text
 */
export function showStored(stored: number, spec: NumberSpec): string {
  return shownText(toDisplay(stored, spec.view), spec.view)
}

/**
 * A stored value held to the limits.
 *
 * @param stored the value
 * @param spec what the field knows
 * @returns the value, or the limit it passed
 */
export function clamped(stored: number, spec: NumberSpec): number {
  return Math.min(spec.max ?? Number.POSITIVE_INFINITY, Math.max(spec.min ?? Number.NEGATIVE_INFINITY, stored))
}

/**
 * Whether a stored value is under the lowest.
 *
 * @param stored the value
 * @param spec what the field knows
 * @returns the problem, or null
 */
function lowProblem(stored: number, spec: NumberSpec): Problem | null {
  return spec.min !== undefined && stored < spec.min ? { code: 'low', limit: toDisplay(spec.min, spec.view) } : null
}

/**
 * Whether a stored value is over the highest.
 *
 * @param stored the value
 * @param spec what the field knows
 * @returns the problem, or null
 */
function highProblem(stored: number, spec: NumberSpec): Problem | null {
  return spec.max !== undefined && stored > spec.max ? { code: 'high', limit: toDisplay(spec.max, spec.view) } : null
}

/**
 * Which limit a stored value passes.
 *
 * @param stored the value
 * @param spec what the field knows
 * @returns the problem, or null when it is in range
 */
function limitProblem(stored: number, spec: NumberSpec): Problem | null {
  return lowProblem(stored, spec) ?? highProblem(stored, spec)
}

/**
 * Why a text is not a number at all.
 *
 * @param plain the text, with the decimal point
 * @returns the problem, or null when it is a number
 */
function notNumber(plain: string): Problem | null {
  if (plain === '') {
    return { code: 'empty' }
  }

  return Number.isFinite(Number(plain)) ? null : { code: 'nan' }
}

/**
 * The stored value for a shown number: the nearest whole number for a parameter of whole numbers.
 *
 * @param shown the shown number
 * @param spec what the field knows
 * @returns the stored value
 */
function storedOf(shown: number, spec: NumberSpec): number {
  const stored = toStored(shown, spec.view)

  return spec.integer ? Math.round(stored) : stored
}

/**
 * What a typed text stands for.
 *
 * @param text what was typed (a decimal comma is taken for a point where that is not a guess)
 * @param spec what the field knows
 * @returns the stored value, or why the text is not one
 */
export function parseNumber(text: string, spec: NumberSpec): Parsed {
  const plain = plainNumber(text)
  const bad = notNumber(plain)

  if (bad !== null) {
    return { ok: false, problem: bad }
  }
  const stored = storedOf(Number(plain), spec)
  const problem = limitProblem(stored, spec)

  return problem === null ? { ok: true, stored } : { ok: false, problem }
}

/**
 * The value after a step of the arrow keys (a bigger one with Shift or the page keys), held to the limits.
 *
 * @param stored the value now
 * @param direction 1 up, -1 down
 * @param big whether the step is ten times as long
 * @param spec what the field knows
 * @returns the new value
 */
export function stepped(stored: number, direction: 1 | -1, big: boolean, spec: NumberSpec): number {
  const by = (spec.step ?? 1) * (big ? 10 : 1)

  return clamped(Number((stored + (direction * by)).toPrecision(12)), spec)
}
