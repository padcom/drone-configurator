// One place for numbers, dates and units, in the language of the interface (Intl-based), so components never call
// `toFixed` or `toLocaleString` themselves.
import { i18n } from './i18n'

/** Keeps a number and its unit on one line. */
const NO_BREAK_SPACE = String.fromCodePoint(0xA0)

/** How a value is shown to the user. */
export interface Format {
  /** A number with exactly `digits` decimals. */
  number: (value: number, digits?: number) => string
  /** A date and time, in the user's language. */
  dateTime: (value: Date) => string
  /** A quantity: the number, a no-break space and the unit. */
  quantity: (value: number, unit: string, digits?: number) => string
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
 * @param locale a BCP 47 language tag, such as `en`
 * @returns the formatters
 */
export function formatFor(locale: string): Format {
  const number = (value: number, digits = 0) => new Intl.NumberFormat(locale, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value)

  return {
    number,
    dateTime: value => new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'medium' }).format(value),
    quantity: (value, unit, digits = 0) => {
      const shown = preferredUnit(value, unit)

      return `${number(shown.value, digits)}${NO_BREAK_SPACE}${shown.unit}`
    },
  }
}

/**
 * The formatters for the language the interface is in now.
 *
 * @returns the formatters
 */
export function useFormat(): Format {
  return formatFor(i18n.global.locale.value)
}
