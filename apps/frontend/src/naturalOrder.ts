// The order of the parameters by name, from plain text (no DOM): ascending, a run of digits compared as a number (RC2_MIN comes
// before RC10_MIN, SERVO3_FUNCTION before SERVO10_FUNCTION), letters without regard to case, and punctuation before digits and
// letters (BATT_CAPACITY before BATT2_CAPACITY, as in the vehicle's own lists). Two names that are the same in every way
// compare equal, so a sort that is stable (every sort of an array is) keeps them in the order they came in.
import type { Param } from './generated/app'

/**
 * Whether a character is a digit.
 *
 * @param ch a character ('' at the end of a text)
 * @returns true for 0 to 9
 */
const isDigit = (ch: string): boolean => ch >= '0' && ch <= '9'

/**
 * Where a character sorts among the others: punctuation (the underscore) first, then digits, then letters without their case.
 *
 * @param ch a character
 * @returns a number to compare
 */
function weight(ch: string): number {
  const lower = ch.toLowerCase()
  const code = lower.charCodeAt(0)

  return /[\da-z]/u.test(lower) ? code : code - 1000
}

/**
 * The digits that start a text at a place.
 *
 * @param text the text
 * @param from where to look
 * @returns the run of digits (empty when the character there is not one)
 */
function runAt(text: string, from: number): string {
  let end = from
  while (isDigit(text.charAt(end))) {
    end += 1
  }

  return text.slice(from, end)
}

/**
 * Two runs of digits as numbers, of any length (no rounding): by their length without the leading zeros, then digit by digit.
 *
 * @param a a run of digits
 * @param b another
 * @returns below, at or above zero as the first is lower than, equal to or higher than the second
 */
function compareRuns(a: string, b: string): number {
  const x = a.replace(/^0+(?=\d)/u, '')
  const y = b.replace(/^0+(?=\d)/u, '')
  if (x.length !== y.length) {
    return x.length - y.length
  }

  return x < y ? -1 : Number(x > y)
}

/**
 * Compares what is at a place in each name: two runs of digits as numbers, anything else a character each.
 *
 * @param a a name
 * @param i the place in it
 * @param b another name
 * @param j the place in it
 * @returns how they compare, and how far each goes on
 */
function stepAt(a: string, i: number, b: string, j: number): [number, number, number] {
  const [x, y] = [runAt(a, i), runAt(b, j)]
  const order = x !== '' && y !== '' ? compareRuns(x, y) : weight(a.charAt(i)) - weight(b.charAt(j))

  return [order, Math.max(x.length, 1), Math.max(y.length, 1)]
}

/**
 * Two names in their natural order.
 *
 * @param a a name
 * @param b another
 * @returns below, at or above zero as the first comes before, with or after the second
 */
export function compareNames(a: string, b: string): number {
  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    const [order, stepA, stepB] = stepAt(a, i, b, j)
    if (order !== 0) {
      return order
    }
    i += stepA
    j += stepB
  }

  return (a.length - i) - (b.length - j)
}

/**
 * The parameters in the order of their names (the list is made once, when it comes in; the sort is stable).
 *
 * @param params the parameters
 * @returns a new list
 */
export function sortedByName<T extends Pick<Param, 'id'>>(params: readonly T[]): T[] {
  return [...params].sort((a, b) => compareNames(a.id, b.id))
}

/**
 * The parameters with one more in its place by name.
 *
 * @param params the parameters, in the order of their names
 * @param added the one to put in
 * @returns a new list
 */
export function withInPlace<T extends Pick<Param, 'id'>>(params: readonly T[], added: T): T[] {
  const at = params.findIndex(param => compareNames(param.id, added.id) > 0)

  return at < 0 ? [...params, added] : [...params.slice(0, at), added, ...params.slice(at)]
}
