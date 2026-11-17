import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, shallowRef } from 'vue'
import { mockBackend } from '@/mock/mock-backend'
import { RC_ALLOW_KEY, profileKey } from '@/lib/rc/store'
import { NO_SOURCE, type Row } from '@/lib/rc/types'
import type { Facts } from '@/lib/rc/vehicle'
import { factsOf } from '@/lib/rc/vehicle'
import type { ConnectRequest } from '@/generated/app'
import { FakePads, TX16S } from '@/testing/fakeGamepads'
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
  const mapping = scope.run(() => {
    const pad = useGamepad({ env: pads.env() })

    pad.start()

    return useRcMapping({ pad, settings: useRcSettings(), facts, request })
  })!

  return { handle, pads, mapping, facts, request, scope }
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
  it('is the suggestion for a pad with none kept: not calibrated, and not kept until it is changed', async () => {
    const { handle, pads, mapping, scope } = await rig()

    expect(mapping.draft.value).toBeNull()
    plugged(pads)

    expect(mapping.device.value).toBe(TX16S)
    expect(mapping.draft.value!.calibrated).toBe(false)
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

describe('a change of the mapping while the wizard runs', () => {
  it('is not made', async () => {
    const { pads, mapping, scope } = await rig()

    plugged(pads)
    mapping.startWizard()
    mapping.change(0, { invert: true })
    mapping.add('switch')
    mapping.remove(0)

    expect(rowsOf(mapping)).toHaveLength(4)
    expect(rowsOf(mapping)[0]).toMatchObject({ invert: false })
    scope.stop()
  })
})

describe('the channel of a row', () => {
  it('is refused when the vehicle arms or stops with it, and the person is told which', async () => {
    const { pads, mapping, scope } = await rig([], vehicle({ 7: 153, 8: 31 }))

    plugged(pads)
    mapping.add('switch')
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
    mapping.add('switch')
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

describe('the channel of a row that is added', () => {
  it('is the next free one, never one the vehicle arms with', async () => {
    const { pads, mapping, scope } = await rig([], vehicle({ 5: 81 }))

    plugged(pads)
    mapping.add('switch')
    mapping.add('button')
    expect(rowsOf(mapping).map(row => [row.kind, row.channel])).toEqual([
      ['stick', 1], ['stick', 2], ['stick', 3], ['stick', 4], ['switch', 6], ['button', 7],
    ])
    mapping.remove(4)
    expect(channelsOf(mapping)).toEqual([1, 2, 3, 4, 7])
    scope.stop()
  })
})

describe('a row that is added has no control until the person moves one', () => {
  it('makes nothing, however the pad is moved, is a problem of the mapping, and waits for "move it"', async () => {
    const { pads, mapping, scope } = await rig([], vehicle({ 8: 4 }))

    plugged(pads)
    mapping.add('switch', 8)

    expect(rowsOf(mapping)[4]).toMatchObject({ kind: 'switch', channel: 8, axis: NO_SOURCE })
    expect(mapping.capturing.value).toBe(4)
    expect(mapping.unsourced.value).toBe(true)
    expect(mapping.issues.value.some(issue => issue.code === 'source' && issue.channel === 8)).toBe(true)
    pads.set([1, 1, 1, 1, 1, 1, 1, 1], [1, 1, 1, 1])
    pads.advance(20)
    expect(mapping.pulseOf(rowsOf(mapping)[4]!)).toBe(0)
    scope.stop()
  })

  it('is read from the control that is moved, and then the mapping has no problem of that kind', async () => {
    const { pads, mapping, scope } = await rig()

    plugged(pads)
    mapping.add('switch', 8)
    pads.advance(20)
    pads.set([0, 0, 0, 0, 0, 1, 0, 0])
    pads.advance(20)

    expect(rowsOf(mapping)[4]).toMatchObject({ axis: 5 })
    expect(mapping.unsourced.value).toBe(false)
    expect(mapping.issues.value.some(issue => issue.code === 'source')).toBe(false)
    scope.stop()
  })
})

describe('the wizard while a row has no control', () => {
  it('does not begin', async () => {
    const { pads, mapping, scope } = await rig()

    plugged(pads)
    mapping.add('button', 9)
    mapping.startWizard()

    expect(mapping.wizard.value).toBeNull()
    scope.stop()
  })
})

describe('a row moved to a channel another row drives', () => {
  it('is refused, and the person is told which channel, and the row stays', async () => {
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

describe('a row added on a channel that was chosen', () => {
  it('goes on that channel, and not on one a row drives or one that is not a channel', async () => {
    const { pads, mapping, scope } = await rig()

    plugged(pads)
    mapping.add('switch', 11)
    mapping.add('button', 3)
    mapping.add('button', 17)
    mapping.add('stick', 11)

    expect(rowsOf(mapping).map(row => [row.kind, row.channel])).toEqual([
      ['stick', 1], ['stick', 2], ['stick', 3], ['stick', 4], ['switch', 11],
    ])
    scope.stop()
  })

  it('is refused for a channel the vehicle arms with, and the person is told which', async () => {
    const { pads, mapping, scope } = await rig([], vehicle({ 9: 153 }))

    plugged(pads)
    mapping.add('switch', 9)

    expect(rowsOf(mapping)).toHaveLength(4)
    expect(mapping.refusal.value).toMatchObject({ code: 'arm', channel: 9 })
    mapping.add('switch', 10)
    expect(mapping.refusal.value).toBeNull()
    expect(channelsOf(mapping)).toEqual([1, 2, 3, 4, 10])
    scope.stop()
  })
})

describe('"move it"', () => {
  it('sets the axis of a row to the one that is moved after it began, whatever the sticks said before', async () => {
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
    expect(rowsOf(mapping)[0]).toMatchObject({ kind: 'stick', axis: 5 })
    scope.stop()
  })
})

describe('"move it" for a button, and given up', () => {
  it('sets the button of a button row, and not an axis', async () => {
    const { pads, mapping, scope } = await rig()

    plugged(pads)
    mapping.add('button')
    mapping.capture(4)
    pads.advance(20)
    pads.set([1, 0, 0, 0], [0, 0, 1])
    pads.advance(20)

    expect(rowsOf(mapping)[4]).toMatchObject({ kind: 'button', button: 2 })
    scope.stop()
  })

  it('can be given up, and waits for nothing when the wizard runs', async () => {
    const { pads, mapping, scope } = await rig()

    plugged(pads)
    mapping.capture(1)
    mapping.cancelCapture()
    expect(mapping.capturing.value).toBeNull()
    mapping.startWizard()
    mapping.capture(1)
    expect(mapping.capturing.value).toBeNull()
    scope.stop()
  })
})

/**
 * Runs the wizard's two steps with some of the sticks moved to their ends.
 *
 * @param pads the pads
 * @param mapping the mapping
 * @param axes the axes that are moved
 */
function calibrate(pads: FakePads, mapping: RcMapping, axes: number[]): void {
  mapping.startWizard()
  pads.set([0, 0, -1, 0])
  pads.advance(20 * 12)
  mapping.nextStep()

  for (const value of [-1, 1]) {
    pads.set([0, 1, 2, 3].map(axis => (axes.includes(axis) ? value : (axis === 2 ? -1 : 0))))
    pads.advance(20)
  }
}

describe('the wizard', () => {
  it('needs the reads at rest before it goes on', async () => {
    const { pads, mapping, scope } = await rig()

    plugged(pads)
    mapping.startWizard()
    expect(mapping.wizard.value).toMatchObject({ step: 'rest', ready: false })
    mapping.nextStep()
    expect(mapping.wizard.value?.step).toBe('rest')
    pads.advance(20 * 12)
    expect(mapping.wizard.value).toMatchObject({ step: 'rest', ready: true })
    mapping.nextStep()
    expect(mapping.wizard.value?.step).toBe('move')
    scope.stop()
  })

  it('calibrates the mapping and keeps it, with the mark, when every stick was moved to its ends', async () => {
    const { handle, pads, mapping, scope } = await rig()

    plugged(pads)
    calibrate(pads, mapping, [0, 1, 2, 3])
    expect(mapping.wizard.value!.axes.map(one => one.travel)).toEqual([2, 2, 2, 2])
    mapping.finishWizard()
    await vi.advanceTimersByTimeAsync(0)

    expect(mapping.wizard.value).toBeNull()
    expect(mapping.draft.value!.calibrated).toBe(true)
    expect(handle.settings.uiValue(profileKey(TX16S))).toContain('"calibrated":true')
    scope.stop()
  })
})

describe('the wizard that is not finished', () => {
  it('says which axes were not moved, gives no mark, and can be given up', async () => {
    const { pads, mapping, scope } = await rig()

    plugged(pads)
    calibrate(pads, mapping, [0, 1, 3])
    mapping.finishWizard()

    expect(mapping.wizard.value).toMatchObject({ step: 'move', failed: [2] })
    expect(mapping.draft.value!.calibrated).toBe(false)
    mapping.cancelWizard()
    expect(mapping.wizard.value).toBeNull()
    scope.stop()
  })

  it('does not start with no pad, and a change after it takes the mark away again', async () => {
    const { pads, mapping, scope } = await rig()

    mapping.startWizard()
    expect(mapping.wizard.value).toBeNull()
    plugged(pads)
    calibrate(pads, mapping, [0, 1, 2, 3])
    mapping.finishWizard()
    expect(mapping.draft.value!.calibrated).toBe(true)
    mapping.change(0, { expo: 0.3 })
    expect(mapping.draft.value!.calibrated).toBe(false)
    scope.stop()
  })
})

describe('what stands in the way of control', () => {
  it('is, in this order: the setting, the link, the pad, the mapping, the vehicle', async () => {
    const { pads, mapping, request, handle, scope } = await rig()

    expect(mapping.block.value).toBe('off')
    await useRcSettings().allow(true)
    expect(handle.settings.uiValue(RC_ALLOW_KEY)).toBe('on')
    request.value = { transport: 'serial', device: '/dev/ttyUSB0' }
    expect(mapping.block.value).toBe('link')
    request.value = { transport: 'simulator' }
    expect(mapping.block.value).toBe('pad')
    plugged(pads)
    expect(mapping.block.value).toBe('mapping')
    calibrate(pads, mapping, [0, 1, 2, 3])
    mapping.finishWizard()
    expect(mapping.block.value).toBeNull()
    scope.stop()
  })

  it('lists the mapping\'s problems and the vehicle\'s, each said once', async () => {
    const { pads, mapping, facts, scope } = await rig([], null)

    plugged(pads)
    expect(mapping.issues.value).toEqual([
      { code: 'uncalibrated', channel: 0, blocks: true, from: 'mapping' },
      { code: 'unknown', channel: 0, blocks: true, from: 'vehicle' },
    ])
    facts.value = vehicle()
    expect(mapping.issues.value.map(issue => issue.code)).toEqual(['uncalibrated'])
    scope.stop()
  })
})

describe('the live pulse of a row', () => {
  it('is what the row makes of the pad now, in the vehicle\'s range, and nothing when no pad is read', async () => {
    const { pads, mapping, scope } = await rig()

    plugged(pads)
    pads.set([1, 0, -1, 0])
    pads.advance(20)
    const [roll, pitch, throttle] = rowsOf(mapping)

    expect(mapping.pulseOf(roll!)).toBe(1900)
    expect(mapping.pulseOf(pitch!)).toBe(1500)
    expect(mapping.pulseOf(throttle!)).toBe(1100)
    pads.disconnect()
    pads.advance(20)
    expect(mapping.pulseOf(roll!)).toBeNull()
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
