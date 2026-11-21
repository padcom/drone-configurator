// The RC control with a throttle that rests in the middle (a spring-centred stick): where it starts and where it ends (only in
// the modes that read the throttle as a climb rate, or take none), what it sends (the middle of the range at the middle of the
// stick, the yaw always held back), and the rest check before anything is sent.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TX16S } from '@/testing/fakeGamepads'
import { confirmedSuggestion } from '@/testing/rcProfiles'
import { type RcRig, flying, rcRig, run, settle, throttles } from '@/testing/rcRig'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

/** The yaw at the end of its travel, held back to 0.8 of its half range (the rig's 1100 to 1900 µs). */
const YAW_HELD = 1820

/**
 * A centred control that is on: the throttle rests in the middle, the vehicle is in the mode, and the sticks are at rest.
 *
 * @param mode the vehicle's flight mode
 * @returns the rig
 */
async function centred(mode = 'ALT_HOLD'): Promise<RcRig> {
  const r = await rcRig({ profile: confirmedSuggestion(TX16S, 'centred') })

  r.telemetry.value = { ...r.telemetry.value!, mode }
  r.pads.connect(TX16S)
  r.pads.set([0, 0, 0, 0])
  r.pads.advance(20)
  await r.rc.enable()
  await settle()

  return r
}

/**
 * A centred control that is on and has had its sticks at rest long enough for the gate to open.
 *
 * @returns the rig
 */
async function open(): Promise<RcRig> {
  const r = await centred()

  await run(r, 600)

  return r
}

const CLIMB = ['ALT_HOLD', 'LOITER', 'POSHOLD', 'SPORT', 'CIRCLE', 'FLOWHOLD', 'ZIGZAG', 'AUTOTUNE']
const OTHER = ['STABILIZE', 'ACRO', 'GUIDED', 'RTL', 'LAND', 'AUTO', 'DRIFT', 'MYSTERY']

describe('a centred throttle: where it starts', () => {
  it.each(CLIMB)('starts in %s, a mode that reads the throttle as a climb rate', async mode => {
    const r = await centred(mode)

    expect(r.rc.state.value).toBe('on')
    r.stop()
  })

  it.each(OTHER)('is refused in %s, with the reason "mode", and nothing is begun', async mode => {
    const r = await centred(mode)

    expect([r.rc.state.value, r.rc.why.value, r.control.rc!.began()]).toEqual(['off', 'mode', 0])
    r.stop()
  })

  it('is refused in Stabilize when the vehicle is armed, too', async () => {
    const r = await centred('STABILIZE')

    r.telemetry.value = { ...r.telemetry.value!, armed: true }
    await r.rc.enable()
    expect([r.rc.state.value, r.rc.why.value]).toEqual(['off', 'mode'])
    r.stop()
  })
})

describe('the style the control asks the backend for', () => {
  it('is "centred" for a centred mapping, so that the backend holds it to the modes too', async () => {
    const r = await centred()

    expect(r.control.rc!.params()).toEqual({ rudderArm: false, throttle: 'centred' })
    r.stop()
  })

  it('is "low" for a mapping whose throttle rests low', async () => {
    const r = await flying(await rcRig())

    expect(r.control.rc!.params()).toEqual({ rudderArm: false, throttle: 'low' })
    r.stop()
  })
})

describe('a throttle that rests low: where it starts', () => {
  it('is not asked of a throttle that rests low: it starts in Stabilize', async () => {
    const r = await rcRig()

    expect(r.telemetry.value!.mode).toBe('STABILIZE')
    await flying(r)
    expect(r.rc.state.value).toBe('on')
    r.stop()
  })
})

describe('a centred throttle: where it goes on', () => {
  const MODES = ['RTL', 'LAND', 'AUTO', 'GUIDED', 'BRAKE', 'LOITER']

  it.each(MODES)('goes on in %s: the mode takes no throttle, or reads a climb rate', async mode => {
    const r = await centred()

    r.telemetry.value = { ...r.telemetry.value!, mode }
    await settle()
    expect(r.rc.state.value).toBe('on')
    r.stop()
  })

  it('does not end a control whose throttle rests low, in any mode', async () => {
    const r = await flying(await rcRig())

    r.telemetry.value = { ...r.telemetry.value!, mode: 'ACRO' }
    await settle()
    expect(r.rc.state.value).toBe('on')
    r.stop()
  })
})

