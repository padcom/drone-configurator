// One place for numbers, dates and units, in the language of the interface (Intl-based), so components never call
// `toFixed` or `toLocaleString` themselves. The language is read each time something is formatted, so the text
// follows a language switch; the Intl formatters are made once per language and number of decimals.
import { i18n } from './i18n'

/** Keeps a number and its unit on one line. */
const NO_BREAK_SPACE = String.fromCodePoint(0xA0)

/** A language tag, or something that tells the current one. */
export type Locale = string | (() => string)

/** How a value is shown to the user. */
export interface Format {
  /** A number with exactly `digits` decimals. */
  number: (value: number, digits?: number) => string
  /** A date and time, in the user's language. */
  dateTime: (value: Date) => string
  /** The time of day with seconds, in the user's language. */
  time: (value: Date) => string
  /** A quantity: the number, a no-break space and the unit. */
  quantity: (value: number, unit: string, digits?: number) => string
}

const numberFormats = new Map<string, Intl.NumberFormat>()
const dateFormats = new Map<string, Intl.DateTimeFormat>()
const timeFormats = new Map<string, Intl.DateTimeFormat>()

/**
 * The number formatter for a language and a number of decimals.
 *
 * @param locale a BCP 47 language tag
 * @param digits how many decimals to show
 * @returns the formatter, made on first use
 */
function numberFormat(locale: string, digits: number): Intl.NumberFormat {
  const key = `${locale}:${digits}`
  const known = numberFormats.get(key)
  if (known) {
    return known
  }
  // 'negative': a value that rounds to zero is "0.0", never "-0.0" (the backend rounds angles, which can give -0).
  const made = new Intl.NumberFormat(locale, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
    signDisplay: 'negative',
  })
  numberFormats.set(key, made)

  return made
}

/**
 * The date and time formatter for a language.
 *
 * @param locale a BCP 47 language tag
 * @returns the formatter, made on first use
 */
function dateFormat(locale: string): Intl.DateTimeFormat {
  const known = dateFormats.get(locale)
  if (known) {
    return known
  }
  const made = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'medium' })
  dateFormats.set(locale, made)

  return made
}

/**
 * The time-of-day formatter for a language.
 *
 * @param locale a BCP 47 language tag
 * @returns the formatter, made on first use
 */
function timeFormat(locale: string): Intl.DateTimeFormat {
  const known = timeFormats.get(locale)
  if (known) {
    return known
  }
  const made = new Intl.DateTimeFormat(locale, { timeStyle: 'medium' })
  timeFormats.set(locale, made)

  return made
}

/**
 * Converts a value into the unit the user prefers. This is the hook for the unit settings (#179): until then every
 * value is shown in the unit it was reported in.
 *
 * @param value the value, in the unit the vehicle reports
 * @param unit that unit's symbol
 * @returns the value and unit to show
 */
export function preferredUnit(value: number, unit: string): { value: number, unit: string } {
  return { value, unit }
}

/**
 * Formats numbers, dates and quantities for a language.
 *
 * @param locale a BCP 47 language tag such as `en`, or a function that returns the current one
 * @returns the formatters
 */
export function formatFor(locale: Locale): Format {
  const current = () => typeof locale === 'function' ? locale() : locale
  const number = (value: number, digits = 0) => numberFormat(current(), digits).format(value)

  return {
    number,
    dateTime: value => dateFormat(current()).format(value),
    time: value => timeFormat(current()).format(value),
    quantity: (value, unit, digits = 0) => {
      const shown = preferredUnit(value, unit)

      return `${number(shown.value, digits)}${NO_BREAK_SPACE}${shown.unit}`
    },
  }
}

/**
 * The formatters for the language the interface is in, now and after it is switched.
 *
 * @returns the formatters
 */
export function useFormat(): Format {
  return formatFor(() => i18n.global.locale.value)
}
