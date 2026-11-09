import { CommunicatorError } from '@pico-desktop/communicator'
import { setTimeout as pause } from 'node:timers/promises'
import { expect, it, vi } from 'vitest'
import { effectScope } from 'vue'
import { type MockControl, mockBackend } from '../mock-backend'
import type { Param, Telemetry } from '../generated/app'
import { BackendError, createBackendClient, toBackendError } from './client'

/**
 * A client of the mock backend, with the simulated vehicle connected and telemetry coming every few milliseconds.
 *
 * @returns the client
 */
async function connectedClient() {
  const client = createBackendClient(mockBackend({ telemetryMs: 5 }))
  await client.call('vehicle.connect', { transport: 'simulator' })

  return client
}

it('turns a failed call into a BackendError that keeps the code and the message', () => {
  const error = toBackendError(new CommunicatorError('TIMEOUT', 'no reply'))

  expect(error).toBeInstanceOf(BackendError)
  expect(error.code).toBe('TIMEOUT')
  expect(error.message).toBe('no reply')
  expect(error.cause).toBeInstanceOf(CommunicatorError)
})

it('makes a BackendError of anything else that is thrown, and leaves a BackendError alone', () => {
  expect(toBackendError(new Error('boom'))).toMatchObject({ code: 'unknown', message: 'boom' })
  expect(toBackendError('text')).toMatchObject({ code: 'unknown', message: 'text' })
  const own = new BackendError('X', 'y')

  expect(toBackendError(own)).toBe(own)
})

it('takes the method names and payloads from the contract: a wrong one does not compile', () => {
  const client = createBackendClient(mockBackend())
  const misuse = () => {
    // @ts-expect-error not a method of the contract
    void client.call('no.such.method', null)
    // @ts-expect-error params.write takes a ParamWrite, not null
    void client.call('params.write', null)
    // @ts-expect-error telemetry.stream is a subscription, not a method
    void client.call('telemetry.stream', null)
  }

  expect(typeof misuse).toBe('function')
})

it('answers a call with the backend\'s response', async () => {
  const client = createBackendClient(mockBackend())

  const { ports } = await client.call('serial.ports', null)

  expect(ports.length).toBeGreaterThan(0)
})

it('rejects a failed call with a BackendError that has the backend\'s code', async () => {
  const client = createBackendClient(mockBackend())

  // No vehicle is connected: the backend refuses the call.
  const error = await client.call('params.list', null).catch((caught: unknown) => caught)

  expect(error).toBeInstanceOf(BackendError)
  expect(error).toMatchObject({ code: 'NOT_CONNECTED', message: 'no vehicle is connected' })
})

it('delivers a subscription\'s values until it is stopped, and then no more', async () => {
  const client = await connectedClient()
  const values: Telemetry[] = []

  const subscription = client.subscribe('telemetry.stream', null, value => values.push(value))
  await subscription.ready
  await vi.waitFor(() => expect(values.length).toBeGreaterThan(1))
  subscription.stop()
  const count = values.length
  await pause(50)

  expect(values.length).toBe(count)
})

it('stops a subscription with the effect scope it was made in', async () => {
  const client = await connectedClient()
  const values: Telemetry[] = []
  const scope = effectScope()

  const subscription = scope.run(() => client.subscribe('telemetry.stream', null, value => values.push(value)))
  await subscription?.ready
  await vi.waitFor(() => expect(values.length).toBeGreaterThan(0))
  scope.stop()
  const count = values.length
  await pause(50)

  expect(values.length).toBe(count)
})

it('can stop a subscription before the backend has accepted it, and then it never delivers', async () => {
  const client = await connectedClient()
  const values: Telemetry[] = []

  const subscription = client.subscribe('telemetry.stream', null, value => values.push(value))
  subscription.stop()
  await subscription.ready
  await pause(50)

  expect(values).toEqual([])
})

it('passes on an event the backend sends, until it is stopped', async () => {
  const control: MockControl = {}
  const client = createBackendClient(mockBackend({ control }))
  const heard: Param[] = []
  await client.call('vehicle.connect', { transport: 'simulator' })
  const stop = client.onEvent('params.changed', param => heard.push(param))

  control.announce?.('RTL_ALT', 1700)
  await vi.waitFor(() => expect(heard.map(param => param.id)).toEqual(['RTL_ALT']))
  stop()
  control.announce?.('RTL_ALT', 1800)
  await pause(50)

  expect(heard).toHaveLength(1)
})

it('tells when the link to the backend is ready', async () => {
  const client = createBackendClient(mockBackend())
  const states: string[] = []

  const stop = client.onState(state => states.push(state))
  await client.call('serial.ports', null)
  stop()

  expect(states).toContain('ready')
})
