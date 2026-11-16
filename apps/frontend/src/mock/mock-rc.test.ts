// The RC control of the mock vehicle on its own: what the real backend (apps/backend/rc.pi) says to the page.
import { expect, it } from 'vitest'
import type { Envelope } from '@pico-desktop/protocol'
import type { RcInput } from '@/generated/app'
import { MockRc } from './mock-rc'

/**
 * A mock RC control, with what it sent and answered collected.
 *
 * @param armed what the armed state is
 * @param connected whether a vehicle is connected
 * @returns the control and what it said
 */
function rcOf(armed: boolean | null = false, connected = true) {
  const sent: Omit<Envelope, 'v'>[] = []
  const rc = new MockRc(e => sent.push(e), () => armed, () => connected)
  const answers: (string | null)[] = []
  const input = (p: RcInput | null) => rc.input(p, () => answers.push(null), code => answers.push(code))
  const subscribe = (id = 7) => rc.subscribe({ v: 1, k: 'subscribe', id, n: 'rc.control' })

  return { rc, sent, answers, input, subscribe }
}

/**
 * What the subscription ended with.
 *
 * @param sent what the mock sent
 * @returns the code of the end, or null when it ended with none or did not end
 */
function endedWith(sent: Omit<Envelope, 'v'>[]) {
  return sent.find(e => e.k === 'unsubscribe')?.err?.code ?? null
}

it('begins a control, says the throttle, and takes the frames that are new', () => {
  const run = rcOf()
  run.subscribe()
  run.input({ seq: 1, channels: [0, 0, 1500] })
  run.input({ seq: 1, channels: [0, 0, 1600] })
  run.input({ seq: 2, channels: [0, 0, 1700] })

  expect(run.sent.map(e => [e.k, e.n])).toEqual([['response', undefined], ['event', 'rc.control']])
  expect(run.sent[1]!.p).toEqual({ state: 'on', throttleChannel: 3, throttleMin: 1000 })
  expect(run.answers).toEqual([null, null, null])
  expect(run.rc.control().frames()).toEqual([{ seq: 1, channels: [0, 0, 1500] }, { seq: 2, channels: [0, 0, 1700] }])
})

it('raises a throttle under its minimum to it', () => {
  const run = rcOf()
  run.rc.control().throttle(3, 1100)
  run.subscribe()
  run.input({ seq: 1, channels: [0, 0, 900] })

  expect(run.rc.control().frames()).toEqual([{ seq: 1, channels: [0, 0, 1100] }])
})

it('refuses a frame out of range or too long, and one when no control is on', () => {
  const idle = rcOf()
  idle.input({ seq: 1, channels: [1500] })
  const run = rcOf()
  run.subscribe()
  run.input({ seq: 1, channels: [700] })
  run.input({ seq: 2, channels: Array.from({ length: 17 }, () => 1500) })

  expect(idle.answers).toEqual(['NOT_RUNNING'])
  expect(run.answers).toEqual(['INVALID_VALUE', 'INVALID_VALUE'])
  expect(run.rc.control().frames()).toEqual([])
})

it('refuses a control with no vehicle, an unknown armed state, a second one, and a vehicle that ignores or never lets go', () => {
  const none = rcOf(false, false)
  none.subscribe()
  const unknown = rcOf(null)
  unknown.subscribe()
  const second = rcOf()
  second.subscribe(7)
  second.subscribe(8)
  const zero = rcOf()
  zero.rc.control().overrideTime(0)
  zero.subscribe()
  const negative = rcOf()
  negative.rc.control().overrideTime(-1)
  negative.subscribe()

  expect(endedWith(none.sent)).toBe('NOT_CONNECTED')
  expect(endedWith(unknown.sent)).toBe('STATE_UNKNOWN')
  expect(endedWith(second.sent)).toBe('BUSY')
  expect(second.rc.control().on()).toBe(true)
  expect(endedWith(zero.sent)).toBe('OVERRIDE_DISABLED')
  expect(endedWith(negative.sent)).toBe('OVERRIDE_DISABLED')
})

it('refuses a control on a link that is not a simulator, and when the setting is not on in the backend', () => {
  const real = rcOf()
  real.rc.control().simulator(false)
  real.subscribe()
  const off = rcOf()
  off.rc.control().allowed(false)
  off.subscribe()

  expect(endedWith(real.sent)).toBe('NOT_SIMULATOR')
  expect(real.rc.control().on()).toBe(false)
  expect(endedWith(off.sent)).toBe('NOT_ALLOWED')
  expect(off.rc.control().on()).toBe(false)
})

it('ends when the page lets go, or when the backend ends it, telling why', () => {
  const run = rcOf()
  run.subscribe(7)
  run.rc.unsubscribe(7)
  const silent = rcOf()
  silent.subscribe()
  silent.input({ seq: 1, channels: [0, 0, 1500] })
  silent.rc.control().end('SILENT')

  expect(run.rc.control().on()).toBe(false)
  expect(run.rc.control().released()).toBe(1)
  expect(silent.rc.control().on()).toBe(false)
  expect(silent.sent.find(e => e.n === 'rc.control' && (e.p as { state: string }).state === 'released')!.p).toEqual({
    state: 'released', why: 'SILENT', sent: 1, clamped: 0, confirmed: true,
  })
})
