// How a subscription fails or ends: refused by the backend, ended by it, stopped by the subscriber. A scripted
// publisher plays the backend, so the tests decide what it answers and when it ends the subscription.
import { memoryTransportPair } from '@pico-desktop/communicator'
import { type Envelope, decodeEnvelope, encodeEnvelope } from '@pico-desktop/protocol'
import { setTimeout as pause } from 'node:timers/promises'
import { expect, it, vi } from 'vitest'
import { effectScope } from 'vue'
import { type MockControl, mockBackend } from '@/mock/mock-backend'
import type { Connection, Param } from '@/generated/app'
import { BackendError, createBackendClient } from './client'

/** What the scripted backend sends. */
type Outgoing = Omit<Envelope, 'v'>

/**
 * Whether the client says hello (and waits for the backend to say it is ready).
 *
 * @param envelope what the client sent
 * @returns true for the hello
 */
const isHello = (envelope: Envelope) => envelope.k === 'lifecycle' && envelope.n === 'hello'

/**
 * What the scripted backend answers.
 *
 * @param received what the client sent
 * @param refuse true to answer every subscription with an error
 * @returns the answer, or undefined for what needs none
 */
function answerFor(received: Envelope, refuse: boolean): Outgoing | undefined {
  if (isHello(received)) {
    return { k: 'lifecycle', n: 'ready', e: 1 }
  }
  if (received.k !== 'subscribe') {
    return undefined
  }
  const id = received.id!

  return refuse
    ? { k: 'error', id, err: { code: 'REFUSED', message: 'no subscriptions today' } }
    : { k: 'response', id, s: id }
}

/**
 * A backend that accepts or refuses `vehicle.connection` subscriptions, and ends them when told.
 *
 * @param refuse true to answer every subscription with an error
 * @returns the transport for a client, and what the test can make the backend do
 */
function scriptedBackend(refuse: boolean) {
  const [app, backend] = memoryTransportPair()
  let subscription = 0
  const send = (envelope: Outgoing) => backend.send(encodeEnvelope(envelope))

  backend.connect(bytes => {
    const received = decodeEnvelope(bytes)
    const answer = answerFor(received, refuse)
    if (answer) {
      send(answer)
    }
    if (received.k === 'subscribe') {
      subscription = received.id!
    }
  })

  return {
    transport: app,
    publish: (value: Connection) => send({ k: 'event', n: 'vehicle.connection', s: subscription, p: value }),
    end(error?: { code: string, message: string }) {
      send({ k: 'unsubscribe', s: subscription, ...(error ? { err: error } : {}) })
    },
  }
}

it('rejects `ready` with a BackendError when the backend refuses the subscription', async () => {
  const client = createBackendClient(scriptedBackend(true).transport)
  const values: Connection[] = []

  const subscription = client.subscribe('vehicle.connection', null, value => values.push(value))

  await expect(subscription.ready).rejects.toBeInstanceOf(BackendError)
  await expect(subscription.ready).rejects.toMatchObject({ code: 'REFUSED', message: 'no subscriptions today' })
  expect(values).toEqual([])
})

it('rejects `ready` as well when stop() came before the refusal, and delivers nothing', async () => {
  const client = createBackendClient(scriptedBackend(true).transport)
  const values: Connection[] = []
  const ended = vi.fn()

  const subscription = client.subscribe('vehicle.connection', null, value => values.push(value), ended)
  subscription.stop()

  await expect(subscription.ready).rejects.toMatchObject({ code: 'REFUSED' })
  expect(values).toEqual([])
  expect(ended).not.toHaveBeenCalled()
})

it('tells onEnd, with a BackendError, when the backend ends the subscription with an error', async () => {
  const backend = scriptedBackend(false)
  const client = createBackendClient(backend.transport)
  const ended = vi.fn()
  const subscription = client.subscribe('vehicle.connection', null, () => undefined, ended)
  await subscription.ready

  backend.end({ code: 'GONE', message: 'the vehicle link was closed' })

  await vi.waitFor(() => expect(ended).toHaveBeenCalledTimes(1))
  expect(ended.mock.calls[0]?.[0]).toBeInstanceOf(BackendError)
  expect(ended.mock.calls[0]?.[0]).toMatchObject({ code: 'GONE', message: 'the vehicle link was closed' })
})

it('tells onEnd null when the backend ends the subscription without an error, and delivers nothing after', async () => {
  const backend = scriptedBackend(false)
  const client = createBackendClient(backend.transport)
  const values: Connection[] = []
  const ended = vi.fn()
  const subscription = client.subscribe('vehicle.connection', null, value => values.push(value), ended)
  await subscription.ready

  backend.publish({ state: 'connected' })
  backend.end()
  backend.publish({ state: 'lost' })

  await vi.waitFor(() => expect(ended).toHaveBeenCalledWith(null))
  await pause(20)
  expect(ended).toHaveBeenCalledTimes(1)
  expect(values).toEqual([{ state: 'connected' }])
})

it('does not tell onEnd about an end the subscriber asked for', async () => {
  const backend = scriptedBackend(false)
  const client = createBackendClient(backend.transport)
  const ended = vi.fn()
  const subscription = client.subscribe('vehicle.connection', null, () => undefined, ended)
  await subscription.ready

  subscription.stop()
  backend.end()
  await pause(20)

  expect(ended).not.toHaveBeenCalled()
})

it('ends an event listener with the effect scope it was made in', async () => {
  const control: MockControl = {}
  const client = createBackendClient(mockBackend({ control }))
  await client.call('vehicle.connect', { transport: 'simulator' })
  const heard: Param[] = []
  const scope = effectScope()
  scope.run(() => client.onEvent('params.changed', param => heard.push(param)))

  control.announce?.('RTL_ALT', 1700)
  await vi.waitFor(() => expect(heard).toHaveLength(1))
  scope.stop()
  control.announce?.('RTL_ALT', 1800)
  await pause(50)

  expect(heard).toHaveLength(1)
})

it('ends a state observer with the effect scope it was made in', async () => {
  const control: MockControl = {}
  const client = createBackendClient(mockBackend({ control }))
  const states: string[] = []
  const scope = effectScope()
  scope.run(() => client.onState(state => states.push(state)))
  await client.call('serial.ports', null)
  expect(states).toContain('ready')
  // A restart does produce states while the observer is there ...
  control.restart?.()
  await vi.waitFor(() => expect(states).toContain('restarting'))
  await vi.waitFor(() => expect(states.at(-1)).toBe('ready'))

  // ... and none once its scope has ended.
  scope.stop()
  const count = states.length
  control.restart?.()
  await pause(50)

  expect(states).toHaveLength(count)
})
