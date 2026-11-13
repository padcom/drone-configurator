import { describe, expect, it } from 'vitest'
import type { LocalLog } from '@/generated/app'
import type { Metadata } from '@/lib/params/metadata'
import {
  ISBD_BYTES,
  LOG_BITMASK,
  STREAM_BITS,
  batchBytesPerMinute,
  bitsOf,
  canSet,
  includesGuarded,
  includesLogging,
  isExact,
  isMask,
  measuredBytesPerMinute,
  measuredOf,
  megabytes,
  streamRows,
  withBit,
} from './loggingSetup'

describe('bits of a mask', () => {
  it('lists the bits that are set, and none for what is not a mask', () => {
    expect(bitsOf(0)).toEqual([])
    expect(bitsOf(0b1000101)).toEqual([0, 2, 6])
    expect(bitsOf(2 ** 19 + 1)).toEqual([0, 19])
    expect(bitsOf(1.5)).toEqual([])
    expect(bitsOf(Number.NaN)).toEqual([])
    expect(bitsOf(2 ** 40)).toEqual([])
    expect(bitsOf(2 ** 31)).toEqual([])
  })

  it('holds a mask as an int32: -1 is every bit, bit 31 is the sign', () => {
    expect(bitsOf(-1)).toEqual(Array.from({ length: 32 }, (_, bit) => bit))
    expect(bitsOf(-(2 ** 31))).toEqual([31])
    expect(bitsOf(2 ** 31 - 1)).toEqual(Array.from({ length: 31 }, (_, bit) => bit))
    expect(isMask(-1)).toBe(true)
    expect(isMask(2 ** 31)).toBe(false)
    expect(isMask(-(2 ** 31) - 1)).toBe(false)
    expect(isMask(0.5)).toBe(false)
  })
})

describe('bits of an int32 mask', () => {
  it('edits -1 as an int32: unticking a bit takes it from -1, ticking one in 0 bit 31 gives the smallest int32', () => {
    expect(withBit(-1, 2, false)).toBe(-5)
    expect(withBit(-1, 31, false)).toBe(2 ** 31 - 1)
    expect(withBit(-1, 7, true)).toBe(-1)
    expect(withBit(0, 31, true)).toBe(-(2 ** 31))
    expect(withBit(-(2 ** 31), 31, false)).toBe(0)
    expect(withBit(-5, 2, true)).toBe(-1)
    // A value that is no mask is left as it is: nothing is made up from it.
    expect(withBit(2 ** 40, 2, true)).toBe(2 ** 40)
    expect(withBit(1.5, 0, true)).toBe(1.5)
  })

  it('turns a bit on or off and leaves the others', () => {
    expect(withBit(0, 19, true)).toBe(524288)
    expect(withBit(524289, 19, false)).toBe(1)
    expect(withBit(5, 2, true)).toBe(5)
    expect(withBit(5, 1, false)).toBe(5)
    expect(withBit(65535, 17, true)).toBe(65535 + 131072)
  })
})

describe('masks the vehicle can be given exactly', () => {
  it('knows what a 32-bit float holds: every integer to 2^24, and above that powers of two and their multiples', () => {
    expect(isExact(16777216)).toBe(true)
    expect(isExact(16777217)).toBe(false)
    expect(isExact(-17)).toBe(true)
    expect(isExact(2147483520)).toBe(true)
    expect(isExact(2147483647)).toBe(false)
  })

  it('refuses a tick that cannot be written: bit 24 alone is exact, with bit 0 it is not, -1 minus bit 30 is not', () => {
    expect(canSet(-1, 4, false)).toBe(true)
    expect(canSet(0, 24, true)).toBe(true)
    expect(canSet(1, 24, true)).toBe(false)
    expect(canSet(-1, 30, false)).toBe(false)
    expect(canSet(0, 3, true)).toBe(true)
    // A bit that is already as asked changes nothing, and that is exact if the value is.
    expect(canSet(5, 0, true)).toBe(true)
  })
})

