// The RC control when things overlap: an older control that is answered late, a backend that says something other than the page
// knows, the vehicle's facts that change under it, and a frame that is not answered yet.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { type BackendClient, BackendError, type Subscription } from '@/backend/client'
import { TX16S } from '@/testing/fakeGamepads'
import { vehicleFacts } from '@/testing/rcProfiles'
import { type RcRig, flying, rcRig, settle } from '@/testing/rcRig'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

/** The `ready` of a subscription that the test settles itself. */
interface Held {
  resolve: () => void
  reject: (error: unknown) => void
}

/**
 * A client whose subscriptions are ready (or refused) only when the test says.
 *
 * @param held where each subscription's `ready` is kept, in order
 * @returns what wraps the real client
 */
function holding(held: Held[]): (client: BackendClient) => BackendClient {
  return client => ({
    ...client,
    subscribe: ((topic, params, onValue, onEnd) => {
      const real = client.subscribe(topic, params, onValue, onEnd)
      const later = new Promise<void>((resolve, reject) => {
        held.push({ resolve, reject })
      })

      return { ready: later, stop: real.stop } satisfies Subscription
    }) as BackendClient['subscribe'],
  })
}

/**
 * A client that does not answer `rc.input` until the test says.
 *
 * @param answers where each frame's answer is kept (its length is how many frames were given)
 * @returns what wraps the real client
 */
function silent(answers: (() => void)[]): (client: BackendClient) => BackendClient {
  return client => ({
    ...client,
    call: ((method, payload) => {
      if (method !== 'rc.input') {
        return client.call(method, payload)
      }

      return new Promise<null>(resolve => {
        answers.push(() => resolve(null))
      })
    }) as BackendClient['call'],
  })
}

/**
 * A rig whose pad is up and whose control is not begun.
 *
 * @param wrap what wraps the client
 * @returns the rig
 */
async function padUp(wrap?: (client: BackendClient) => BackendClient): Promise<RcRig> {
  const r = await rcRig({ wrap })

  r.pads.connect(TX16S)
  r.pads.set([0, 0, -1, 0])
  r.pads.advance(20)

  return r
}

describe('an older control', () => {
  it('says nothing to the one that runs now: its refusal, after it was turned off and on again, ends nothing', async () => {
    const held: Held[] = []
    const r = await padUp(holding(held))

    const first = r.rc.enable()
    await settle()
    r.rc.disable()
    const second = r.rc.enable()
    await settle()
    held[1]!.resolve()
    held[0]!.reject(new BackendError('BUSY', 'busy'))
    await Promise.all([first, second])
    await settle()

    expect([r.rc.state.value, r.rc.why.value, r.told]).toEqual(['on', null, []])
    expect(r.control.rc!.on()).toBe(true)
    r.stop()
  })
})

describe('a control the page ends', () => {
  it('is stopped by the page that ended it, whoever asked', async () => {
    const held: Held[] = []
    const r = await padUp(holding(held))

    void r.rc.enable()
    await settle()
    held[0]!.resolve()
    await settle()
    r.rc.disable()
    await settle()

    expect([r.rc.state.value, r.control.rc!.released()]).toEqual(['off', 1])
  })
})

describe('what the backend says of the throttle', () => {
  it('is compared with what the page knows: another channel or minimum ends the control', async () => {
    const r = await rcRig()

    r.control.rc!.throttle(3, 1000)
    const after = await flying(r)

    expect([after.rc.state.value, after.rc.why.value]).toEqual(['off', 'PARAMS_CHANGED'])
    expect(after.control.rc!.released()).toBe(1)
  })
})

describe('the vehicle\'s facts that change after the start', () => {
  const CHANGED: [string, (r: RcRig) => void][] = [
    ['a function of a channel', r => void (r.facts.value = vehicleFacts({ 9: 153 }))],
    ['the other way round', r => void (r.facts.value = vehicleFacts({ 3: 7 }))],
  ]

  it.each(CHANGED)('ends it: %s', async (_name, change) => {
    const r = await flying(await rcRig())

    change(r)
    await settle()

    expect([r.rc.state.value, r.rc.why.value, r.control.rc!.released()]).toEqual(['off', 'PARAMS_CHANGED', 1])
  })

  it('does not end it when the facts come again as they were', async () => {
    const r = await flying(await rcRig())

    r.facts.value = vehicleFacts()
    await settle()

    expect(r.rc.state.value).toBe('on')
    r.stop()
  })
})

