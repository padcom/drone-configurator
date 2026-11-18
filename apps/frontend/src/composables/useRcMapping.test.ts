import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, shallowRef } from 'vue'
import { mockBackend } from '@/mock/mock-backend'
import { RC_ALLOW_KEY, profileKey } from '@/lib/rc/store'
import type { Row } from '@/lib/rc/types'
import type { Facts } from '@/lib/rc/vehicle'
import { factsOf } from '@/lib/rc/vehicle'
import type { ConnectRequest } from '@/generated/app'
import { FakePads, TX16S } from '@/testing/fakeGamepads'
import { TX16S_LAYOUT } from '@/testing/rcProfiles'
import { createConfigurator } from './useConfigurator'
import { useGamepad } from './useGamepad'
import { type RcMapping, useRcMapping } from './useRcMapping'
import { forgetRcAllowChoice, useRcSettings } from './useRcSettings'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  forgetRcAllowChoice()
})

const STICKS = ['ROLL', 'PITCH', 'THROTTLE', 'YAW']

/**
 * A vehicle's parameters for the channels, with the functions given.
 *
 * @param options the `RCn_OPTION` of the channels that have one
 * @returns the facts
 */
function vehicle(options: Record<number, number> = {}): Facts {
  const params = STICKS.map((name, index) => ({ id: `RCMAP_${name}`, value: index + 1 }))

  for (let channel = 1; channel <= 16; channel += 1) {
    params.push(
      { id: `RC${channel}_OPTION`, value: options[channel] ?? 0 },
      { id: `RC${channel}_DZ`, value: 0 },
      { id: `RC${channel}_MIN`, value: 1100 },
      { id: `RC${channel}_TRIM`, value: 1500 },
      { id: `RC${channel}_MAX`, value: 1900 },
    )
  }

  return factsOf(params, true)!
}

/**
 * What a vehicle says when its roll and pitch are the other way round.
 *
 * @returns the facts
 */
function swapped(): Facts {
  const channels = [2, 1, 3, 4]

  return factsOf(STICKS.map((name, index) => ({ id: `RCMAP_${name}`, value: channels[index]! })), true)!
}

/**
 * The screen's mapping over a scripted pad, with the settings of a mock backend.
 *
 * @param ui the settings entries
 * @param known what the vehicle says
 * @returns what a test works with
 */
async function rig(ui: { key: string, value: string }[] = [], known: Facts | null = vehicle()) {
  const handle = createConfigurator(mockBackend({ settings: { version: 1, ui } }))
  await handle.settings.load()
  const pads = new FakePads()
  const scope = effectScope()
  const facts = shallowRef<Facts | null>(known)
  const request = shallowRef<ConnectRequest | null>({ transport: 'simulator' })
  const mode = shallowRef<string | undefined>('ALT_HOLD')
  const mapping = scope.run(() => {
    const pad = useGamepad({ env: pads.env() })

    pad.start()

    return useRcMapping({ pad, settings: useRcSettings(), facts, request, mode })
  })!

  return { handle, pads, mapping, facts, request, mode, scope }
}

/**
 * Brings the radio up and reads it once.
 *
 * @param pads the pads
 * @param id the device
 */
function plugged(pads: FakePads, id = TX16S): void {
  pads.connect(id)
  pads.advance(20)
}

/**
 * The rows of the mapping that is shown.
 *
 * @param mapping the mapping
 * @returns its rows
 */
function rowsOf(mapping: RcMapping): readonly Row[] {
  return mapping.draft.value!.rows
}

/**
 * The channels of the rows of the mapping that is shown.
 *
 * @param mapping the mapping
 * @returns the channels, in order
 */
function channelsOf(mapping: RcMapping): number[] {
  return rowsOf(mapping).map(row => row.channel)
}

