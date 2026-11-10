import { describe, expect, it } from 'vitest'
import { bitOptions, bitsOf, hexOf, isSet, namesLine, setOptions, unknownBits, valueOfBits, widthOf, withBit } from './bitmask'

const NAMES = { 0: 'All', 1: 'Barometer', 2: 'Compass', 3: 'GPS lock', 31: 'Top' }

describe('the bits of the metadata', () => {
  it('are the named bits the type has, lowest first, and nothing that is not a bit', () => {
    const odd = { '3': 'C', '0': 'A', 'x': 'bad', '-1': 'neg', '1.5': 'frac', '9': 'wide' }

    expect(bitOptions(odd, 'UINT8').map(o => o.bit)).toEqual([0, 3])
    expect(bitOptions({ 31: 'Top', 16: 'Mid' }, 'INT32').map(o => o.bit)).toEqual([16, 31])
    expect(bitOptions(undefined, 'INT32')).toEqual([])
  })

  it('know how wide a type is', () => {
    expect([widthOf('INT8'), widthOf('UINT16'), widthOf('INT32'), widthOf('REAL32')]).toEqual([8, 16, 32, 32])
  })
})

describe('the bit math', () => {
  it('sets and clears a bit, and leaves every other bit as it was', () => {
    expect(withBit(0, 3, true, 'INT32')).toBe(8)
    expect(withBit(8, 3, false, 'INT32')).toBe(0)
    expect(withBit(5, 1, true, 'UINT16')).toBe(7)
    expect(withBit(7, 1, false, 'UINT16')).toBe(5)
    expect(withBit(5, 0, true, 'UINT16')).toBe(5)
  })

  it('has bit 31: unsigned for UINT32 and the sign for INT32, both the same bits', () => {
    expect(withBit(0, 31, true, 'UINT32')).toBe(2147483648)
    expect(withBit(0, 31, true, 'INT32')).toBe(-2147483648)
    expect(isSet(-2147483648, 31, 'INT32')).toBe(true)
    expect(isSet(2147483648, 31, 'UINT32')).toBe(true)
    expect(withBit(-2147483648, 31, false, 'INT32')).toBe(0)
    expect(withBit(4294967295, 31, false, 'UINT32')).toBe(2147483647)
  })

  it('takes -1 of a signed type as every bit set, and keeps it a value of the type', () => {
    expect(bitsOf(-1, 'INT32')).toBe(4294967295)
    expect(bitsOf(-1, 'INT16')).toBe(65535)
    expect(bitsOf(-128, 'INT8')).toBe(128)
    expect(valueOfBits(65535, 'INT16')).toBe(-1)
    expect(valueOfBits(65535, 'UINT16')).toBe(65535)
  })
})

describe('reading and changing a bit of a signed value', () => {
  it('keeps a signed value in range when a bit changes', () => {
    expect(withBit(-1, 2, false, 'INT32')).toBe(-5)
    expect(withBit(-5, 2, true, 'INT32')).toBe(-1)
    expect(withBit(0, 7, true, 'INT8')).toBe(-128)
    expect(withBit(0, 15, true, 'INT16')).toBe(-32768)
  })

  it('is of the value as the vehicle holds it', () => {
    expect([0, 1, 2, 3].map(bit => isSet(0b1010, bit, 'UINT8'))).toEqual([false, true, false, true])
  })
})

describe('the bits that have no name', () => {
  const named = bitOptions(NAMES, 'UINT32')

  it('are what is set and not named, as a hexadecimal number', () => {
    expect(unknownBits(0b10110, named, 'UINT32')).toBe(0b10000)
    expect(hexOf(unknownBits(0b10110, named, 'UINT32'))).toBe('0x10')
    expect(unknownBits(0b1110, named, 'UINT32')).toBe(0)
    expect(hexOf(unknownBits(4294967295, named, 'UINT32'))).toBe('0x7FFFFFF0')
    expect(unknownBits(-1, named, 'INT32')).toBe(0x7FFFFFF0)
  })

  it('are never cleared by toggling a named one', () => {
    const value = 0b1_0000_0000 + 0b0010
    const cleared = withBit(value, 1, false, 'UINT32')

    expect(cleared).toBe(0b1_0000_0000)
    expect(withBit(cleared, 1, true, 'UINT32')).toBe(value)
    expect(unknownBits(withBit(value, 3, true, 'UINT32'), named, 'UINT32')).toBe(0b1_0000_0000)
  })
})

describe('the summary of a value', () => {
  const named = bitOptions(NAMES, 'UINT32')

  it('lists the named bits that are set, and none for a value with only unnamed bits', () => {
    expect(namesLine(setOptions(0b1110, named, 'UINT32'), 5)).toBe('Barometer, Compass, GPS lock')
    expect(setOptions(0, named, 'UINT32')).toEqual([])
    expect(setOptions(0b10000, named, 'UINT32')).toEqual([])
    expect(setOptions(-1, named, 'INT32').map(o => o.bit)).toEqual([0, 1, 2, 3, 31])
  })

  it('is cut where there is no room, with an ellipsis', () => {
    expect(namesLine(setOptions(0b1111, named, 'UINT32'), 2)).toBe('All, Barometer, …')
  })
})

describe('hexadecimal', () => {
  it('is in capitals with 0x', () => {
    expect([hexOf(0), hexOf(255), hexOf(0xFFFFFFFF)]).toEqual(['0x0', '0xFF', '0xFFFFFFFF'])
  })
})
