import { expect, it } from 'vitest'
import type { BackendClient } from './backend/client'
import type { VehicleMessage } from './generated/app'
import { useMessages } from './useMessages'

/**
 * A model on a client that only remembers who listens, so that a test can say messages itself.
 *
 * @returns the model and `say`, which gives a message to the subscription that has no replay
 */
function model() {
  const live: Array<(message: VehicleMessage) => void> = []
  const client = {
    subscribe: (_topic: string, params: { replay?: number }, onValue: (message: VehicleMessage) => void) => {
      if (params.replay === 0) {
        live.push(onValue)
      }

      return { ready: Promise.resolve(), stop: () => undefined }
    },
  } as unknown as BackendClient
  const messages = useMessages({ client, announce: () => undefined })
  messages.start()

  return { messages, say: (message: VehicleMessage) => live.at(-1)?.(message) }
}

/**
 * A failsafe message.
 *
 * @param id its number
 * @param time when it was sent
 * @returns the message
 */
const failsafe = (id: number, time: number): VehicleMessage => (
  { id, time, system: 1, component: 1, severity: 2, text: 'Battery failsafe', truncated: false }
)

it('tells a failsafe after a backend restart (ids start at 1) although one with id 40 was dismissed', () => {
  const { messages, say } = model()
  say(failsafe(40, 1000))
  messages.dismissFailsafe()

  messages.start()
  say(failsafe(3, 2000))

  expect(messages.failsafe.value?.id).toBe(3)
})

it('replaces a failsafe that is on screen with a later one that has a lower id', () => {
  const { messages, say } = model()
  say(failsafe(40, 1000))

  say(failsafe(3, 2000))

  expect(messages.failsafe.value?.id).toBe(3)
})

it('does not tell a failsafe that is older than the one on screen or the one dismissed, whatever its id', () => {
  const { messages, say } = model()
  say(failsafe(5, 2000))
  say(failsafe(6, 1500))
  expect(messages.failsafe.value?.id).toBe(5)

  messages.dismissFailsafe()
  say(failsafe(7, 1800))

  expect(messages.failsafe.value).toBeNull()
})