describe('the mapping that is shown first', () => {
  it('is the suggestion for a pad with none kept: centred, not confirmed, and not kept until it is changed', async () => {
    const { handle, pads, mapping, scope } = await rig()

    expect(mapping.draft.value).toBeNull()
    plugged(pads)

    expect(mapping.device.value).toBe(TX16S)
    expect(mapping.draft.value!.confirmedKey).toBeNull()
    expect(mapping.draft.value!.throttleStyle).toBe('centred')
    expect(mapping.confirmed.value).toBe(false)
    expect(channelsOf(mapping)).toEqual([1, 2, 3, 4])
    expect(handle.settings.uiValue(profileKey(TX16S))).toBeUndefined()
    scope.stop()
  })

  it('follows what the vehicle says only while nobody has changed it', async () => {
    const { pads, mapping, facts, scope } = await rig([], null)

    plugged(pads)
    facts.value = swapped()
    await nextTick()
    expect(channelsOf(mapping)).toEqual([2, 1, 3, 4])
    mapping.change(0, { invert: true })
    facts.value = vehicle()
    await nextTick()
    expect(channelsOf(mapping)).toEqual([2, 1, 3, 4])
    scope.stop()
  })
})

describe('the layout of the pad that is read', () => {
  it('knows what each channel of the pad is: the TX16S\'s 8 axes, then its first 8 buttons', async () => {
    const { pads, mapping, scope } = await rig()

    expect(mapping.layout.value).toBeNull()
    plugged(pads)
    expect(mapping.layout.value).toEqual(TX16S_LAYOUT)
    scope.stop()
  })
})

describe('a change of the mapping', () => {
  it('is kept in the settings at once', async () => {
    const { handle, pads, mapping, scope } = await rig()

    plugged(pads)
    mapping.change(0, { invert: true })
    await vi.advanceTimersByTimeAsync(0)

    expect(rowsOf(mapping)[0]).toMatchObject({ invert: true })
    expect(handle.settings.uiValue(profileKey(TX16S))).toContain('"invert":true')
    scope.stop()
  })

  it('is not made with a number that is not a number', async () => {
    const { pads, mapping, scope } = await rig()

    plugged(pads)
    mapping.change(0, { deadZone: Number.NaN })
    mapping.change(0, { expo: Infinity })

    expect(rowsOf(mapping)[0]).toMatchObject({ deadZone: 0.08, expo: 0 })
    scope.stop()
  })
})

describe('the channel of a row', () => {
  it('is refused when the vehicle arms or stops with it, and the person is told which', async () => {
    const { pads, mapping, scope } = await rig([], vehicle({ 7: 153, 8: 31 }))

    plugged(pads)
    mapping.add(5)
    mapping.setChannel(4, 7)
    expect(mapping.refusal.value).toEqual({ code: 'arm', channel: 7, serial: 1 })
    mapping.setChannel(4, 8)
    expect(mapping.refusal.value).toEqual({ code: 'arm', channel: 8, serial: 2 })
    expect(channelsOf(mapping)[4]).toBe(5)
    scope.stop()
  })

  it('is taken when it is any other, and not when it is not a channel', async () => {
    const { pads, mapping, scope } = await rig([], vehicle({ 7: 153 }))

    plugged(pads)
    mapping.add(5)
    mapping.setChannel(4, 7)
    mapping.setChannel(4, 9)
    expect(mapping.refusal.value).toBeNull()
    expect(channelsOf(mapping)[4]).toBe(9)
    mapping.setChannel(4, 17)
    mapping.setChannel(4, 2.5)
    expect(channelsOf(mapping)[4]).toBe(9)
    scope.stop()
  })
})

describe('the channel of a row that another row drives', () => {
  it('is refused, and the row stays', async () => {
    const { pads, mapping, scope } = await rig()

    plugged(pads)
    mapping.setChannel(0, 2)

    expect(channelsOf(mapping)).toEqual([1, 2, 3, 4])
    expect(mapping.refusal.value).toMatchObject({ code: 'taken', channel: 2 })
    mapping.setChannel(0, 9)
    expect(mapping.refusal.value).toBeNull()
    expect(channelsOf(mapping)).toEqual([9, 2, 3, 4])
    scope.stop()
  })
})

