// The bits of a bit-wise parameter (ArduPilot's Bitmask: bit number → name), from plain numbers (no DOM). A value is held as a
// number, in the width and the sign of its type: INT8, INT16 and INT32 have bit 7, 15 and 31 as their sign, so -1 is every bit
// set. JavaScript's bit operators work on 32 bits and give a signed result, which is why the work is done on the unsigned
// 32-bit form of the value and the result is turned back into the type's own range (`UINT32` 4294967295 and `INT32` -1 are
// the same bits). A bit that is set in the value and has no name in the metadata is never touched by toggling a known one.

/** One named bit. */
export interface BitOption {
  /** Its number: 0 is the lowest. */
  bit: number
  /** Its name, from the metadata. */
  name: string
}

/** How wide the integer types of the vehicle's parameters are, in bits. */
const WIDTH: Record<string, number> = { UINT8: 8, INT8: 8, UINT16: 16, INT16: 16, UINT32: 32, INT32: 32 }

/**
 * How many bits a type has.
 *
 * @param type the parameter's type (INT8, UINT16, ...)
 * @returns the width; 32 for a type that is not named
 */
export function widthOf(type: string): number {
  return WIDTH[type] ?? 32
}

/**
 * The named bits of a parameter that its type has.
 *
 * @param bits the metadata's bits: bit number (as text) → name
 * @param type the parameter's type
 * @returns the options, lowest bit first (none when the metadata has no usable bit)
 */
export function bitOptions(bits: Record<string, string> | undefined, type: string): BitOption[] {
  const width = widthOf(type)

  return Object.entries(bits ?? {})
    .map(([bit, name]) => ({ bit: Number(bit), name }))
    .filter(option => Number.isInteger(option.bit) && option.bit >= 0 && option.bit < width)
    .sort((a, b) => a.bit - b.bit)
}

/**
 * The bits of a value as an unsigned number of the type's width (a negative value of a signed type is its two's complement).
 *
 * @param value the value, within the range of the type
 * @param type the parameter's type
 * @returns 0 to 2^width - 1
 */
export function bitsOf(value: number, type: string): number {
  return value < 0 ? value + (2 ** widthOf(type)) : value
}

/**
 * The value of a type for some bits: the bits as they are for an unsigned type, and, for a signed one, the top bit is the sign.
 *
 * @param bits the bits, 0 to 2^width - 1
 * @param type the parameter's type
 * @returns the value, within the range of the type
 */
export function valueOfBits(bits: number, type: string): number {
  const width = widthOf(type)

  return type.startsWith('INT') && bits >= 2 ** (width - 1) ? bits - (2 ** width) : bits
}

/**
 * Whether a number is a value of the type: a whole number within its range (a bit of one that is not has no meaning, and a
 * toggle on it would fold it into the range without a word).
 *
 * @param value the number
 * @param type the parameter's type
 * @returns true when the type can hold it
 */
export function fitsType(value: number, type: string): boolean {
  const width = widthOf(type)
  const [low, high] = type.startsWith('INT') ? [-(2 ** (width - 1)), (2 ** (width - 1)) - 1] : [0, (2 ** width) - 1]

  return Number.isInteger(value) && value >= low && value <= high
}

/**
 * Whether a bit is set.
 *
 * @param value the value
 * @param bit the bit's number
 * @param type the parameter's type
 * @returns true if it is
 */
export function isSet(value: number, bit: number, type: string): boolean {
  return ((bitsOf(value, type) >>> bit) & 1) === 1
}

/**
 * The value with a bit set or cleared, and every other bit as it was (the ones the metadata does not name included).
 *
 * @param value the value
 * @param bit the bit's number
 * @param on whether the bit is to be set
 * @param type the parameter's type
 * @returns the new value, within the range of the type
 */
export function withBit(value: number, bit: number, on: boolean, type: string): number {
  const bits = bitsOf(value, type)
  const mask = 2 ** bit
  const next = on ? (bits | mask) >>> 0 : (bits & ~mask) >>> 0

  return valueOfBits(next, type)
}

/**
 * The bits that are set in a value and have no name.
 *
 * @param value the value
 * @param named the named bits
 * @param type the parameter's type
 * @returns them as an unsigned number (0 when there are none)
 */
export function unknownBits(value: number, named: BitOption[], type: string): number {
  const known = named.reduce((mask, option) => (mask | (2 ** option.bit)) >>> 0, 0)

  return (bitsOf(value, type) & ~known) >>> 0
}

/**
 * The unknown bits as the text the field shows.
 *
 * @param bits the bits, as from `unknownBits`
 * @returns `0x` and the bits in hexadecimal, in capitals
 */
export const hexOf = (bits: number): string => `0x${bits.toString(16).toUpperCase()}`

/**
 * The named bits that are set in a value.
 *
 * @param value the value
 * @param named the named bits
 * @param type the parameter's type
 * @returns them, lowest first
 */
export function setOptions(value: number, named: BitOption[], type: string): BitOption[] {
  return named.filter(option => isSet(value, option.bit, type))
}

/**
 * The names of some bits in a line, as many as there is room for.
 *
 * @param set the bits
 * @param room how many names are listed at most
 * @returns for example "Barometer, GPS lock, …"
 */
export function namesLine(set: BitOption[], room: number): string {
  return `${set.slice(0, room).map(option => option.name).join(', ')}${set.length > room ? ', …' : ''}`
}
