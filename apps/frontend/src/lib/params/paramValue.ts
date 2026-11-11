// The value of a parameter as a number the vehicle can hold, and as the text a person reads, from plain numbers (no DOM). The
// vehicle's integers have no decimals, and its floats (REAL32) hold about 7 digits: the number that comes over the wire for 0.1
// is 0.10000000149011612, and a typed 0.1 is not equal to it until both are the float. So every value enters the interface as
// the number the vehicle holds (`canonical`), values are compared as those numbers, and they are shown as the shortest text that
// reads back as the same number (`showNumber`): 0.1, 3.3, 16777216.

/** The parameter's kind and type: what decides how its values are held. */
export interface ValueType {
  /** `int` for a whole-number parameter, `real` for a float. */
  kind: string
  /** INT8, UINT16, REAL32 and so on. */
  type: string
}

/** The most digits a float (REAL32) needs to be read back as the same number. */
const FLOAT_DIGITS = 9

/** The digits of a double that are meaningful (it has 15 to 17; the 16th and the 17th are mostly noise). */
const DOUBLE_DIGITS = 15

/**
 * The number the vehicle holds for a value: a whole number for an integer parameter (the nearest one), the float nearest to it
 * for a REAL32, and the number itself for anything wider (REAL64).
 *
 * @param param the parameter's kind and type
 * @param n the value (typed, or from the wire)
 * @returns the number the vehicle would hold
 */
export function canonical(param: ValueType, n: number): number {
  // `+ 0` makes a -0 a 0 (the rounding of -0.4, a -0.0 from the wire, a typed "-0", a float that is too small for a REAL32 and
  // rounds to -0): nothing is compared, shown, queued or sent as a negative zero. NaN and the infinities are not changed by it.
  if (param.kind === 'int') {
    return Math.round(n) + 0
  }

  return (param.type === 'REAL32' ? Math.fround(n) : n) + 0
}

/**
 * A parameter whose value is the number the vehicle holds.
 *
 * @param param the parameter
 * @returns the same parameter (or a copy, when its value was not that number)
 */
export function canonParam<T extends ValueType & { value: number }>(param: T): T {
  const value = canonical(param, param.value)

  return Object.is(value, param.value) ? param : { ...param, value }
}

/** One comma, and not exactly three digits after it ("1,500" may be a thousand five hundred: it is not guessed at). */
const DECIMAL_COMMA = /^[+-]?\d*,(?!\d{3}$)\d*$/u

/**
 * A typed number with the decimal comma of many languages ("0,5") as a number with the decimal point. Only one comma, with no
 * point in the text and not exactly three digits after the comma, is taken for a decimal comma; anything else is left as it is
 * ("1,2,3" and "1,500.5" are not numbers, and "1,500" is not guessed to be 1.5: it is not a number either, rather than a wrong
 * one). Values are shown with a point whatever the language (they are the wire's), but a person may type either.
 *
 * @param text what was typed
 * @returns the text, trimmed, with the comma made a point when it was a decimal comma
 */
export function plainNumber(text: string): string {
  const trimmed = text.trim()

  return DECIMAL_COMMA.test(trimmed) ? trimmed.replace(',', '.') : trimmed
}

/**
 * The number a typed text stands for, as the vehicle holds it.
 *
 * @param param the parameter's kind and type
 * @param text what was typed (a number: the caller has checked)
 * @returns the number the vehicle would hold
 */
export function typedValue(param: ValueType, text: string): number {
  return canonical(param, Number(plainNumber(text)))
}

/**
 * The shortest text that is the same float.
 *
 * @param n a number that is a float
 * @returns the text, without the digits of the double that only the widening put there
 */
function shortestFloat(n: number): string {
  for (let digits = 1; digits <= FLOAT_DIGITS; digits += 1) {
    const text = n.toPrecision(digits)
    if (Math.fround(Number(text)) === n) {
      return String(Number(text))
    }
  }

  return String(n)
}

/**
 * A value as the text a person reads: a whole number as it is (to the last digit), a float as the shortest text that is the same
 * float (0.1, not 0.10000000149011612), and any other number to the 15 digits a double keeps.
 *
 * @param n the value
 * @returns the text
 */
export function showNumber(n: number): string {
  if (Number.isInteger(n) && Math.abs(n) <= Number.MAX_SAFE_INTEGER) {
    return String(n)
  }

  return Math.fround(n) === n ? shortestFloat(n) : String(Number(n.toPrecision(DOUBLE_DIGITS)))
}

/**
 * What a write that the vehicle did not confirm says: the value it reports, and the one that was written.
 *
 * @param reported the value the vehicle read back
 * @param written the value that was written
 * @returns the sentence
 */
export function notConfirmedText(reported: number, written: number): string {
  return `the vehicle reports ${showNumber(reported)}, not ${showNumber(written)}`
}