describe('a row that is added', () => {
  it('goes on the next free channel, never one the vehicle arms with, and on the one chosen when it may', async () => {
    const { pads, mapping, scope } = await rig([], vehicle({ 5: 81, 9: 153 }))

    plugged(pads)
    mapping.add()
    mapping.add(11)
    mapping.add(3)
    mapping.add(17)
    mapping.add(9)
    expect(mapping.refusal.value).toMatchObject({ code: 'arm', channel: 9 })
    expect(channelsOf(mapping)).toEqual([1, 2, 3, 4, 6, 11])
    mapping.remove(4)
    expect(channelsOf(mapping)).toEqual([1, 2, 3, 4, 11])
    scope.stop()
  })
})

describe('a row that is added with no control', () => {
  it('makes nothing, however the pad is moved, and the mapping is wrong, until the person moves one', async () => {
    const { pads, mapping, scope } = await rig([], vehicle({ 8: 4 }))

    plugged(pads)
    mapping.add(8)

    expect(rowsOf(mapping)[4]).toMatchObject({ channel: 8, source: 0 })
    expect(mapping.capturing.value).toBe(4)
    expect(mapping.unsourced.value).toBe(true)
    expect(mapping.issues.value.some(issue => issue.code === 'source' && issue.channel === 8)).toBe(true)
    pads.set([1, 1, 1, 1, 1, 1, 1, 1], [1, 1, 1, 1])
    pads.advance(20)
    expect(mapping.pulseOf(rowsOf(mapping)[4]!)).toBe(0)
    scope.stop()
  })
})

describe('"move it"', () => {
  it('sets the source of a row to the pad channel that is moved after it began, whatever the sticks said before', async () => {
    const { pads, mapping, scope } = await rig()

    plugged(pads)
    pads.set([0, 0, -1, 0, 0, 0, 0, 0])
    mapping.capture(0)
    expect(mapping.capturing.value).toBe(0)
    pads.advance(40)
    expect(mapping.capturing.value).toBe(0)
    pads.set([0, 0, -1, 0, 0, 1, 0, 0])
    pads.advance(20)

    expect(mapping.capturing.value).toBeNull()
    expect(rowsOf(mapping)[0]).toMatchObject({ source: 6 })
    scope.stop()
  })
})

describe('"move it" for a button, and given up', () => {
  it('finds a button like a stick: it is a pad channel after the axes, from -1 to 1', async () => {
    const { pads, mapping, scope } = await rig()

    plugged(pads)
    mapping.add(5)
    pads.advance(20)
    pads.set([0, 0, 0, 0], [0, 0, 1])
    pads.advance(20)

    expect(rowsOf(mapping)[4]).toMatchObject({ channel: 5, source: 11 })
    expect(mapping.unsourced.value).toBe(false)
    scope.stop()
  })

  it('can be given up', async () => {
    const { pads, mapping, scope } = await rig()

    plugged(pads)
    mapping.capture(1)
    mapping.cancelCapture()
    expect(mapping.capturing.value).toBeNull()
    scope.stop()
  })
})

describe('confirming the mapping', () => {
  it('is one click with a pad that is read: the mapping is then confirmed for it, and the key is kept', async () => {
    const { handle, pads, mapping, scope } = await rig()

    plugged(pads)
    expect(mapping.canConfirm.value).toBe(true)
    mapping.confirm()
    await vi.advanceTimersByTimeAsync(0)

    expect(mapping.confirmed.value).toBe(true)
    expect(mapping.issues.value).toEqual([])
    expect(handle.settings.uiValue(profileKey(TX16S))).toContain('"confirmedKey":"')
    scope.stop()
  })
})

describe('confirming the mapping when it cannot be', () => {
  it('is refused with no pad, and with a stick that no row drives', async () => {
    const none = await rig()

    none.mapping.confirm()
    expect(none.mapping.draft.value).toBeNull()
    plugged(none.pads)
    none.mapping.remove(1)
    expect(none.mapping.canConfirm.value).toBe(false)
    none.mapping.confirm()
    expect(none.mapping.confirmed.value).toBe(false)
    none.scope.stop()
  })

  it('is refused with a stick that is on a button of the pad', async () => {
    const { pads, mapping, scope } = await rig()

    plugged(pads)
    expect(mapping.canConfirm.value).toBe(true)
    mapping.change(1, { source: 11 })
    expect(mapping.canConfirm.value).toBe(false)
    scope.stop()
  })
})

