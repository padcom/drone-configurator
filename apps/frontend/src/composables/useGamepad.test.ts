import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope } from 'vue'
import { POLL_MS, useGamepad } from './useGamepad'
import type { Gap, Reading } from '@/lib/rc/reader'
import { FakePads, TX16S } from '@/testing/fakeGamepads'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

/**
 * The gamepad over scripted pads, with the gaps it tells collected.
 *
 * @returns the pads, the gamepad and the gaps
 */
function setup() {
  const pads = new FakePads()
  const gaps: Gap[] = []
  const pad = useGamepad({ env: pads.env(), onGap: gap => gaps.push(gap) })

  return { pads, pad, gaps }
}

/**
 * The first axis of a reading.
 *
 * @param reading the reading
 * @returns what the axis said, or null for a reading with no sample
 */
function firstAxis(reading: Reading): number | null {
  return reading.kind === 'live' ? reading.sample.axes[0] ?? null : null
}

describe('the gamepad', () => {
  it('has no pad until the radio shows up, and reads it every 20 ms from then on', () => {
    const { pads, pad } = setup()
    pad.start()

    expect(pad.live.value).toBe(false)
    pads.connect()
    pads.set([0.5])
    pads.advance(POLL_MS)

    expect(pad.live.value).toBe(true)
    expect(pad.id.value).toBe(TX16S)
    expect(firstAxis(pad.reading.value)).toBe(0.5)
    pads.set([-0.5])
    pads.advance(POLL_MS)
    expect(firstAxis(pad.reading.value)).toBe(-0.5)
    pad.stop()
  })
})

describe('the gamepad that is stopped', () => {
  it('stops reading, and forgets what it read', () => {
    const { pads, pad } = setup()
    pads.connect()
    pad.start()
    pads.advance(POLL_MS)

    expect(pad.live.value).toBe(true)
    pad.stop()
    expect(pad.reading.value.kind).toBe('none')
    pads.set([1])
    pads.advance(100)
    expect(pad.reading.value.kind).toBe('none')
  })
})

describe('the gamepad after stop', () => {
  it('has no listener left: an unplugged pad or a hidden window changes nothing, and tells nothing', () => {
    const { pads, pad, gaps } = setup()
    pads.connect()
    pad.start()
    pads.advance(POLL_MS)
    pad.stop()
    pads.disconnect()
    pads.show(false)
    pads.show(true)
    pads.connect()
    pads.advance(200)

    expect(pad.reading.value.kind).toBe('none')
    expect(gaps).toEqual([])
  })

  it('can be started again, and then reads as before', () => {
    const { pads, pad } = setup()
    pads.connect()
    pad.start()
    pad.stop()
    pad.start()
    pads.advance(POLL_MS)

    expect(pad.live.value).toBe(true)
  })
})

describe('the gamepad in a scope', () => {
  it('stops with the scope it was made in', () => {
    const pads = new FakePads()
    const scope = effectScope()
    const pad = scope.run(() => useGamepad({ env: pads.env() }))!
    pads.connect()
    pad.start()
    pads.advance(POLL_MS)
    scope.stop()

    expect(pad.reading.value.kind).toBe('none')
  })
})

describe('what ends a live read', () => {
  it('is the radio unplugged, told at once and not at the next poll', () => {
    const { pads, pad, gaps } = setup()
    pads.connect()
    pad.start()
    pads.advance(POLL_MS)
    pads.disconnect()

    expect(gaps).toEqual(['none'])
    expect(pad.live.value).toBe(false)
  })

  it('is the window hidden, told at once (a hidden window\'s timer comes once a second)', () => {
    const { pads, pad, gaps } = setup()
    pads.connect()
    pad.start()
    pads.advance(POLL_MS)
    pads.show(false)

    expect(gaps).toEqual(['hidden'])
    expect(pad.reading.value.kind).toBe('hidden')
    pads.show(true)
    pads.advance(POLL_MS)
    expect(pad.live.value).toBe(true)
    // (it is only told again when it is live and stops being live)
    expect(gaps).toEqual(['hidden'])
  })
})

describe('what does not end a live read, and what ends it late', () => {
  it('is a read that comes late: the page was frozen or throttled, so nothing it says is used', () => {
    const { pads, pad, gaps } = setup()
    pads.connect()
    pad.start()
    pads.advance(POLL_MS)
    pads.skip(400)
    pads.advance(POLL_MS)

    expect(gaps).toEqual(['late'])
  })

  it('is not the window losing the focus: the pad goes on, as it was measured to', () => {
    const { pads, pad, gaps } = setup()
    pads.connect()
    pad.start()
    pads.advance(POLL_MS)
    window.dispatchEvent(new Event('blur'))
    pads.advance(200)

    expect(gaps).toEqual([])
    expect(pad.live.value).toBe(true)
  })
})

describe('what is told of a gap', () => {
  it('is told once for each time, and not while there is nothing to lose', () => {
    const { pads, pad, gaps } = setup()
    pad.start()
    pads.advance(500)

    expect(gaps).toEqual([])
    pads.connect()
    pads.advance(POLL_MS)
    pads.disconnect()
    pads.advance(500)
    pads.connect()
    pads.advance(POLL_MS)
    pads.disconnect()

    expect(gaps).toEqual(['none', 'none'])
  })
})
