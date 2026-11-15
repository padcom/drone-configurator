// `vehicle.arm`, `disarm`, `setMode` and `prearm` of the mock backend: the same contract as the Pico backend's (a refusal sends
// nothing, each command goes once, the vehicle's own words come back with the answer, and what the vehicle IS afterwards is what
// its telemetry says), checked with the contract's own validator.
import { expect, it, vi } from 'vitest'
import { type ArmingResult, type Telemetry, validateArmingResult } from '@/generated/app'
import { type MockControl, mockBackend } from '@/mock/mock-backend'
import { createBackendClient } from './client'

/**
 * What a test sets and reads of the mock's arming service and of the vehicle's state.
 *
 * @param control the mock's controls
 * @returns the controls, as plain calls
 */
function armingOf(control: MockControl) {
  return {
    prearm: (texts: string[]) => control.arming?.prearm?.(texts),
    answer: (result: ArmingResult['result']) => control.arming?.answer?.(result),
    sent: () => control.arming?.sent?.() ?? [],
    armed: (state: boolean | null) => control.armed?.(state),
    busy: (busy: boolean) => control.busy?.(busy),
  }
}

/**
 * A client of the mock backend with the simulated vehicle connected and disarmed, and its telemetry.
 *
 * @returns the client, the mock's controls and the telemetry heard
 */
async function disarmed() {
  const control: MockControl = {}
  const client = createBackendClient(mockBackend({ control, telemetryMs: 10 }))
  await client.call('vehicle.connect', { transport: 'simulator' })
  const arming = armingOf(control)
  arming.armed(false)
  const heard: Telemetry[] = []
  await client.subscribe('telemetry.stream', {}, sample => heard.push(sample)).ready

  return { client, arming, heard }
}

it('arms once, with the contract\'s shape, and the telemetry then says armed', async () => {
  const { client, arming, heard } = await disarmed()
  const answer = await client.call('vehicle.arm', null)

  expect(validateArmingResult(answer)).toBeNull()
  expect(answer).toEqual({ result: 'accepted', messages: [] })
  expect(arming.sent()).toEqual(['arm'])
  await vi.waitFor(() => expect(heard.at(-1)?.armed).toBe(true))
})

it('refuses an arm with the vehicle\'s own words, and the vehicle stays disarmed', async () => {
  const { client, arming, heard } = await disarmed()
  arming.prearm(['Compasses inconsistent', 'GPS: Bad fix'])
  const answer = await client.call('vehicle.arm', null)

  expect(validateArmingResult(answer)).toBeNull()
  expect(answer).toMatchObject({
    result: 'refused', code: 4, messages: ['PreArm: Compasses inconsistent', 'PreArm: GPS: Bad fix'],
  })
  await vi.waitFor(() => expect(heard.length).toBeGreaterThan(2))
  expect(heard.at(-1)?.armed).toBe(false)
})

it('says no-answer when nothing answered, and the vehicle may have armed all the same: the telemetry says so', async () => {
  const { client, arming, heard } = await disarmed()
  arming.answer('no-answer')
  const answer = await client.call('vehicle.arm', null)

  expect(answer.result).toBe('no-answer')
  expect(arming.sent()).toEqual(['arm'])
  await vi.waitFor(() => expect(heard.at(-1)?.armed).toBe(true))
})

it('disarms an armed vehicle, and refuses a disarm of a disarmed one without sending it', async () => {
  const { client, arming } = await disarmed()
  await expect(client.call('vehicle.disarm', null)).rejects.toMatchObject({ code: 'NOT_ARMED' })
  arming.armed(true)

  expect(await client.call('vehicle.disarm', null)).toMatchObject({ result: 'accepted' })
  expect(arming.sent()).toEqual(['disarm'])
})

it.each([
  [true, 'ARMED'],
  [null, 'STATE_UNKNOWN'],
] as const)('refuses an arm when the armed state is %s: %s, sending nothing', async (armed, code) => {
  const { client, arming } = await disarmed()
  arming.armed(armed)

  await expect(client.call('vehicle.arm', null)).rejects.toMatchObject({ code })
  expect(arming.sent()).toEqual([])
})

it('refuses an arm while an operation is under way: BUSY', async () => {
  const { client, arming } = await disarmed()
  arming.busy(true)

  await expect(client.call('vehicle.arm', null)).rejects.toMatchObject({ code: 'BUSY' })
  expect(arming.sent()).toEqual([])
})

it('refuses everything without a connected vehicle', async () => {
  const control: MockControl = {}
  const client = createBackendClient(mockBackend({ control }))
  const arming = armingOf(control)

  for (const name of ['vehicle.arm', 'vehicle.disarm', 'vehicle.prearm'] as const) {
    // eslint-disable-next-line no-await-in-loop -- one after the other
    await expect(client.call(name, null)).rejects.toMatchObject({ code: 'NOT_CONNECTED' })
  }
  await expect(client.call('vehicle.setMode', { mode: 4 })).rejects.toMatchObject({ code: 'NOT_CONNECTED' })
  expect(arming.sent()).toEqual([])
})

it('changes the mode by its number, and the telemetry then says it; a number the kind does not have is refused', async () => {
  const { client, arming, heard } = await disarmed()

  expect(await client.call('vehicle.setMode', { mode: 4 })).toMatchObject({ result: 'accepted' })
  await vi.waitFor(() => expect(heard.at(-1)?.mode).toBe('GUIDED'))
  await expect(client.call('vehicle.setMode', { mode: 99 })).rejects.toMatchObject({ code: 'INVALID_VALUE' })
  expect(arming.sent()).toEqual(['mode 4'])
})

it('allows RTL and LAND when the state is not known, and nothing else', async () => {
  const { client, arming } = await disarmed()
  arming.armed(null)

  await expect(client.call('vehicle.setMode', { mode: 4 })).rejects.toMatchObject({ code: 'STATE_UNKNOWN' })
  expect(await client.call('vehicle.setMode', { mode: 6 })).toMatchObject({ result: 'accepted' })
  expect(await client.call('vehicle.setMode', { mode: 9 })).toMatchObject({ result: 'accepted' })
  expect(arming.sent()).toEqual(['mode 6', 'mode 9'])
})

it('runs the pre-arm checks: the answer is accepted, the reasons are the vehicle\'s words', async () => {
  const { client, arming } = await disarmed()
  arming.prearm(['RC not found'])

  expect(await client.call('vehicle.prearm', null)).toEqual({ result: 'accepted', messages: ['PreArm: RC not found'] })
  expect(arming.sent()).toEqual(['prearm'])
})
