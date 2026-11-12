// Whether what the user typed is a value a parameter can take, from its type alone (an error), and whether the metadata finds it
// unusual (a warning).
import type { Param } from '@/generated/app'
import { type Metadata, checkMeta } from './metadata'
import { say } from '@/i18n/say'
import { plainNumber, typedValue } from './paramValue'

/** A comma with exactly three digits after it: a decimal comma or a thousands group (see `plainNumber`). */
const AMBIGUOUS = /^[+-]?\d*,\d{3}$/u

/** The range of each integer type of the vehicle's parameters. */
const RANGES: Record<string, [number, number]> = {
  UINT8: [0, 255],
  INT8: [-128, 127],
  UINT16: [0, 65535],
  INT16: [-32768, 32767],
  UINT32: [0, 4294967295],
  INT32: [-2147483648, 2147483647],
}

/**
 * Whether a value is outside a range.
 *
 * @param range the lowest and the highest value
 * @param n the value
 * @returns true if it is below or above the range
 */
const outside = (range: [number, number], n: number) => n < range[0] || n > range[1]

/**
 * Why a whole-number parameter cannot take a value. A number with decimals is not a problem: it is taken as the nearest whole
 * number (the field shows that number once the value is settled), and it is that number that has to be in the range.
 *
 * @param param the parameter
 * @param n the value
 * @returns the problem, or null
 */
function integerProblem(param: Param, n: number): string | null {
  const range = RANGES[param.type]
  const whole = Math.round(n)
  if (range && outside(range, whole)) {
    return say('draft.range', { type: param.type, min: range[0], max: range[1] })
  }

  // ArduPilot takes a value over MAVLink as a 32-bit float: an integer above 2^24 is exact only where a float is.
  return Math.fround(whole) === whole ? null : say('draft.notExact', { value: whole })
}

/**
 * Why a parameter cannot take a value, given its type.
 *
 * @param param the parameter
 * @param n the value
 * @returns the problem, or null
 */
function typeProblem(param: Param, n: number): string | null {
  if (param.kind === 'int') {
    return integerProblem(param, n)
  }

  return param.type === 'REAL32' && !Number.isFinite(Math.fround(n)) ? say('draft.tooLarge') : null
}

/**
 * Why `text` isn't a valid new value for `param`, or null if it is.
 *
 * @param param the parameter being edited
 * @param text what the user typed
 * @returns the problem, or null
 */
export function validateDraft(param: Param, text: string): string | null {
  const trimmed = plainNumber(text)
  if (trimmed === '' || !Number.isFinite(Number(trimmed))) {
    // "1,500" and "0,500" may be a decimal or a thousands group: they are not guessed at, and the text says why.
    return AMBIGUOUS.test(text.trim()) ? say('draft.ambiguous', { text: text.trim() }) : say('draft.number')
  }

  return typeProblem(param, Number(trimmed))
}

/**
 * What is unusual about `text` as a new value for `param` according to the metadata, if any is loaded: a value outside its
 * range or not among its values. A warning only: the vehicle validates, and a text that is not a valid value has none.
 *
 * @param metadata the loaded parameter metadata
 * @param param the parameter being edited
 * @param text what the user typed
 * @returns the warning, or null
 */
export function draftWarning(metadata: Metadata, param: Param, text: string): string | null {
  return validateDraft(param, text) === null ? checkMeta(metadata.get(param.id), typedValue(param, text)) : null
}
