// The motor test of the page against the mock backend: a test is a subscription, it begins only for a vehicle that is known to be
// disarmed, and it ENDS whichever way the page's hold ends (a release, a vehicle that is gone or not known, the backend ending
// it), and the backend is then told so (the subscription ends) so that it stops the motor. Each way has a test.
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createConfigurator } from '@/composables/useConfigurator'
import { HOLD_PING_MS, SETTLE_MS } from '@/lib/setup/motorTest'
import { SETUP_PARAMS, telemetryAt } from '@/mock/fixtures'
import { type MockControl, mockBackend } from '@/mock/mock-backend'
import { feed } from '@/testing/testing'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

/**
 * A connected simulated vehicle that is disarmed, and the motor test of its configurator.
 *
 * @param params the vehicle's parameters (a connection reads them again)
 * @returns the handle and the mock's controls
 */
async function rig(params = SETUP_PARAMS) {
  const control: MockControl = {}
  const backend = mockBackend({ telemetryMs: 600_000, params, control })
  const handle = createConfigurator(backend, () => Promise.resolve(true))
  control.armed?.(false)
  await handle.vehicle.connect({ transport: 'simulator' })
  feed(handle, { telemetry: { ...telemetryAt(0), armed: false } })
  await vi.advanceTimersByTimeAsync(50)

  return { handle, control, test: handle.motorTest, mock: control.motors! }
}

/**
 * Lets what is on its way arrive.
 *
 * @param ms how long to let time pass
 */
async function wait(ms = 20): Promise<void> {
  await vi.advanceTimersByTimeAsync(ms)
}

it('begins a test as a subscription, and ends it, and tells the backend, when the button is let go', async () => {
  const { test, mock } = await rig()
  test.start(2, 10)
  await wait()

  expect(test.motor.value).toBe(2)
  expect(mock.running()).toEqual({ motor: 2, throttle: 10 })
  test.release()
  await wait()
  expect(test.motor.value).toBeNull()
  expect(test.ended.value).toEqual({ motor: 2, why: 'RELEASED' })
  // the backend was told: the subscription ended there (it stops the motor), and nothing else is held
  expect(mock.running()).toBeNull()
  expect(mock.released()).toBe(1)
})

it('says "still held" every 250 ms while it runs, and no more after it ended', async () => {
  const { test, mock } = await rig()
  test.start(1, 5)
  await wait(HOLD_PING_MS * 4 + 10)
  expect(mock.holds()).toBe(4)
  test.release()
  await wait()
  const holds = mock.holds()
  await wait(HOLD_PING_MS * 4)
  expect(mock.holds()).toBe(holds)
})

it('holds the throttle to 20 percent, however much is asked', async () => {
  const { test, mock } = await rig()
  test.start(1, 99)
  await wait()

  expect(mock.running()?.throttle).toBe(20)
  test.release()
  await wait()
  test.release()
  await wait(SETTLE_MS + 10)
  test.start(1, -3)
  await wait()
  expect(mock.running()?.throttle).toBe(1)
})

it('runs one motor at a time: a second press while one spins does nothing', async () => {
  const { test, mock } = await rig()
  test.start(1, 5)
  await wait()
  test.start(2, 5)
  await wait()

  expect(test.motor.value).toBe(1)
  expect(mock.began()).toBe(1)
  expect(mock.running()?.motor).toBe(1)
})

it('waits for the vehicle to settle after a test before another begins', async () => {
  const { test, mock } = await rig()
  test.start(1, 5)
  await wait()
  test.release()
  await wait()
  test.start(2, 5)
  await wait()
  expect(mock.began()).toBe(1)
  expect(test.settling.value).toBe(true)

  await wait(SETTLE_MS + 10)
  expect(test.settling.value).toBe(false)
  test.start(2, 5)
  await wait()
  expect(mock.began()).toBe(2)
})

