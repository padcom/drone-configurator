import { describe, expect, it } from 'vitest'
import { FakePads, TX16S } from '@/testing/fakeGamepads'
import { LATE_MS, PadReader, type Reading, padOf, sampleOf } from './reader'

/**
 * A reader of the scripted pads.
 *
 * @param device the id to read
 * @returns the pads and the reader
 */
function reader(device?: string) {
  const pads = new FakePads()

  return { pads, reader: new PadReader(pads.env(), device) }
}

/**
 * What a read said, as a sample.
 *
 * @param read the read
 * @returns the sample, or null for a read that was none
 */
function sampleFrom(read: Reading) {
  return read.kind === 'live' ? read.sample : null
}

describe('a read of the gamepad', () => {
  it('is no pad until the radio has had input, and then a sample of what it says', () => {
    const { pads, reader: r } = reader()

    expect(r.read().kind).toBe('none')
    pads.connect()
    pads.set([0.5, -1, 0, 0, 0, 1, 1], [0, 0, 1])
    pads.skip(20)
    const read = r.read()

    expect(read.kind).toBe('live')
    expect(sampleFrom(read)?.axes.slice(0, 3)).toEqual([0.5, -1, 0])
    expect(sampleFrom(read)?.buttons[2]).toBe(1)
    expect(sampleFrom(read)?.axes).toHaveLength(8)
  })

  it('is a copy: what a later read changes does not change what was read', () => {
    const { pads, reader: r } = reader()
    pads.connect()
    pads.set([0.25])
    const first = r.read()
    pads.set([0.75])

    expect(sampleFrom(first)?.axes[0]).toBe(0.25)
  })
})

describe('the pad a read is of', () => {
  it('is none when the pad is not the one asked for, or there is none', () => {
    const { pads, reader: r } = reader('another')
    pads.connect()

    expect(r.read().kind).toBe('none')
    expect(padOf([null, null])).toBeNull()
  })

  it('is copied as the browser gives it, buttons as their values', () => {
    const pad = { id: 'x', index: 0, connected: true, axes: [1], buttons: [{ value: 1 }] }

    expect(sampleOf(pad)).toEqual({ axes: [1], buttons: [1] })
  })

  it('is the first connected one, and the one with the id when there is an id', () => {
    const one = { id: 'one', index: 0, connected: false, axes: [], buttons: [] }
    const two = { id: 'two', index: 1, connected: true, axes: [], buttons: [] }
    const three = { id: 'three', index: 2, connected: true, axes: [], buttons: [] }

    expect(padOf([one, two, three])?.id).toBe('two')
    expect(padOf([one, two, three], 'three')?.id).toBe('three')
    expect(padOf([one, two, three], 'one')).toBeNull()
  })

  it('is the id the browser gave the radio', () => {
    const { pads, reader: r } = reader(TX16S)
    pads.connect()

    expect(r.read().kind).toBe('live')
  })
})

describe('a read that is late', () => {
  it('is more than 100 ms after the one before, whatever the pad says', () => {
    const { pads, reader: r } = reader()
    pads.connect()

    expect(r.read().kind).toBe('live')
    pads.skip(LATE_MS)
    expect(r.read().kind).toBe('live')
    pads.skip(LATE_MS + 1)
    expect(r.read().kind).toBe('late')
    // (the next one, on time, is a sample again: it is the caller that lets go and stays let go)
    pads.skip(20)
    expect(r.read().kind).toBe('live')
  })
})

describe('a read of a still stick', () => {
  it('does not use the pad\'s own timestamp: a still stick is a live read', () => {
    const { pads, reader: r } = reader()
    pads.connect()
    pads.set([0.3])

    for (let i = 0; i < 5; i += 1) {
      pads.skip(20)
      expect(r.read().kind).toBe('live')
    }
  })

  it('is not the first read after a restart', () => {
    const { pads, reader: r } = reader()
    pads.connect()
    r.read()
    pads.skip(60_000)
    r.restart()

    expect(r.read().kind).toBe('live')
  })
})

describe('a read in a window that is hidden', () => {
  it('is hidden, and the first read after it is not late for the time it was hidden', () => {
    const { pads, reader: r } = reader()
    pads.connect()
    r.read()
    pads.shown = false
    pads.skip(5000)

    expect(r.read().kind).toBe('hidden')
    pads.shown = true
    pads.skip(20)
    expect(r.read().kind).toBe('live')
  })
})