describe('confirming the mapping without a vehicle', () => {
  it('is allowed: ArduPilot\'s sticks are 1 to 4, and the control does not begin on a vehicle that has not said', async () => {
    const unknown = await rig([], null)

    plugged(unknown.pads)
    expect(unknown.mapping.canConfirm.value).toBe(true)
    unknown.mapping.confirm()
    expect(unknown.mapping.confirmed.value).toBe(true)
    expect(unknown.mapping.issues.value.map(issue => issue.code)).toEqual(['unknown'])
    unknown.scope.stop()
  })
})

describe('the confirmation of the mapping, taken away', () => {
  it('is taken away by ANY change: a row, the style, and a pad that is not the one that was confirmed', async () => {
    const { pads, mapping, scope } = await rig()

    plugged(pads, 'pad one')
    mapping.confirm()
    expect(mapping.confirmed.value).toBe(true)
    mapping.change(0, { expo: 0.2 })
    expect(mapping.confirmed.value).toBe(false)
    mapping.confirm()
    mapping.setStyle('low')
    expect(mapping.confirmed.value).toBe(false)
    expect(mapping.draft.value!.throttleStyle).toBe('low')
    mapping.confirm()
    expect(mapping.confirmed.value).toBe(true)
    pads.disconnect()
    pads.advance(20)
    plugged(pads, 'pad two')
    expect(mapping.confirmed.value).toBe(false)
    scope.stop()
  })
})

describe('a mapping of the first version that was converted', () => {
  it('says so, until it is confirmed', async () => {
    const stick = (channel: number, min: number) => ({
      kind: 'stick', channel, axis: channel - 1, invert: false, calibration: { min, center: 0, max: 1 }, deadZone: 0.08, expo: 0,
    })
    const rows = [stick(1, -0.5), stick(2, -1), stick(3, -1), stick(4, -1)]
    const old = JSON.stringify({ version: 1, device: TX16S, calibrated: true, rows })
    const { pads, mapping, scope } = await rig([{ key: profileKey(TX16S), value: old }])

    plugged(pads)
    expect(mapping.converted.value).toBe(true)
    expect(mapping.confirmed.value).toBe(false)
    expect(mapping.draft.value!.throttleStyle).toBe('low')
    mapping.confirm()
    expect(mapping.confirmed.value).toBe(true)
    expect(mapping.converted.value).toBe(false)
    scope.stop()
  })
})

describe('the throttle style', () => {
  it('is chosen on the mapping, kept, and not changed by choosing it again', async () => {
    const { handle, pads, mapping, scope } = await rig()

    plugged(pads)
    mapping.setStyle('centred')
    expect(handle.settings.uiValue(profileKey(TX16S))).toBeUndefined()
    mapping.setStyle('low')
    await vi.advanceTimersByTimeAsync(0)

    expect(mapping.draft.value!.throttleStyle).toBe('low')
    expect(handle.settings.uiValue(profileKey(TX16S))).toContain('"throttleStyle":"low"')
    scope.stop()
  })
})

describe('what stands in the way of control', () => {
  it('is, in this order: the setting, the link, the pad, the mapping, the mode', async () => {
    const { pads, mapping, request, mode, handle, scope } = await rig()

    expect(mapping.block.value).toBe('off')
    await useRcSettings().allow(true)
    expect(handle.settings.uiValue(RC_ALLOW_KEY)).toBe('on')
    request.value = { transport: 'serial', device: '/dev/ttyUSB0' }
    expect(mapping.block.value).toBe('link')
    request.value = { transport: 'simulator' }
    expect(mapping.block.value).toBe('pad')
    plugged(pads)
    expect(mapping.block.value).toBe('mapping')
    mapping.confirm()
    expect(mapping.block.value).toBeNull()
    mode.value = 'STABILIZE'
    expect(mapping.block.value).toBe('mode')
    mapping.setStyle('low')
    mapping.confirm()
    expect(mapping.block.value).toBeNull()
    scope.stop()
  })
})

