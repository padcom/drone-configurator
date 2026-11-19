import { describe, expect, it } from 'vitest'
import { FakePads, TX16S } from '@/testing/fakeGamepads'
import { TX16S_LAYOUT } from '@/testing/rcProfiles'
import { LATE_MS, PadReader, type Reading, layoutOf, padOf, sampleOf } from './reader'

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

describe('a read of the gamepad: what it says', () => {
  it('is no pad until the radio has had input, and then a sample of what it says', () => {
    const { pads, reader: r } = reader()

    expect(r.read().kind).toBe('none')
    pads.connect()
    pads.set([0.5, -1, 0, 0, 0, 1, 1], [0, 0, 1])
    pads.skip(20)
    const read = r.read()

    expect(read.kind).toBe('live')
    // (the TX16S as the browser shows it: CH1..CH8 are its 8 axes, CH9..CH16 its first 8 buttons, -1 up and 1 pressed)
    expect(sampleFrom(read)?.channels.slice(0, 3)).toEqual([0.5, -1, 0])
    expect(sampleFrom(read)?.channels.slice(8, 11)).toEqual([-1, -1, 1])
    expect(sampleFrom(read)?.channels).toHaveLength(16)
  })
})

describe('a read of the gamepad: what it is made of', () => {
  it('knows what each channel is: the axes, then the buttons that fit', () => {
    const { pads, reader: r } = reader()
    pads.connect()
    const read = r.read()

    expect(read.kind === 'live' && read.layout).toEqual(TX16S_LAYOUT)
  })

  it('is a copy: what a later read changes does not change what was read', () => {
    const { pads, reader: r } = reader()
    pads.connect()
    pads.set([0.25])
    const first = r.read()
    pads.set([0.75])

    expect(sampleFrom(first)?.channels[0]).toBe(0.25)
  })
})

describe('the pad a read is of', () => {
  it('is none when the pad is not the one asked for, or there is none', () => {
    const { pads, reader: r } = reader('another')
    pads.connect()

    expect(r.read().kind).toBe('none')
    expect(padOf([null, null])).toBeNull()
  })

  it('is CH1..CH16 as the browser gives it: the axes, then the buttons as -1 to 1 (a trigger is between)', () => {
    const pad = { id: 'x', index: 0, connected: true, axes: [1], buttons: [{ value: 1 }, { value: 0.5 }] }

    expect(sampleOf(pad).channels).toEqual([1, 1, 0, ...Array.from({ length: 13 }, () => null)])
    expect(layoutOf(pad).slice(0, 4)).toEqual(['axis', 'button', 'button', null])
  })

  it('has no more than 16 channels, whatever the pad has', () => {
    const axes = Array.from({ length: 10 }, () => 0)
    const pad = { id: 'x', index: 0, connected: true, axes, buttons: Array.from({ length: 20 }, () => ({ value: 1 })) }

    expect(sampleOf(pad).channels).toHaveLength(16)
    expect(layoutOf(pad).filter(kind => kind === 'button')).toHaveLength(6)
  })
})

describe('the pad that is read', () => {
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

describe('a read of a browser that throws', () => {
  it('is no pad when the gamepad call, the clock or the visibility throws, and the next read is a read again', () => {
    const pads = new FakePads()
    const ok = pads.env()
    const throwing = (name: 'pads' | 'now' | 'visible') => new PadReader({
      ...ok,
      [name]: () => {
        throw new Error(`${name} is broken`)
      },
    })
    pads.connect()

    expect(throwing('pads').read().kind).toBe('none')
    expect(throwing('now').read().kind).toBe('none')
    expect(throwing('visible').read().kind).toBe('none')
    expect(new PadReader(ok).read().kind).toBe('live')
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
