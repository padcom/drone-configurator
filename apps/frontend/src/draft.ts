// Whether what the user typed is a value a parameter can take, from its type alone (the metadata adds its own limits).
import type { Param } from './generated/app'

/** The range of each integer type of the vehicle's parameters. */
const RANGES: Record<string, [number, number]> = {
  UINT8: [0, 255],
  INT8: [-128, 127],
  UINT16: [0, 65535],
  INT16: [-32768, 32767],
  UINT32: [0, 4294967295],
  INT32: [-2147483648, 2147483647],
}

/** The largest magnitude a REAL32 holds. */
const REAL32_MAX = 3.4e38

/**
 * Whether a value is outside a range.
 *
 * @param range the lowest and the highest value
 * @param n the value
 * @returns true if it is below or above the range
 */
const outside = (range: [number, number], n: number) => n < range[0] || n > range[1]

/**
 * Why a whole-number parameter cannot take a value.
 *
 * @param param the parameter
 * @param n the value
 * @returns the problem, or null
 */
function integerProblem(param: Param, n: number): string | null {
  if (!Number.isInteger(n)) {
    return `${param.id} is an integer (${param.type})`
  }
  const range = RANGES[param.type]

  return range && outside(range, n) ? `${param.type} goes from ${range[0]} to ${range[1]}` : null
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

  return param.type === 'REAL32' && Math.abs(n) > REAL32_MAX ? 'too large for a REAL32' : null
}

/**
 * Why `text` isn't a valid new value for `param`, or null if it is.
 *
 * @param param the parameter being edited
 * @param text what the user typed
 * @returns the problem, or null
 */
export function validateDraft(param: Param, text: string): string | null {
  const trimmed = text.trim()
  if (trimmed === '' || !Number.isFinite(Number(trimmed))) {
    return 'a number, please'
  }

  return typeProblem(param, Number(trimmed))
}