it('never begins for an armed vehicle, a vehicle whose state is not known, or none', async () => {
  const { handle, control, test, mock } = await rig()
  control.armed?.(true)
  feed(handle, { telemetry: { ...telemetryAt(0), armed: true } })
  test.start(1, 5)
  await wait()
  expect(test.block.value).toBe('armed')
  expect(mock.began()).toBe(0)

  // no recent heartbeat: it counts as armed
  feed(handle, { telemetry: { ...telemetryAt(0), armed: false, heartbeatAgeMs: 5000 } })
  test.start(1, 5)
  await wait()
  expect(test.block.value).toBe('unknown')
  feed(handle, { telemetry: null })
  test.start(1, 5)
  await wait()
  expect(test.block.value).toBe('unknown')

  control.connection?.({ state: 'disconnected' })
  await wait()
  expect(test.block.value).toBe('offline')
  test.start(1, 5)
  await wait()
  expect(mock.began()).toBe(0)
})

it('does not take the armed flag of its own test for a reason to stop, nor a heartbeat that is still fresh', async () => {
  const { handle, test, mock } = await rig()
  test.start(1, 5)
  await wait()
  // the vehicle arms its motors for the test, and says so
  feed(handle, { telemetry: { ...telemetryAt(0), armed: true } })
  await wait(HOLD_PING_MS * 2)

  expect(test.motor.value).toBe(1)
  expect(mock.running()).not.toBeNull()
  // after the test, that flag does not hold the next test up for ever: it is the vehicle's to clear
  test.release()
  await wait(SETTLE_MS + 10)
  expect(test.block.value).toBe('armed')
})

it('ends the test when the vehicle is no longer known to be disarmed, or the link is gone', async () => {
  const first = await rig()
  first.test.start(1, 5)
  await wait()
  // the heartbeat is lost: not known
  feed(first.handle, { telemetry: { ...telemetryAt(0), armed: true, heartbeatAgeMs: 4000 } })
  await wait()
  expect(first.test.motor.value).toBeNull()
  expect(first.mock.released()).toBe(1)
  expect(first.mock.running()).toBeNull()

  const second = await rig()
  second.test.start(3, 5)
  await wait()
  second.control.connection?.({ state: 'reconnecting', attempt: 1, nextRetryMs: 1000 })
  await wait()
  expect(second.test.motor.value).toBeNull()
  expect(second.mock.released()).toBe(1)
  expect(second.test.ended.value?.why).toBe('RELEASED')
})

it('ends the test when the backend ends it, and says why', async () => {
  const { test, mock } = await rig()
  test.start(4, 5)
  await wait()
  mock.end('LINK_LOST')
  await wait()

  expect(test.motor.value).toBeNull()
  expect(test.ended.value).toEqual({ motor: 4, why: 'LINK_LOST' })
  expect(mock.running()).toBeNull()
  // (no "still held" goes on to a test that is over)
  const holds = mock.holds()
  await wait(HOLD_PING_MS * 3)
  expect(mock.holds()).toBe(holds)
})

it('says why when the backend refuses the test, and nothing runs', async () => {
  const { handle, control, test, mock } = await rig()
  // the page's telemetry says disarmed, the vehicle (the backend) says armed: the backend's refusal is the last word
  control.armed?.(true)
  feed(handle, { telemetry: { ...telemetryAt(0), armed: false } })
  test.start(1, 5)
  await wait()

  expect(test.motor.value).toBeNull()
  expect(test.ended.value).toEqual({ motor: 1, why: 'ARMED' })
  expect(mock.running()).toBeNull()
})

it('forgets how the last test ended when another begins', async () => {
  const { test } = await rig()
  test.start(1, 5)
  await wait()
  test.release()
  await wait(SETTLE_MS + 10)
  expect(test.ended.value?.why).toBe('RELEASED')
  test.start(2, 5)
  await wait()

  expect(test.ended.value).toBeNull()
  test.release()
})

it('takes the frame the vehicle started with from the list, and offers no test once the frame differs from it', async () => {
  const { control, test, mock } = await rig()
  expect(test.booted.value).toEqual({ class: 1, type: 1 })
  expect(test.block.value).toBeNull()
  // the Frame page wrote a new type (read back at once): the vehicle still has the old order until it restarts
  control.announce?.('FRAME_TYPE', 0)
  await wait()
  expect(test.block.value).toBe('frame')
  test.start(1, 5)
  await wait()
  expect(mock.began()).toBe(0)
  // the frame the parameters say now does not make it the booted one
  expect(test.booted.value).toEqual({ class: 1, type: 1 })
})