describe('the parameters that are not written while the vehicle may be armed', () => {
  it('are the logging ones and the four of the notch that the Spectrum suggests', () => {
    const ids = ['LOG_BITMASK', 'INS_LOG_BAT_MASK', 'INS_HNTCH_ENABLE', 'INS_HNTCH_FREQ', 'INS_HNTCH_BW', 'INS_HNTCH_HMNCS']
    for (const id of ids) {
      expect(includesGuarded([id])).toBe(true)
    }
    expect(includesGuarded(['INS_HNTCH_ATT', 'RTL_ALT'])).toBe(false)
  })
})

describe('the streams listed', () => {
  const named: Metadata = new Map([[LOG_BITMASK, { bits: { 0: 'Fast Attitude', 2: 'GPS', 17: 'Motors' } }]])

  it('takes the names from the metadata, and lists the bits it names', () => {
    expect(streamRows(named, 0)).toEqual([
      { bit: 0, name: 'Fast Attitude' },
      { bit: 2, name: 'GPS' },
      { bit: 17, name: 'Motors' },
    ])
  })

  it('keeps a bit that is on and has no name, so that nothing that is on is hidden', () => {
    expect(streamRows(named, 2 ** 5).map(row => row.bit)).toEqual([0, 2, 5, 17])
    expect(streamRows(named, 2 ** 5)[2]).toEqual({ bit: 5, name: null })
  })

  it('has no names without metadata: the four positions the app knows, as numbers', () => {
    const rows = streamRows(new Map(), 0)

    expect(rows.map(row => row.bit)).toEqual([...STREAM_BITS])
    expect(rows.every(row => row.name === null)).toBe(true)
  })
})

describe('the estimate', () => {
  it('is nothing for batch sampling that is off or has no batch', () => {
    expect(batchBytesPerMinute({ mask: 0, intervalMs: 20, count: 1024 })).toBe(0)
    expect(batchBytesPerMinute({ mask: 1, intervalMs: 20, count: 16 })).toBe(0)
    expect(batchBytesPerMinute({ mask: 1, intervalMs: 0, count: 1024 })).toBe(0)
  })

  it('is an ISBD message every interval at most, whatever the number of IMUs', () => {
    expect(batchBytesPerMinute({ mask: 1, intervalMs: 20, count: 1024 })).toBe(3000 * ISBD_BYTES)
    expect(batchBytesPerMinute({ mask: 7, intervalMs: 20, count: 1024 })).toBe(3000 * ISBD_BYTES)
    expect(megabytes(3000 * ISBD_BYTES)).toBe(0.6)
  })

  it('measures a log by its size over its length', () => {
    expect(measuredBytesPerMinute({ bytes: 6_000_000, seconds: 120 })).toBe(3_000_000)
    expect(measuredBytesPerMinute({ bytes: 6_000_000, seconds: 0 })).toBeNull()
    expect(measuredBytesPerMinute(null)).toBeNull()
  })
})

describe('what is a logging parameter', () => {
  it('knows the parameters the page queues', () => {
    expect(includesLogging(['LOG_BITMASK'])).toBe(true)
    expect(includesLogging(['RTL_ALT', 'INS_LOG_BAT_MASK'])).toBe(true)
    expect(includesLogging(['RTL_ALT'])).toBe(false)
    expect(includesLogging([])).toBe(false)
  })
})

/**
 * A verified log with a length.
 *
 * @param source who wrote it
 * @param modified when it was last changed
 * @returns the log
 */
function logOf(source: LocalLog['source'], modified: number): LocalLog {
  return {
    key: `${source}/${modified}`,
    vehicle: 'v',
    id: modified,
    size: 6_000_000,
    modified,
    crc: 'c',
    source,
    summary: { verified: true, messages: 1, problems: 0, modeChanges: 0, firstUs: 0, lastUs: 60_000_000 },
  }
}

describe('how fast the vehicle wrote its logs', () => {
  it('is measured on a log the vehicle wrote, never on a ground station recording (which says nothing of the vehicle)', () => {
    // The recording is the newest; the measure is still the vehicle's log.
    const measured = measuredOf([logOf('dataflash', 1000), logOf('tlog', 2000)])

    expect(measured).toEqual({ bytes: 6_000_000, seconds: 60 })
    expect(measuredOf([logOf('tlog', 2000)])).toBeNull()
  })
})
