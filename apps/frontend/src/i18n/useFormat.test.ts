import { expect, it } from 'vitest'
import { i18n } from './i18n'
import { formatFor, preferredUnit, useFormat } from './useFormat'

it('formats numbers with the decimals asked for, in the language given', () => {
  const en = formatFor('en')

  expect(en.number(12.5, 2)).toBe('12.50')
  expect(en.number(1234.5, 1)).toBe('1,234.5')
  expect(en.number(7)).toBe('7')
  expect(formatFor('de').number(1234.5, 1)).toBe('1.234,5')
})

it('shows a value that rounds to zero as zero, without a minus sign', () => {
  const en = formatFor('en')

  expect(en.number(-0, 1)).toBe('0.0')
  expect(en.number(-0.04, 1)).toBe('0.0')
  expect(en.number(-0.04)).toBe('0')
  // A real negative value keeps its sign.
  expect(en.number(-0.4, 1)).toBe('-0.4')
  expect(en.number(-12.5, 2)).toBe('-12.50')
})

it('formats a quantity as number, no-break space and unit', () => {
  expect(formatFor('en').quantity(12.5, 'V', 2)).toBe('12.50 V')
  expect(formatFor('en').quantity(90, '%')).toBe('90 %')
})

it('formats a date and time in the language given', () => {
  const moment = new Date(Date.UTC(2026, 10, 9, 12, 30, 0))

  expect(formatFor('en').dateTime(moment)).toMatch(/2026/u)
  expect(formatFor('en').dateTime(moment)).toMatch(/\d{1,2}:\d{2}:\d{2}/u)
})

it('shows values in the unit they are reported in until the unit settings exist', () => {
  expect(preferredUnit(100, 'm')).toEqual({ value: 100, unit: 'm' })
})

it('uses the language of the interface', () => {
  expect(useFormat().number(3.14159, 2)).toBe('3.14')
})

it('follows a language switch made after the formatters were made', () => {
  const format = useFormat()
  expect(format.number(1234.5, 1)).toBe('1,234.5')

  i18n.global.locale.value = 'de' as typeof i18n.global.locale.value

  try {
    expect(format.number(1234.5, 1)).toBe('1.234,5')
    expect(format.quantity(1234.5, 'm', 1)).toBe('1.234,5 m')
  } finally {
    i18n.global.locale.value = 'en'
  }

  expect(format.number(1234.5, 1)).toBe('1,234.5')
})

it('makes each Intl formatter once per language and number of decimals', () => {
  const made: string[] = []
  const { NumberFormat } = Intl
  Intl.NumberFormat = new Proxy(NumberFormat, {
    construct(target, args: [string, Intl.NumberFormatOptions], newTarget) {
      made.push(`${args[0]}:${args[1].maximumFractionDigits}`)

      return Reflect.construct(target, args, newTarget) as object
    },
  })

  try {
    const format = formatFor('fr')
    format.number(1, 3)
    format.number(2, 3)
    format.number(3, 3)
    format.number(4, 4)
  } finally {
    Intl.NumberFormat = NumberFormat
  }

  expect(made).toEqual(['fr:3', 'fr:4'])
})
