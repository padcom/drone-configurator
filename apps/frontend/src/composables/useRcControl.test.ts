import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { serialiseProfile } from '@/lib/rc/store'
import { TX16S } from '@/testing/fakeGamepads'
import { calibratedSuggestion } from '@/testing/rcProfiles'
import { CONNECTED, type RcRig, flying, rcRig, run, settle, throttles } from '@/testing/rcRig'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

/**
 * A control that is on, a pad at rest with the throttle low.
 *
 * @returns the rig
 */
async function on(): Promise<RcRig> {
  return flying(await rcRig())
}

describe('turning it on', () => {
  it('begins a control with the gate shut: the throttle is not sent until the stick has been low for a while', async () => {
    const r = await on()

    expect(r.rc.state.value).toBe('on')
    expect(r.control.rc!.on()).toBe(true)
    r.pads.advance(60)
    await settle()
    expect(throttles(r.control).every(pulse => pulse === 0)).toBe(true)
    expect(r.rc.gateOpen.value).toBe(false)
    await run(r, 400)
    expect(r.rc.gateOpen.value).toBe(true)
    expect(throttles(r.control).at(-1)).toBe(1100)
    r.stop()
  })
})

describe('what is sent', () => {
  it('is only what each read made, every 40 ms at the most, each with a new number', async () => {
    const r = await on()

    await run(r, 400)
    const frames = r.control.rc!.frames()

    expect(frames.length).toBeGreaterThanOrEqual(8)
    expect(frames.length).toBeLessThanOrEqual(11)
    expect(frames.map(frame => frame.seq)).toEqual(frames.map((_, index) => index + 1))
    r.pads.set([0.5, 0, -1, 0])
    r.pads.advance(40)
    await settle()
    expect(r.control.rc!.frames().at(-1)!.channels[0]).toBeGreaterThan(1500)
    r.stop()
  })
})

describe('what refuses a control: the setting and the link', () => {
  it('is the setting being off, and a link that is not a simulator', async () => {
    const off = await rcRig({ allowed: false })
    const link = await rcRig()

    link.request.value = { transport: 'tcp', host: '192.168.1.20', port: 5760 }
    await off.rc.enable()
    await link.rc.enable()

    expect([off.rc.state.value, off.rc.why.value, link.rc.why.value]).toEqual(['off', 'off', 'link'])
    expect(off.told).toEqual(['off'])
    expect(off.control.rc!.began() + link.control.rc!.began()).toBe(0)
  })

  it('is something else that holds the vehicle', async () => {
    const busy = await rcRig()

    busy.holder.busy = 'GUIDED'
    busy.pads.connect(TX16S)
    busy.pads.advance(20)
    await busy.rc.enable()

    expect(busy.rc.why.value).toBe('GUIDED')
    expect(busy.control.rc!.began()).toBe(0)
  })
})

describe('what refuses a control: the pad and the mapping', () => {
  it('is no pad, a pad with no mapping, and a mapping the wizard has not been through', async () => {
    const nopad = await rcRig()
    const none = await rcRig({ profile: null })
    const raw = await rcRig({ profile: { ...calibratedSuggestion(TX16S), calibrated: false } })

    await nopad.rc.enable()

    for (const r of [none, raw]) {
      r.pads.connect(TX16S)
      r.pads.advance(20)
    }
    await none.rc.enable()
    await raw.rc.enable()

    expect([nopad.rc.why.value, none.rc.why.value, raw.rc.why.value]).toEqual(['pad', 'mapping', 'mapping'])
    expect(raw.control.rc!.began()).toBe(0)
  })

  it('is a vehicle whose parameters are not known', async () => {
    const unknown = await rcRig()

    unknown.facts.value = null
    unknown.pads.connect(TX16S)
    unknown.pads.advance(20)
    await unknown.rc.enable()

    expect(unknown.rc.why.value).toBe('vehicle')
  })
})