describe('a request that the page does not know', () => {
  it('is left to the backend while a vehicle is connected, as the Fly switch does', async () => {
    const connected = shallowRef(true)
    const handle = createConfigurator(mockBackend({ settings: { version: 1, ui: [{ key: RC_ALLOW_KEY, value: 'on' }] } }))
    await handle.settings.load()
    const pads = new FakePads()
    const scope = effectScope()
    const request = shallowRef<ConnectRequest | null>(null)
    const mapping = scope.run(() => {
      const pad = useGamepad({ env: pads.env() })

      pad.start()

      return useRcMapping({ pad, settings: useRcSettings(), facts: shallowRef(vehicle()), request, connected })
    })!

    expect(mapping.block.value).toBe('pad')
    connected.value = false
    expect(mapping.block.value).toBe('link')
    scope.stop()
  })
})

describe('the problems of the mapping and the vehicle', () => {
  it('are listed, each said once', async () => {
    const { pads, mapping, facts, scope } = await rig([], null)

    plugged(pads)
    expect(mapping.issues.value).toEqual([
      { code: 'unconfirmed', channel: 0, blocks: true, from: 'mapping' },
      { code: 'unknown', channel: 0, blocks: true, from: 'vehicle' },
    ])
    facts.value = vehicle()
    expect(mapping.issues.value.map(issue => issue.code)).toEqual(['unconfirmed'])
    scope.stop()
  })

  it('say a centred throttle whose zone is too small is a problem of the vehicle and the mapping together', async () => {
    const { pads, mapping, scope } = await rig()

    plugged(pads)
    mapping.change(2, { deadZone: 0.02 })

    expect(mapping.issues.value.some(issue => issue.code === 'centre' && issue.from === 'vehicle' && issue.blocks)).toBe(true)
    scope.stop()
  })
})

describe('what the sticks do now', () => {
  it('is the pulse a row makes in the vehicle\'s range, and what it reads: both nothing when no pad is read', async () => {
    const { pads, mapping, scope } = await rig()

    plugged(pads)
    pads.set([1, 0, -1, 0])
    pads.advance(20)
    const [roll, pitch, throttle] = rowsOf(mapping)

    expect(mapping.pulseOf(roll!)).toBe(1900)
    expect(mapping.pulseOf(pitch!)).toBe(1500)
    expect(mapping.pulseOf(throttle!)).toBe(1100)
    expect(mapping.levelOf(roll!)).toBe(1)
    expect(mapping.levelOf(throttle!)).toBe(-1)
    pads.disconnect()
    pads.advance(20)
    expect(mapping.pulseOf(roll!)).toBeNull()
    expect(mapping.levelOf(roll!)).toBeNull()
    scope.stop()
  })
})

describe('the sticks that are not at rest', () => {
  it('are said, as the turn-on would wait for them, and none is once they are at rest', async () => {
    const { pads, mapping, scope } = await rig()

    expect(mapping.notAtRest.value).toBeNull()
    plugged(pads)
    pads.set([0, 0, 0, 0])
    pads.advance(20)
    expect(mapping.notAtRest.value).toEqual([])
    pads.set([0.8, 0, 0.5, 0])
    pads.advance(20)
    expect(mapping.notAtRest.value!.map(stick => stick.stick)).toEqual(['roll', 'throttle'])
    scope.stop()
  })
})

describe('the mapping when the pad goes and another comes', () => {
  it('shows the new pad\'s mapping, gives up what was waiting, and keeps the old one where it is', async () => {
    const { pads, mapping, scope } = await rig()

    plugged(pads, 'pad one')
    mapping.change(0, { invert: true })
    mapping.capture(1)
    pads.disconnect()
    pads.advance(20)
    expect(mapping.device.value).toBe('pad one')
    plugged(pads, 'pad two')

    expect(mapping.device.value).toBe('pad two')
    expect(mapping.capturing.value).toBeNull()
    expect(rowsOf(mapping)[0]).toMatchObject({ invert: false })
    scope.stop()
  })
})