describe('a centred throttle: where it ends', () => {
  const MODES = ['STABILIZE', 'ACRO', 'DRIFT', 'FLIP', 'SYSTEMID', 'MYSTERY']

  it.each(MODES)('is released at once in %s, with the reason MODE', async mode => {
    const r = await centred()

    r.telemetry.value = { ...r.telemetry.value!, mode }
    await settle()

    expect([r.rc.state.value, r.rc.why.value, r.control.rc!.released()]).toEqual(['off', 'MODE', 1])
    r.stop()
  })
})

describe('a centred throttle: what it sends', () => {
  it('is the middle of the range at the middle of the stick, and a straight line to RCn_MAX and RCn_MIN', async () => {
    const r = await open()

    expect(r.rc.gateOpen.value).toBe(true)
    expect(throttles(r.control).at(-1)).toBe(1500)
    r.pads.set([0, 0, 1, 0])
    await run(r, 100)
    expect(throttles(r.control).at(-1)).toBe(1900)
    r.pads.set([0, 0, -1, 0])
    await run(r, 100)
    expect(throttles(r.control).at(-1)).toBe(1100)
    r.stop()
  })

  it('holds the yaw back from the end of its travel whatever the throttle is: the middle is not low', async () => {
    const r = await open()

    r.pads.set([0, 0, 0, 1])
    await run(r, 100)

    expect(r.control.rc!.frames().at(-1)!.channels[3]).toBe(YAW_HELD)
    expect(r.rc.held.value).toBeGreaterThan(0)
    r.stop()
  })
})

describe('the rest check before anything is sent', () => {
  it('sends nothing while a stick is not at rest, and says which, with what each reads', async () => {
    const r = await centred()

    r.pads.set([0.72, 0, 0.5, 0])
    await run(r, 200)

    expect(r.rc.gateOpen.value).toBe(false)
    expect(r.control.rc!.frames().every(frame => frame.channels.every(pulse => pulse === 0))).toBe(true)
    expect(r.rc.restWait.value.map(wait => [wait.stick, wait.level])).toEqual([['roll', 0.72], ['throttle', 0.5]])
    r.stop()
  })
})

describe('the rest check that opens', () => {
  it('opens once they are at rest for ten reads, and has nothing more to say', async () => {
    const r = await centred()

    r.pads.set([0.72, 0, 0.5, 0])
    await run(r, 200)
    r.pads.set([0, 0, 0, 0])
    await run(r, 600)

    expect(r.rc.gateOpen.value).toBe(true)
    expect(r.rc.restWait.value).toEqual([])
    r.stop()
  })

  it('never sends for a trigger that rests at -1 as the roll', async () => {
    const r = await centred()

    r.pads.set([-1, 0, 0, 0])
    await run(r, 1000)

    expect(r.rc.gateOpen.value).toBe(false)
    expect(r.control.rc!.frames().every(frame => frame.channels.every(pulse => pulse === 0))).toBe(true)
    r.stop()
  })
})

describe('the rest check that never ends', () => {
  it('turns the control off after ten seconds of waiting: a control left "on, waiting" is not a control', async () => {
    const r = await centred()

    r.pads.set([1, 0, 0, 0])
    await run(r, 9000)
    expect(r.rc.state.value).toBe('on')
    await run(r, 1500)

    expect([r.rc.state.value, r.rc.why.value, r.control.rc!.released()]).toEqual(['off', 'REST_TIMEOUT', 1])
    r.stop()
  })

  it('does not time out once it has opened, and starts again with the gate shut after a release', async () => {
    const r = await open()

    r.pads.set([1, 0, 0, 0])
    await run(r, 12_000)
    expect(r.rc.state.value).toBe('on')
    r.rc.disable()
    await settle()
    r.pads.set([0, 0, 0, 0])
    r.pads.advance(20)
    await r.rc.enable()
    await settle()
    expect(r.rc.gateOpen.value).toBe(false)
    r.stop()
  })
})