describe('what ends a control: the pad', () => {
  it('is the pad unplugged, a read that came late, and the window hidden: it releases, and says why', async () => {
    const gone = await on()
    const late = await on()
    const hidden = await on()

    gone.pads.disconnect()
    gone.pads.advance(20)
    late.pads.skip(500)
    late.pads.advance(20)
    hidden.pads.show(false)
    await settle()

    expect([gone, late, hidden].map(r => r.rc.why.value)).toEqual(['PAD_NONE', 'PAD_LATE', 'PAD_HIDDEN'])
    expect([gone, late, hidden].map(r => [r.rc.state.value, r.control.rc!.released(), r.told.length])).toEqual(
      [['off', 1, 1], ['off', 1, 1], ['off', 1, 1]],
    )
  })
})

describe('what happens after the pad ended a control', () => {
  it('sends nothing more once it is off, and does not come back by itself when the pad does', async () => {
    const r = await on()

    r.pads.disconnect()
    r.pads.advance(20)
    await settle()
    const sent = r.control.rc!.frames().length
    r.pads.connect(TX16S)
    r.pads.advance(400)
    await settle()

    expect(r.rc.state.value).toBe('off')
    expect(r.control.rc!.frames()).toHaveLength(sent)
    expect(r.control.rc!.on()).toBe(false)
  })
})

describe('what ends a control: what it depends on', () => {
  const CHANGES: [string, (r: RcRig) => void][] = [
    ['NOT_ALLOWED', r => void (r.allowed.value = false)],
    ['LINK_LOST', r => void (r.connection.value = { state: 'lost' })],
    ['VEHICLE_CHANGED', r => void (r.connection.value = { ...CONNECTED, vehicle: { ...CONNECTED.vehicle!, sysid: 2 } })],
    ['NOT_SIMULATOR', r => void (r.request.value = { transport: 'serial', device: '/dev/ttyUSB0' })],
    ['PARAMS_UNKNOWN', r => void (r.facts.value = null)],
  ]

  it.each(CHANGES)('is %s: it releases once, off, and says why', async (why, change) => {
    const r = await on()

    change(r)
    await settle()

    expect([r.rc.state.value, r.rc.why.value, r.control.rc!.released()]).toEqual(['off', why, 1])
  })

  it('is an edit of the mapping (a calibrated mapping is never flown with once changed)', async () => {
    const r = await on()

    r.profiles.value = { [TX16S]: { ...calibratedSuggestion(TX16S), calibrated: false } }
    await settle()

    expect([r.rc.state.value, r.rc.why.value]).toEqual(['off', 'EDITED'])
    expect(serialiseProfile(r.profiles.value[TX16S]!)).toContain('"calibrated":false')
  })
})

describe('what ends a control: the backend, the person and the page', () => {
  it('is the backend ending it (its own watchdog), which is said, and the person turning it off, which is not', async () => {
    const backend = await on()
    const person = await on()

    backend.control.rc!.end('SILENT')
    await settle()
    person.rc.disable()
    await settle()

    expect([backend.rc.why.value, backend.told]).toEqual(['SILENT', ['SILENT']])
    expect([person.rc.why.value, person.told, person.control.rc!.released()]).toEqual(['RELEASED', [], 1])
  })

  it('is the page stopping: the scope ends, and the channels are released', async () => {
    const r = await on()

    r.stop()
    await settle()

    expect([r.control.rc!.released(), r.rc.state.value]).toEqual([1, 'off'])
  })
})

describe('turning it on again', () => {
  it('starts with the gate shut again, whatever it was before', async () => {
    const r = await on()

    await run(r, 400)
    expect(r.rc.gateOpen.value).toBe(true)
    r.rc.disable()
    await settle()
    r.pads.set([0, 0, 0.5, 0])
    await r.rc.enable()
    await settle()
    r.pads.advance(400)
    await settle()

    expect([r.rc.state.value, r.rc.gateOpen.value]).toEqual(['on', false])
    expect(throttles(r.control).slice(-5).every(pulse => pulse === 0)).toBe(true)
    r.stop()
  })
})

/** The end of the yaw's travel in the rig's calibration, and where the guard holds it back to (0.8 of its half range). */
const YAW_END = 1900
const YAW_HELD = 1820

/**
 * The yaw the last frame carried, with the throttle stick low and the yaw stick at its end.
 *
 * @param r the rig (a control is on)
 * @returns the pulse of channel 4
 */
async function yawAtTheEnd(r: RcRig): Promise<number> {
  r.pads.set([0, 0, -1, 1])
  await run(r, 400)

  return r.control.rc!.frames().at(-1)!.channels[3] ?? 0
}

