import { describe, expect, it } from 'vitest'
import { canonParam, canonical, notConfirmedText, showNumber, typedValue } from './paramValue'

const INT16 = { kind: 'int', type: 'INT16' }
const UINT32 = { kind: 'int', type: 'UINT32' }
const REAL32 = { kind: 'real', type: 'REAL32' }
const REAL64 = { kind: 'real', type: 'REAL64' }

describe('negative zero and NaN', () => {
  it('are never a negative zero for an integer, and a NaN is the same as a NaN', () => {
    expect(Object.is(canonical(INT16, -0.4), 0)).toBe(true)
    expect(Object.is(canonical(INT16, -0), 0)).toBe(true)
    expect(Object.is(typedValue(INT16, '-0.4'), 0)).toBe(true)
    const wire = { id: 'A', ...REAL32, value: Number.NaN }

    expect(canonParam(wire)).toBe(wire)
  })
})

describe('the number the vehicle holds', () => {
  it('has no decimals for an integer: the nearest whole number, halves away from zero as Math.round has them', () => {
    expect([2.4, 2.5, 2.6, -2.4, -2.6, 0.49].map(n => canonical(INT16, n))).toEqual([2, 3, 3, -2, -3, 0])
    expect(canonical(UINT32, 4294967295)).toBe(4294967295)
    expect(canonical(UINT32, 4294967294.6)).toBe(4294967295)
  })

  it('is the nearest float for a REAL32, and the number itself for a double', () => {
    expect(canonical(REAL32, 0.1)).toBe(Math.fround(0.1))
    expect(canonical(REAL32, 0.1)).not.toBe(0.1)
    expect(canonical(REAL32, 0.10000000149011612)).toBe(canonical(REAL32, 0.1))
    expect(canonical(REAL32, 16777217)).toBe(16777216)
    expect(canonical(REAL64, 0.1)).toBe(0.1)
  })

  it('makes 0.1 typed and 0.10000000149011612 from the wire the same number', () => {
    expect(typedValue(REAL32, '0.1')).toBe(typedValue(REAL32, ' 0.10000000149011612 '))
    expect(typedValue(REAL32, '3.3')).toBe(canonical(REAL32, 3.299999952316284))
    expect(typedValue(INT16, '7.6')).toBe(8)
  })

  it('leaves a parameter alone when its value is the number already, and copies it when not', () => {
    const held = { id: 'A', ...INT16, value: 5 }
    const wide = { id: 'B', ...REAL32, value: 0.1 }

    expect(canonParam(held)).toBe(held)
    expect(canonParam(wide).value).toBe(Math.fround(0.1))
    expect(wide.value).toBe(0.1)
  })
})

describe('a value as the text a person reads', () => {
  it('is the shortest text of the float, with no noise of the double: 0.1, 3.3, 1e-7', () => {
    expect(showNumber(Math.fround(0.1))).toBe('0.1')
    expect(showNumber(0.10000000149011612)).toBe('0.1')
    expect(showNumber(Math.fround(3.3))).toBe('3.3')
    expect(showNumber(Math.fround(1e-7))).toBe('1e-7')
    expect(showNumber(Math.fround(10.5))).toBe('10.5')
    expect(showNumber(Math.fround(-0.25))).toBe('-0.25')
    // The shortest text that is the same float, which is what reads back without noise (8 digits here, not a cut to 7).
    expect(showNumber(Math.fround(1234.5678))).toBe('1234.5677')
  })
})

describe('a whole number, a double and a round trip as text', () => {
  it('keeps every digit of a whole number: a float of 16777216 and the UINT32 maximum are not cut to 7 digits', () => {
    expect(showNumber(canonical(REAL32, 16777217))).toBe('16777216')
    expect(showNumber(4294967295)).toBe('4294967295')
    expect(showNumber(-2147483648)).toBe('-2147483648')
    expect(showNumber(0)).toBe('0')
    expect(showNumber(1500)).toBe('1500')
  })

  it('keeps the 15 digits of a double and no more', () => {
    expect(showNumber(0.1 + 0.2)).toBe('0.3')
    expect(showNumber(Math.PI)).toBe('3.14159265358979')
    expect(showNumber(0.1)).toBe('0.1')
  })

  it('reads back as the same float it was made from, for the noise values of a float', () => {
    for (const typed of [0.1, 0.2, 0.7, 3.3, 1e-7, 123456.7, 16777217, 33.333333, 1.1, 99.99]) {
      const held = canonical(REAL32, typed)

      expect(canonical(REAL32, Number(showNumber(held)))).toBe(held)
    }
  })

  it('says what a write that was not confirmed read back, in the same words for both numbers', () => {
    expect(notConfirmedText(Math.fround(0.1), Math.fround(0.3))).toBe('the vehicle reports 0.1, not 0.3')
  })
})
