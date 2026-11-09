// The `vehicle.messages` subscription of the mock backend: the same contract as the Pico backend's (replay first, then
// live, ids that go up), checked with the contract's own validator.
import { expect, it, vi } from 'vitest'
import { SCRIPTED_MESSAGES } from '../fixtures'
import { type VehicleMessage, validateVehicleMessage } from '../generated/app'
import { type MockControl, mockBackend } from '../mock-backend'
import { createBackendClient } from './client'

/**
 * A client of the mock backend with the simulated vehicle connected.
 *
 * @returns the client and the mock's controls
 */
async function connectedClient() {
  const control: MockControl = {}
  const client = createBackendClient(mockBackend({ control }))
  await client.call('vehicle.connect', { transport: 'simulator' })

  return { client, control }
}

/**
 * Subscribes to the messages, asking for `replay` of the stored ones.
 *
 * @param client the client
 * @param replay how many to be replayed, or undefined for the default
 * @returns the messages as they arrive, and the subscription
 */
function listen(client: Awaited<ReturnType<typeof connectedClient>>['client'], replay?: number) {
  const messages: VehicleMessage[] = []
  const subscription = client.subscribe('vehicle.messages', replay === undefined ? {} : { replay }, m => messages.push(m))

  return { messages, subscription }
}

/**
 * The vehicle says `count` things, one after the other.
 *
 * @param control the mock's controls
 * @param count how many messages
 */
function sayMany(control: MockControl, count: number): void {
  for (let i = 0; i < count; i += 1) {
    control.say?.(6, `message ${i}`)
  }
}

it('replays the scripted messages first, oldest first, then the live ones', async () => {
  const { client, control } = await connectedClient()
  const { messages, subscription } = listen(client)
  await subscription.ready
  control.say?.(4, 'PreArm: Battery low')
  await vi.waitFor(() => expect(messages).toHaveLength(SCRIPTED_MESSAGES.length + 1))

  const scripted = SCRIPTED_MESSAGES.map(([severity, text]) => [severity, text])

  expect(messages.map(m => [m.severity, m.text])).toEqual([...scripted, [4, 'PreArm: Battery low']])
  expect(messages.map(m => m.id)).toEqual(messages.map((_m, i) => messages[0]!.id + i))
  subscription.stop()
})

it('sends messages that satisfy the contract', async () => {
  const { client } = await connectedClient()
  const { messages, subscription } = listen(client)
  await subscription.ready
  await vi.waitFor(() => expect(messages.length).toBeGreaterThan(0))

  expect(messages.map(validateVehicleMessage)).toEqual(messages.map(() => null))
  subscription.stop()
})

it('replays only the last `replay` stored messages', async () => {
  const { client } = await connectedClient()
  const { messages, subscription } = listen(client, 1)
  await subscription.ready
  await vi.waitFor(() => expect(messages).toHaveLength(1))

  expect(messages[0]?.text).toBe(SCRIPTED_MESSAGES.at(-1)?.[1])
  subscription.stop()
})

it('replays nothing for 0', async () => {
  const { client, control } = await connectedClient()
  const none = listen(client, 0)
  await none.subscription.ready
  control.say?.(6, 'live')
  await vi.waitFor(() => expect(none.messages.map(m => m.text)).toEqual(['live']))
  none.subscription.stop()
})

it('refuses to replay more than 200', async () => {
  const { client } = await connectedClient()

  await expect(listen(client, 201).subscription.ready).rejects.toThrow('replay is 0 to 200')
})

it('keeps the last 500 and replays the last 200 of them, with ids that keep going up', async () => {
  const { client, control } = await connectedClient()
  sayMany(control, 600)
  const { messages, subscription } = listen(client, 200)
  await subscription.ready
  await vi.waitFor(() => expect(messages).toHaveLength(200))

  expect(messages[0]?.text).toBe('message 400')
  expect(messages.at(-1)?.text).toBe('message 599')
  subscription.stop()
})
