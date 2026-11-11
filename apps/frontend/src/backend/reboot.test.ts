// `vehicle.reboot` of the mock backend: the same contract as the Pico backend's (refusals send nothing, the command goes once,
// a vehicle that accepts goes `reconnecting` with the code REBOOTING and comes back resumed), checked with the contract's
// own validator.
import { expect, it, vi } from 'vitest'
import { type Connection, validateRebootResult } from '@/generated/app'
import { type MockControl, mockBackend } from '@/mock/mock-backend'
import { createBackendClient } from './client'

/**
 * A client of the mock backend with the simulated vehicle connected and disarmed.
 *
 * @returns the client and the mock's controls
 */
async function disarmed() {
  const control: MockControl = {}
  const client = createBackendClient(mockBackend({ control, rebootMs: 30 }))
  await client.call('vehicle.connect', { transport: 'simulator' })
  control.armed?.(false)

  return { client, control }
}

it('answers accepted with the contract\'s shape, sending the command once', async () => {
  const { client, control } = await disarmed()
  const answer = await client.call('vehicle.reboot', null)

  expect(validateRebootResult(answer)).toBeNull()
  expect(answer).toEqual({ result: 'accepted' })
  expect(control.rebootsSent?.()).toBe(1)
})

it.each([
  ['refused'], ['unsupported'], ['no-answer'],
] as const)('answers what the vehicle says: %s', async result => {
  const { client, control } = await disarmed()
  control.rebootAnswer?.(result)

  expect(await client.call('vehicle.reboot', null)).toEqual({ result })
  expect(control.rebootsSent?.()).toBe(1)
})

it('refuses without a connected vehicle, sending nothing', async () => {
  const control: MockControl = {}
  const client = createBackendClient(mockBackend({ control }))

  await expect(client.call('vehicle.reboot', null)).rejects.toMatchObject({ code: 'NOT_CONNECTED' })
  expect(control.rebootsSent?.()).toBe(0)
})

it.each([
  [true, 'ARMED'],
  [null, 'STATE_UNKNOWN'],
] as const)('refuses when the armed state is %s: %s, sending nothing', async (armed, code) => {
  const { client, control } = await disarmed()
  control.armed?.(armed)

  await expect(client.call('vehicle.reboot', null)).rejects.toMatchObject({ code })
  expect(control.rebootsSent?.()).toBe(0)
})

it('refuses while a parameter operation is under way: BUSY', async () => {
  const { client, control } = await disarmed()
  control.busy?.(true)

  await expect(client.call('vehicle.reboot', null)).rejects.toMatchObject({ code: 'BUSY' })
  expect(control.rebootsSent?.()).toBe(0)
})

it('goes reconnecting with the code REBOOTING, then connected and resumed, and refuses a second reboot meanwhile', async () => {
  const { client, control } = await disarmed()
  const seen: Connection[] = []
  const subscription = client.subscribe('vehicle.connection', null, c => seen.push(c))
  await subscription.ready
  await client.call('vehicle.reboot', null)

  await expect(client.call('vehicle.reboot', null)).rejects.toMatchObject({ code: 'BUSY' })
  await vi.waitFor(() => expect(seen.at(-1)).toMatchObject({ state: 'connected', resumed: true }))

  expect(seen.map(c => `${c.state} ${c.errorCode ?? ''}`)).toEqual(['connected ', 'reconnecting REBOOTING', 'connected '])
  expect(control.rebootsSent?.()).toBe(1)
  await subscription.stop()
})
