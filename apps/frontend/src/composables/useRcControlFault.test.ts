// The RC control when the pad's reading goes wrong while it is on (plan section 10.1 item 3): once the gate is open, a stick that
// reads past 1.05, no number, or nothing releases every channel with the reason PAD_FAULT. A good reading (even a little past 1)
// does nothing.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { type RcRig, flying, rcRig, run, settle } from '@/testing/rcRig'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

/**
 * A control that is on with its gate open, the sticks at rest.
 *
 * @returns the rig
 */
async function open(): Promise<RcRig> {
  const r = await flying(await rcRig())

  await run(r, 600)
  expect(r.rc.gateOpen.value).toBe(true)

  return r
}

/**
 * What the pad reads with one stick gone wrong (the others at rest, the throttle low).
 *
 * @param index which stick (0 roll, 1 pitch, 2 throttle, 3 yaw)
 * @param value what it reads
 * @returns the axes
 */
function wrong(index: number, value: number): number[] {
  return [0, 1, 2, 3].map(at => at === index ? value : (at === 2 ? -1 : 0))
}

describe('a pad that reads wrong while the control is on', () => {
  it.each([0, 1, 2, 3])('releases everything with PAD_FAULT when stick %i reads past 1.05', async index => {
    const r = await open()

    r.pads.set(wrong(index, 1.2))
    await run(r, 200)

    expect([r.rc.state.value, r.rc.why.value, r.control.rc!.released()]).toEqual(['off', 'PAD_FAULT', 1])
    r.stop()
  })

  it.each([0, 1, 2, 3])('releases everything with PAD_FAULT when stick %i reads no number', async index => {
    const r = await open()

    r.pads.set(wrong(index, Number.NaN))
    await run(r, 200)

    expect([r.rc.state.value, r.rc.why.value]).toEqual(['off', 'PAD_FAULT'])
    r.stop()
  })
})

describe('a pad that reads right, or reads right again', () => {
  it('does nothing for a reading a little past 1, the pad\'s own noise', async () => {
    const r = await open()

    r.pads.set(wrong(0, 1.04))
    await run(r, 200)
    expect([r.rc.state.value, r.rc.why.value]).toEqual(['on', null])
    r.stop()
  })

  it('starts again with the gate shut once the person turned it on', async () => {
    const r = await open()

    r.pads.set(wrong(0, 1.2))
    await run(r, 200)
    r.pads.set(wrong(0, 0))
    await r.rc.enable()
    await settle()
    expect([r.rc.state.value, r.rc.gateOpen.value]).toEqual(['on', false])
    r.stop()
  })
})

describe('a pad that is gone', () => {
  it('is still ended by the pad being unplugged, which is not a fault of a reading', async () => {
    const r = await open()

    r.pads.disconnect()
    await run(r, 200)
    expect(r.rc.state.value).toBe('off')
    expect(r.rc.why.value).not.toBe('PAD_FAULT')
    r.stop()
  })
})
