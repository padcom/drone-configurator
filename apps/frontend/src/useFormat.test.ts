import { expect, it } from 'vitest'
import { formatFor, preferredUnit, useFormat } from './useFormat'

it('formats numbers with the decimals asked for, in the language given', () => {
  const en = formatFor('en')

  expect(en.number(12.5, 2)).toBe('12.50')
  expect(en.number(1234.5, 1)).toBe('1,234.5')
  expect(en.number(7)).toBe('7')
  expect(formatFor('de').number(1234.5, 1)).toBe('1.234,5')
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
