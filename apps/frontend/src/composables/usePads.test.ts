// The pads the backend reads as the page's pad source: the browser's by default, the backend's when it is chosen (or when `auto`
// finds the backend has a pad backend), the pad chosen of several, the sample shaped as the browser's `Gamepad`, and the rule
// that silence is a gap (a sample is of the page's own clock, and an old one is no pad).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, shallowRef } from 'vue'
import { createBackendClient } from '@/backend/client'
import { type MockControl, mockBackend } from '@/mock/mock-backend'
import type { MockPadSpec } from '@/mock/mock-pad'
import type { PadSourceChoice } from '@/lib/rc/padsource'
import type { RcSettings } from './useRcSettings'
import { type PadsModel, usePads } from './usePads'

const RADIO: MockPadSpec = { id: '1209:4f54', name: 'Radio', axes: 8, buttons: 24, legacyId: 'OpenTX Radiomaster TX16S Joystick' }
const SECOND: MockPadSpec = { id: '045e:028e', name: 'Second', axes: 4, buttons: 8 }

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  Reflect.deleteProperty(navigator, 'getGamepads')
})

/** What a test works with. */
interface Rig {
  pads: PadsModel
  control: MockControl
  source: { value: PadSourceChoice }
  device: { value: string }
  /** How far the page's clock is ahead of the timers (ms): a test moves it by itself, to make the samples old. */
  skew: { value: number }
}

/**
 * The pads over a mock backend, with the choices as refs and the page's clock in the test's hands.
 *
 * @param choice where the pad is read from
 * @returns the rig
 */
function rig(choice: PadSourceChoice): Rig {
  const control: MockControl = {}
  const client = createBackendClient(mockBackend({ settings: { version: 1, ui: [] }, control }))
  const source = shallowRef<PadSourceChoice>(choice)
  const device = shallowRef('')
  const skew = { value: 0 }
  const settings = { padSource: computed(() => source.value), padDevice: computed(() => device.value) } as unknown as RcSettings
  const pads = usePads({ client, settings, now: () => performance.now() + skew.value })

  return { pads, control, source, device, skew }
}

/**
 * Lets the backend send for a while (the mock sends a sample every 20 ms).
 *
 * @param ms how long
 */
async function pass(ms: number): Promise<void> {
  await vi.advanceTimersByTimeAsync(ms)
}

describe('the source', () => {
  it('is the browser\'s by default: the backend is not asked for anything, and the browser\'s pad is read', async () => {
    const pad = { id: 'browser pad', index: 0, connected: true, axes: [0.5], buttons: [] }

    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [pad] })
    const r = rig('browser')

    r.control.pads!.plug(RADIO)
    await pass(100)

    expect(r.pads.list.value).toBeNull()
    expect(r.control.pads!.reading()).toBe(0)
    expect(r.pads.environment.pads()[0]?.id).toBe('browser pad')
  })

  it('is the backend\'s when it is chosen', async () => {
    const r = rig('backend')

    r.control.pads!.plug(RADIO)
    await pass(100)

    expect([r.pads.source.value, r.pads.environment.pads()[0]?.id]).toEqual(['backend', RADIO.id])
  })
})

describe('the source when it is changed', () => {
  it('stops following the backend when the browser is chosen again', async () => {
    const r = rig('backend')

    r.control.pads!.plug(RADIO)
    await pass(60)
    expect(r.control.pads!.reading()).toBe(1)
    r.source.value = 'browser'
    await pass(40)

    expect(r.control.pads!.reading()).toBe(0)
  })
})

describe('the source "automatic"', () => {
  it('is the backend where it has a pad backend, and the browser where it has not (and before it has said)', async () => {
    const r = rig('auto')

    expect(r.pads.source.value).toBe('browser')
    r.control.pads!.supported(false)
    await pass(40)
    expect(r.pads.source.value).toBe('browser')
    r.control.pads!.supported(true)
    await pass(40)
    expect(r.pads.source.value).toBe('backend')
  })
})

describe('what a pad of the backend looks like to the reader', () => {
  it('is its axes and then its buttons, as the browser\'s Gamepad shows them, with the browser\'s own name for it', async () => {
    const r = rig('backend')

    r.control.pads!.plug(RADIO)
    r.control.pads!.set(RADIO.id, 4, 0.5)
    r.control.pads!.set(RADIO.id, 9, 1)
    r.control.pads!.set(RADIO.id, 10, -1)
    await pass(60)
    const pad = r.pads.environment.pads()[0]!

    expect([pad.id, pad.legacyId, pad.connected]).toEqual([RADIO.id, RADIO.legacyId, true])
    expect(pad.axes).toHaveLength(8)
    expect(pad.axes[3]).toBe(0.5)
    expect(pad.buttons).toHaveLength(8)
    expect([pad.buttons[0]?.value, pad.buttons[1]?.value]).toEqual([1, 0])
  })

  it('is nothing once its samples are old: silence is a gap, never a stick held', async () => {
    const r = rig('backend')

    r.control.pads!.plug(RADIO)
    await pass(60)
    expect(r.pads.environment.pads()[0]).not.toBeNull()
    r.skew.value += 150

    expect(r.pads.environment.pads()).toEqual([null])
  })
})

describe('the pads that come and go', () => {
  it('ends the read when the pad is unplugged, and reads it again when it is plugged back', async () => {
    const r = rig('backend')

    r.control.pads!.plug(RADIO)
    await pass(60)
    r.control.pads!.unplug(RADIO.id)
    await pass(40)
    expect(r.pads.environment.pads()).toEqual([null])
    expect(r.pads.selected.value).toBeNull()
    r.control.pads!.plug(RADIO)
    await pass(60)

    expect(r.pads.environment.pads()[0]?.id).toBe(RADIO.id)
  })

  it('reads the pad that was chosen when there are several, and the first when none was', async () => {
    const r = rig('backend')

    r.control.pads!.plug(RADIO)
    r.control.pads!.plug(SECOND)
    await pass(60)
    expect(r.pads.selected.value?.id).toBe(RADIO.id)
    r.device.value = SECOND.id
    await pass(60)

    expect([r.pads.environment.pads()[0]?.id, r.control.pads!.reading()]).toEqual([SECOND.id, 1])
  })
})

describe('the pads that cannot be read', () => {
  it('does not read a pad it may not open, and says it is there: the list keeps it apart', async () => {
    const r = rig('backend')

    r.control.pads!.plug(RADIO)
    r.control.pads!.deny(RADIO.id, true)
    await pass(60)

    expect(r.pads.list.value?.denied.map(d => d.id)).toEqual([RADIO.id])
    expect(r.pads.selected.value).toBeNull()
    expect([r.pads.environment.pads(), r.control.pads!.reading()]).toEqual([[null], 0])
  })

  it('says why a read ended by itself, and does not open it again until the pad is gone and back', async () => {
    const r = rig('backend')

    r.control.pads!.plug(RADIO)
    await pass(60)
    r.control.pads!.end(RADIO.id, 'IO')
    await pass(60)

    expect([r.pads.ended.value, r.control.pads!.reading()]).toEqual(['IO', 0])
    r.control.pads!.unplug(RADIO.id)
    await pass(40)
    r.control.pads!.plug(RADIO)
    await pass(60)
    expect([r.pads.ended.value, r.control.pads!.reading()]).toEqual([null, 1])
  })
})
