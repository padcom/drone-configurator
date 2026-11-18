// The pads of the mock backend on their own: what the real one (apps/backend/pad.pi) says to the page.
import { afterEach, expect, it, vi } from 'vitest'
import type { Envelope } from '@pico-desktop/protocol'
import type { PadList, PadSample } from '@/generated/app'
import { MockPads, type MockPadSpec } from './mock-pad'

const RADIO: MockPadSpec = { id: '1209:4f54', name: 'Radio', axes: 8, buttons: 24 }
const SMALL: MockPadSpec = { id: '045e:028e', name: 'Small', axes: 2, buttons: 4 }

/**
 * Mock pads, with what they sent collected.
 *
 * @returns them, the control and what they said
 */
function padsOf() {
  const sent: Omit<Envelope, 'v'>[] = []
  const pads = new MockPads(e => sent.push(e))

  return { pads, control: pads.control(), sent }
}

/**
 * What a kind of event said, in order.
 *
 * @param sent what the mock sent
 * @param name the topic
 * @returns the payloads
 */
function eventsOf<T>(sent: Omit<Envelope, 'v'>[], name: string): T[] {
  return sent.filter(e => e.k === 'event' && e.n === name).map(e => e.p as T)
}

afterEach(() => {
  vi.useRealTimers()
})

it('lists the pads that are plugged in as up to sixteen channels: the axes, then the buttons', () => {
  const run = padsOf()
  run.control.plug(RADIO)
  run.control.plug(SMALL)
  let list: PadList | null = null
  run.pads.listPads(p => { list = p })

  expect(list!.supported).toBe(true)
  expect(list!.pads.map(p => p.channels.length)).toEqual([16, 6])
  expect(list!.pads[0]!.channels.map(c => c.from).join()).toBe(`${'axis,'.repeat(8)}${'button,'.repeat(7)}button`)
})

it('tells the list at once and again at every hot-plug, and a pad that may not be opened as denied', () => {
  const run = padsOf()
  run.pads.subscribeDevices({ v: 1, k: 'subscribe', id: 3, n: 'pad.devices' })
  run.control.plug(RADIO)
  run.control.deny(RADIO.id, true)
  run.control.deny(RADIO.id, false)
  run.control.unplug(RADIO.id)
  const lists = eventsOf<PadList>(run.sent, 'pad.devices')

  expect(lists.map(l => [l.pads.length, l.denied.length])).toEqual([[0, 0], [1, 0], [0, 1], [1, 0], [0, 0]])
  expect(lists[2]!.denied[0]!.code).toBe('PERMISSION_DENIED')
})

it('sends a sample every 20 ms with the values that were set, and which channels the pad has', () => {
  vi.useFakeTimers()
  const run = padsOf()
  run.control.plug(SMALL)
  run.control.set(SMALL.id, 1, 0.5)
  run.control.set(SMALL.id, 3, 1)
  run.pads.subscribeRead({ v: 1, k: 'subscribe', id: 4, n: 'pad.read', p: { id: SMALL.id } })
  vi.advanceTimersByTime(100)
  const samples = eventsOf<PadSample>(run.sent, 'pad.read')

  expect(samples.map(s => s.seq)).toEqual([0, 1, 2, 3, 4])
  expect(samples[0]!.channels.slice(0, 3)).toEqual([0.5, 0, 1])
  expect(samples[0]!.have).toBe(0b111111)
  expect(run.control.reading()).toBe(1)
})

it('ends a read with DISCONNECTED when the pad is unplugged, and stops sending', () => {
  vi.useFakeTimers()
  const run = padsOf()
  run.control.plug(SMALL)
  run.pads.subscribeRead({ v: 1, k: 'subscribe', id: 4, n: 'pad.read', p: { id: SMALL.id } })
  vi.advanceTimersByTime(40)
  run.control.unplug(SMALL.id)
  vi.advanceTimersByTime(100)

  expect(run.sent.find(e => e.k === 'unsubscribe')?.err?.code).toBe('DISCONNECTED')
  expect(eventsOf<PadSample>(run.sent, 'pad.read').length).toBe(2)
  expect(run.control.reading()).toBe(0)
})

it('refuses a read of a pad that is not there, one that is denied, no id, and any where there is no backend', () => {
  const run = padsOf()
  run.control.plug(SMALL)
  run.control.deny(SMALL.id, true)

  const read = (id: number, p: unknown) => {
    run.pads.subscribeRead({ v: 1, k: 'subscribe', id, n: 'pad.read', p: p as Envelope['p'] })
  }
  read(1, { id: 'nobody' })
  read(2, { id: SMALL.id })
  read(3, null)
  run.control.deny(SMALL.id, false)
  run.control.supported(false)
  read(4, { id: SMALL.id })

  expect(run.sent.filter(e => e.k === 'unsubscribe').map(e => [e.s, e.err?.code])).toEqual([
    [1, 'NOT_FOUND'], [2, 'PERMISSION_DENIED'], [3, 'INVALID_VALUE'], [4, 'UNSUPPORTED'],
  ])
})

it('says nothing is supported, with no pads, where there is no backend', () => {
  const run = padsOf()
  run.control.plug(RADIO)
  run.control.supported(false)
  let list: PadList | null = null
  run.pads.listPads(p => { list = p })

  expect([list!.supported, list!.pads.length, list!.denied.length]).toEqual([false, 0, 0])
})