describe('the frames', () => {
  it('are sent one at a time: a read that comes while the last is not answered is left, not queued', async () => {
    const answers: (() => void)[] = []
    const r = await flying(await padUp(silent(answers)))

    r.pads.advance(400)
    await settle()
    expect(answers).toHaveLength(1)
    answers[0]!()
    await settle()
    r.pads.advance(100)
    await settle()
    expect(answers.length).toBeGreaterThanOrEqual(2)
    expect(answers.length).toBeLessThanOrEqual(3)
    r.stop()
  })
})

describe('why it is off', () => {
  it('is kept in words for the screen after a refusal, an end by the backend, and a summary that was not confirmed', async () => {
    const refused = await rcRig({ allowed: false })
    const declined = await rcRig()
    const ended = await flying(await rcRig())

    await refused.rc.enable()
    declined.pads.connect(TX16S)
    declined.pads.advance(20)
    await declined.rc.turnOn(() => Promise.resolve(false))
    ended.control.rc!.end('SILENT')
    await settle()

    expect([refused, declined, ended].map(r => r.rc.explanation.value)).toEqual(['off', 'DECLINED', 'SILENT'])
    expect([refused, declined, ended].map(r => r.rc.state.value)).toEqual(['off', 'off', 'off'])
  })
})

describe('a summary that is answered no after the control went on', () => {
  it('is not DECLINED when another turn-on went through meanwhile (the control is on)', async () => {
    const r = await rcRig()
    let answer: (yes: boolean) => void = () => undefined

    r.pads.connect(TX16S)
    r.pads.advance(20)
    const first = r.rc.turnOn(() => new Promise<boolean>(resolve => {
      answer = resolve
    }))

    await r.rc.enable()
    await settle()
    answer(false)
    await first

    expect([r.rc.state.value, r.rc.why.value]).toEqual(['on', null])
    r.stop()
  })
})

describe('a refusal and the line of the Fly switch', () => {
  it('is a toast when no line shows it, none when one does; the end of a flying control is a toast either way', async () => {
    const hidden = await rcRig({ allowed: false })
    const shown = await rcRig({ allowed: false })
    const flying1 = await flying(await rcRig())

    shown.rc.reasonShown(true)
    await hidden.rc.enable()
    await shown.rc.enable()
    flying1.rc.reasonShown(true)
    flying1.control.rc!.end('SILENT')
    await settle()

    expect([hidden.told, shown.told, flying1.told]).toEqual([['off'], [], ['SILENT']])
    expect([hidden, shown].map(r => r.rc.explanation.value)).toEqual(['off', 'off'])
    shown.rc.reasonShown(false)
    await shown.rc.enable()
    expect(shown.told).toEqual(['off'])
  })
})

describe('a request that the page does not know', () => {
  it('is left to the backend while the vehicle is connected: the switch is not blocked and the control begins', async () => {
    const r = await rcRig()

    r.request.value = null
    expect(r.rc.block.value).toBeNull()
    await flying(r)

    expect(r.rc.state.value).toBe('on')
    r.stop()
  })
})

describe('a request that the page does not know, or knows is not a simulator', () => {
  it('is no link when nothing is connected, and a request that is known and is not a simulator is always one', async () => {
    const off = await rcRig()
    const serial = await rcRig()

    off.request.value = null
    off.connection.value = { state: 'disconnected' }
    serial.request.value = { transport: 'serial', device: '/dev/ttyUSB0' }

    expect([off.rc.block.value, serial.rc.block.value]).toEqual(['link', 'link'])
  })

  it('ends nothing that is on when the request becomes unknown (it is the backend that decides, and it did)', async () => {
    const r = await flying(await rcRig())

    r.request.value = null
    await settle()

    expect(r.rc.state.value).toBe('on')
    r.stop()
  })
})

describe('why it is not off', () => {
  it('is nothing while it is on, and nothing when the person turned it off', async () => {
    const r = await flying(await rcRig())

    expect(r.rc.explanation.value).toBeNull()
    r.rc.disable()
    expect([r.rc.why.value, r.rc.explanation.value]).toEqual(['RELEASED', null])
  })

  it('is said when the subscription cannot even be asked for: never left starting, never off with nothing said', async () => {
    const wrap = (client: BackendClient): BackendClient => ({
      ...client,
      subscribe: (() => {
        throw new Error('the link is down')
      }) as BackendClient['subscribe'],
    })
    const r = await padUp(wrap)

    await r.rc.enable()

    expect([r.rc.state.value, r.rc.why.value, r.told]).toEqual(['off', 'ERROR', ['ERROR']])
    expect(r.rc.explanation.value).toBe('ERROR')
  })
})