it('does not know the frame the vehicle started with before it is connected and its list is complete', () => {
  const backend = mockBackend({ telemetryMs: 600_000, params: SETUP_PARAMS })
  const handle = createConfigurator(backend, () => Promise.resolve(true))

  expect(handle.motorTest.booted.value).toBeNull()
})

it('keeps the lock across a blip of the link after a frame was written and not restarted', async () => {
  const { control, test } = await rig()
  control.announce?.('FRAME_TYPE', 0)
  await wait()
  expect(test.block.value).toBe('frame')

  // the link goes quiet and comes back (no restart: nothing says "REBOOTING"); the list is read again
  control.connection?.({ state: 'reconnecting', attempt: 1, nextRetryMs: 1000 })
  await wait()
  expect(test.booted.value).toEqual({ class: 1, type: 1 })
  control.connection?.({ state: 'connected', resumed: true })
  await wait(200)

  expect(test.booted.value).toEqual({ class: 1, type: 1 })
  expect(test.block.value).toBe('frame')
})

it('keeps the lock when the user disconnects and connects again after a frame was written and not restarted', async () => {
  // (the vehicle's own parameters: a connection reads them again, and the frame written is in them now)
  const params = SETUP_PARAMS.map(param => ({ ...param }))
  const { handle, control, test } = await rig(params)
  control.connection?.({ state: 'disconnected' })
  await wait()
  expect(test.booted.value).toBeNull()
  const frameType = params.find(param => param.id === 'FRAME_TYPE')
  if (frameType) {
    frameType.value = 0
  }
  await handle.vehicle.connect({ transport: 'simulator' })
  feed(handle, { telemetry: { ...telemetryAt(0), armed: false } })
  await wait(300)

  // it is the vehicle that was seen to start with the old frame, and nothing says it restarted
  expect(test.booted.value).toEqual({ class: 1, type: 1 })
  expect(test.block.value).toBe('frame')
})

it('takes the new frame as the booted one when the restart is known: the app\'s own reboot completed', async () => {
  const { control, test } = await rig()
  control.announce?.('FRAME_TYPE', 0)
  await wait()
  expect(test.block.value).toBe('frame')

  control.connection?.({ state: 'reconnecting', errorCode: 'REBOOTING', attempt: 1, nextRetryMs: 1000 })
  await wait()
  control.connection?.({ state: 'connected', resumed: true })
  await wait(200)

  expect(test.booted.value).toEqual({ class: 1, type: 0 })
  expect(test.block.value).toBeNull()
})

it('forgets what was confirmed when the restart brings another frame', async () => {
  const { control, test } = await rig()
  test.start(1, 5)
  await wait()
  test.release()
  await wait()
  test.confirm(1, true)
  control.announce?.('FRAME_TYPE', 0)
  await wait()
  expect(test.confirmed.value).toEqual([1])
  control.connection?.({ state: 'reconnecting', errorCode: 'REBOOTING', attempt: 1, nextRetryMs: 1000 })
  await wait()
  control.connection?.({ state: 'connected', resumed: true })
  await wait(200)

  expect(test.confirmed.value).toEqual([])
  expect(test.tested.value).toEqual([])
})

it('keeps what was tested and confirmed for the connection only, and confirms only a motor that was tested', async () => {
  const { control, test } = await rig()
  test.confirm(2, true)
  expect(test.confirmed.value).toEqual([])
  test.start(2, 5)
  await wait()
  test.release()
  await wait()
  expect(test.tested.value).toEqual([2])
  test.confirm(2, true)
  expect(test.confirmed.value).toEqual([2])
  test.confirm(2, false)
  expect(test.confirmed.value).toEqual([])
  test.confirm(2, true)

  control.connection?.({ state: 'disconnected' })
  await wait()
  expect(test.tested.value).toEqual([])
  expect(test.confirmed.value).toEqual([])
})

it('is busy while a test runs and for a few seconds after, when the armed flag is the test\'s own', async () => {
  const { test } = await rig()
  expect(test.busy.value).toBe(false)
  test.start(1, 5)
  await wait()
  expect(test.busy.value).toBe(true)
  test.release()
  await wait()
  expect(test.busy.value).toBe(true)
  await wait(SETTLE_MS + 10)
  expect(test.busy.value).toBe(false)
})
