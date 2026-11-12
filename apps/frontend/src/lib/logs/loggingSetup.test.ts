import { describe, expect, it } from 'vitest'
import type { Metadata } from '@/lib/params/metadata'
import {
  ISBD_BYTES,
  LOG_BITMASK,
  STREAM_BITS,
  batchBytesPerMinute,
  bitsOf,
  includesLogging,
  measuredBytesPerMinute,
  megabytes,
  streamRows,
  withBit,
} from './loggingSetup'

describe('bits of a mask', () => {
  it('lists the bits that are set, and none for what is not a mask', () => {
    expect(bitsOf(0)).toEqual([])
    expect(bitsOf(0b1000101)).toEqual([0, 2, 6])
    expect(bitsOf(2 ** 19 + 1)).toEqual([0, 19])
    expect(bitsOf(-1)).toEqual([])
    expect(bitsOf(1.5)).toEqual([])
    expect(bitsOf(Number.NaN)).toEqual([])
    expect(bitsOf(2 ** 40)).toEqual([])
  })

  it('turns a bit on or off and leaves the others', () => {
    expect(withBit(0, 19, true)).toBe(524288)
    expect(withBit(524289, 19, false)).toBe(1)
    expect(withBit(5, 2, true)).toBe(5)
    expect(withBit(5, 1, false)).toBe(5)
    expect(withBit(65535, 17, true)).toBe(65535 + 131072)
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
