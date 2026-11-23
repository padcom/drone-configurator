// What a numeric field does with a number: the text of a stored value, what a typed text stands for and why it is not a value,
// the limits in the shown unit, and a step of the arrow keys.
import { describe, expect, it } from 'vitest'
import { type NumberSpec, clamped, parseNumber, showStored, stepped } from './numberField'
import { viewOf } from './units'

const ALTITUDE: NumberSpec = { view: viewOf('cm'), min: 200, max: 3000, step: 50, integer: true }
const PLAIN: NumberSpec = { view: viewOf('V'), min: 0, max: 5, step: 0.1 }

describe('the text of a value', () => {
  it('is in the shown unit', () => {
    expect(showStored(1500, ALTITUDE)).toBe('15')
    expect(showStored(1550, ALTITUDE)).toBe('15.5')
    expect(showStored(3.3, PLAIN)).toBe('3.3')
    // (the float the vehicle holds for 14.8: no digits that only the widening put there)
    expect(showStored(Math.fround(14.8), { ...PLAIN, type: 'REAL32' })).toBe('14.8')
  })
})

describe('a typed text that is a value', () => {
  it('is the stored value of the shown number', () => {
    expect(parseNumber('15.5', ALTITUDE)).toEqual({ ok: true, stored: 1550 })
    expect(parseNumber('  15 ', ALTITUDE)).toEqual({ ok: true, stored: 1500 })
    expect(parseNumber('2.5', PLAIN)).toEqual({ ok: true, stored: 2.5 })
  })

  it('takes a decimal comma, and the nearest whole number for a parameter of whole numbers', () => {
    expect(parseNumber('15,5', ALTITUDE)).toEqual({ ok: true, stored: 1550 })
    expect(parseNumber('15.555', ALTITUDE)).toEqual({ ok: true, stored: 1556 })
    expect(parseNumber('2.55', { ...PLAIN, integer: false })).toEqual({ ok: true, stored: 2.55 })
  })

  it('may be at a limit', () => {
    expect(parseNumber('2', ALTITUDE)).toEqual({ ok: true, stored: 200 })
    expect(parseNumber('30', ALTITUDE)).toEqual({ ok: true, stored: 3000 })
  })
})

describe('a typed text that is not a value', () => {
  it('is nothing, or not a number (a comma that may be a thousands group is not guessed at)', () => {
    expect(parseNumber('', ALTITUDE)).toEqual({ ok: false, problem: { code: 'empty' } })
    expect(parseNumber('  ', ALTITUDE)).toEqual({ ok: false, problem: { code: 'empty' } })
    expect(parseNumber('abc', ALTITUDE)).toEqual({ ok: false, problem: { code: 'nan' } })
    expect(parseNumber('1,500', ALTITUDE)).toEqual({ ok: false, problem: { code: 'nan' } })
    expect(parseNumber('Infinity', ALTITUDE)).toEqual({ ok: false, problem: { code: 'nan' } })
  })

  it('is under the lowest or over the highest, with the limit in the shown unit', () => {
    expect(parseNumber('1.99', ALTITUDE)).toEqual({ ok: false, problem: { code: 'low', limit: 2 } })
    expect(parseNumber('30.01', ALTITUDE)).toEqual({ ok: false, problem: { code: 'high', limit: 30 } })
    expect(parseNumber('-0.1', PLAIN)).toEqual({ ok: false, problem: { code: 'low', limit: 0 } })
    expect(parseNumber('5.5', PLAIN)).toEqual({ ok: false, problem: { code: 'high', limit: 5 } })
  })

  it('is any number where there are no limits', () => {
    expect(parseNumber('-999999', { view: viewOf(undefined) })).toEqual({ ok: true, stored: -999999 })
  })
})

describe('a value as the vehicle holds it', () => {
  const FLOAT: NumberSpec = { view: viewOf('V'), min: 0, max: 0.1, step: 0.1, type: 'REAL32' }

  it('is the nearest float for a REAL32, so that it equals what the vehicle reads back', () => {
    expect(parseNumber('0.07', FLOAT)).toEqual({ ok: true, stored: Math.fround(0.07) })
    expect(stepped(0, 1, false, FLOAT)).toBe(Math.fround(0.1))
  })

  it('does not take the float nearest to the highest for a value over it', () => {
    expect(parseNumber('0.1', FLOAT)).toEqual({ ok: true, stored: Math.fround(0.1) })
    expect(parseNumber('0.11', FLOAT)).toEqual({ ok: false, problem: { code: 'high', limit: 0.1 } })
  })

  it('is the nearest whole number for an integer type, with or without the flag', () => {
    expect(parseNumber('15.555', { view: viewOf('cm'), type: 'INT16' })).toEqual({ ok: true, stored: 1556 })
    expect(parseNumber('7.6', { view: viewOf('V'), type: 'UINT8' })).toEqual({ ok: true, stored: 8 })
  })
})

describe('a step of the arrow keys', () => {
  it('is the step of the parameter, in the stored unit, ten times as long when big', () => {
    expect(stepped(1500, 1, false, ALTITUDE)).toBe(1550)
    expect(stepped(1500, -1, false, ALTITUDE)).toBe(1450)
    expect(stepped(1500, 1, true, ALTITUDE)).toBe(2000)
    expect(stepped(7, 1, false, { view: viewOf(undefined) })).toBe(8)
  })

  it('stops at the limits, and does not show a float\'s noise', () => {
    expect(stepped(2950, 1, true, ALTITUDE)).toBe(3000)
    expect(stepped(220, -1, false, ALTITUDE)).toBe(200)
    expect(stepped(0.2, 1, false, PLAIN)).toBe(0.3)
    expect(stepped(0.1, 1, false, PLAIN)).toBe(0.2)
  })

  it('holds a value to the limits', () => {
    expect(clamped(-5, PLAIN)).toBe(0)
    expect(clamped(9, PLAIN)).toBe(5)
    expect(clamped(3, PLAIN)).toBe(3)
    expect(clamped(1e9, { view: viewOf(undefined) })).toBe(1e9)
  })
})