describe('the sticks that arm and disarm (the option, for a simulator)', () => {
  it('is off unless it is asked for: the yaw is held back from the end of its travel, and nothing says otherwise', async () => {
    const r = await on()

    expect(await yawAtTheEnd(r)).toBe(YAW_HELD)
    expect(r.rc.rudderLifted.value).toBe(false)
    r.stop()
  })

  it('lifts the hold of the yaw only, once it is on: the yaw reaches its end, and the throttle gate is as it was', async () => {
    const r = await flying(await rcRig({ rudderArm: true }))

    expect(r.rc.rudderLifted.value).toBe(true)
    // (the gate is shut: no throttle yet, while the yaw is free)
    r.pads.set([0, 0, 0.5, 1])
    r.pads.advance(60)
    await settle()
    expect(throttles(r.control).every(pulse => pulse === 0)).toBe(true)
    expect(r.control.rc!.frames().at(-1)!.channels[3]).toBe(YAW_END)
    expect(r.rc.gateOpen.value).toBe(false)
    expect(await yawAtTheEnd(r)).toBe(YAW_END)
    expect(throttles(r.control).at(-1)).toBe(1100)
    r.stop()
  })
})

describe('the sticks that arm and disarm: when the setting is read', () => {
  it('is when the control begins: turning it over while the control flies changes nothing, either way', async () => {
    const r = await on()

    r.rudderArm.value = true
    expect(await yawAtTheEnd(r)).toBe(YAW_HELD)
    expect(r.rc.rudderLifted.value).toBe(false)
    r.rc.disable()
    await settle()
    r.pads.set([0, 0, -1, 0])
    await r.rc.enable()
    await settle()
    expect(r.rc.rudderLifted.value).toBe(true)
    r.rudderArm.value = false
    expect(await yawAtTheEnd(r)).toBe(YAW_END)
    expect(r.rc.rudderLifted.value).toBe(true)
    r.stop()
  })
})

describe('the sticks that arm and disarm: what is the same', () => {
  it('does nothing unless the control is allowed and the link a simulator: it is not begun, nor said to be lifted', async () => {
    const off = await rcRig({ allowed: false, rudderArm: true })
    const away = await rcRig({ rudderArm: true })

    away.request.value = { transport: 'tcp', host: 'example.org', port: 5760 }

    for (const rig of [off, away]) {
      rig.pads.connect(TX16S)
      rig.pads.set([0, 0, -1, 0])
      rig.pads.advance(20)
      // eslint-disable-next-line no-await-in-loop
      await rig.rc.enable()
    }
    expect([off.rc.state.value, off.rc.why.value, off.rc.rudderLifted.value]).toEqual(['off', 'off', false])
    expect([away.rc.state.value, away.rc.rudderLifted.value]).toEqual(['off', false])
    expect(away.control.rc!.frames()).toHaveLength(0)
    off.stop()
    away.stop()
  })

  it('ends like any other control, and is not lifted any more once it has: the dead-men are the same', async () => {
    const r = await flying(await rcRig({ rudderArm: true }))

    await run(r, 100)
    r.pads.disconnect()
    r.pads.advance(40)
    await settle()
    expect([r.rc.state.value, r.rc.why.value, r.rc.rudderLifted.value]).toEqual(['off', 'PAD_NONE', false])
    r.stop()
  })
})

describe('toggling and the summary', () => {
  it('toggles: on when it is off, off when it is on', async () => {
    const r = await on()

    r.rc.toggle()
    expect(r.rc.state.value).toBe('off')
    r.rc.toggle()
    await settle()
    expect(r.rc.state.value).toBe('on')
    r.stop()
  })
})

describe('the summary', () => {
  it('is asked once in a session, and not again', async () => {
    const r = await rcRig()
    const asked: number[] = []
    const ask = (): Promise<boolean> => Promise.resolve(asked.push(1) > 0)

    r.pads.connect(TX16S)
    r.pads.advance(20)
    await r.rc.turnOn(ask)
    await settle()
    r.rc.disable()
    await settle()
    await r.rc.turnOn(ask)
    await settle()

    expect(asked).toHaveLength(1)
    expect(r.rc.state.value).toBe('on')
    r.stop()
  })
})
