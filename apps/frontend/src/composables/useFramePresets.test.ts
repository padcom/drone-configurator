import { expect, it, vi } from 'vitest'
import { shallowRef } from 'vue'
import { BackendError, type BackendClient } from '@/backend/client'
import type { Connection } from '@/generated/app'
import { armedOf } from '@/lib/app/armed'
import { type MockControl, type MockOptions, mockBackend } from '@/mock/mock-backend'
import { PARAMS, VEHICLE } from '@/mock/fixtures'
import { createConfigurator } from './useConfigurator'
import { useFramePresets } from './useFramePresets'

// The presets are the mock backend's (mock/mock-presets.ts), made up: ArduPilot's own are GPL and never part of the repository.

/**
 * A connected simulator, disarmed, with its parameters downloaded and every question answered yes.
 *
 * @param options how the mock backend answers
 * @returns the composables, the mock's controls and the questions asked
 */
async function connected(options: MockOptions = {}) {
  const questions: string[] = []
  const control: MockControl = {}
  const handle = createConfigurator(mockBackend({ telemetryMs: 5, control, ...options }), question => {
    questions.push(question)

    return Promise.resolve(true)
  })
  control.armed?.(false)
  await handle.vehicle.connect({ transport: 'simulator' })
  const state = () => [handle.parameters.list.value, armedOf(handle.vehicle.telemetry.value)]
  await vi.waitFor(() => expect(state()).toEqual(['complete', false]))

  return { ...handle, questions, control }
}

/**
 * A call's answer: a promise of it, or of its error.
 *
 * @param answer what it resolves to, or the error it rejects with
 * @returns the promise
 */
const answerOf = (answer: unknown) => (answer instanceof Error ? Promise.reject(answer) : Promise.resolve(answer))

/**
 * The presets on a client whose calls answer as given, for a disarmed or an armed vehicle.
 *
 * @param answers what each method resolves to, or the error it rejects with
 * @param armed whether the vehicle may be armed
 * @returns the presets, the review's spy and the client's
 */
function onClient(answers: Record<string, unknown>, armed = false) {
  const call = vi.fn((method: string) => answerOf(answers[method]))
  const show = vi.fn()
  const connection = shallowRef<Connection>({ state: 'connected', vehicle: { ...VEHICLE } })
  const presets = useFramePresets({
    client: { call } as unknown as BackendClient,
    params: shallowRef(PARAMS),
    connection,
    metadata: () => new Map(),
    snapshots: { show },
    mayBeArmed: () => armed,
  })

  return { presets, show, call }
}

const LIST = {
  vehicle: 'copter', ref: 'Copter-4.7.3', pinned: true, presets: [{ path: 'A.param', size: 10 }], fromCache: false, stale: false,
  fetchedAt: 1,
}

/**
 * The answer of `presets.fetch` for the one preset of `LIST`.
 *
 * @param text its text
 * @returns the answer
 */
const fileOf = (text: string) => ({ ref: 'Copter-4.7.3', path: 'A.param', text, fromCache: false })

/**
 * The list's reference and paths.
 *
 * @param handle the Configurator
 * @returns them
 */
const listed = (handle: Handle) => ({
  ref: handle.presets.list.value?.ref,
  paths: handle.presets.list.value?.presets.map(entry => entry.path),
})

/**
 * The selected preset's text.
 *
 * @param handle the Configurator
 * @returns it, or undefined
 */
const textOf = (handle: Handle) => handle.presets.preset.value?.text

/**
 * The review's source and its changes, as `[id, from, to]`.
 *
 * @param handle the Configurator
 * @returns them
 */
const underReview = (handle: Handle) => ({
  source: handle.fields.importReview.value?.source,
  changes: handle.fields.importReview.value?.changes.map(change => [change.id, change.from, change.to]),
})

type Handle = Awaited<ReturnType<typeof connected>>

const capacity = (handle: Awaited<ReturnType<typeof connected>>) => handle.fields.params.value
  .find(param => param.id === 'BATT_CAPACITY')?.value

it('lists the presets, shows one, and puts what it would change under review, ticked, writing nothing yet', async () => {
  const handle = await connected()
  const { presets, fields } = handle

  await presets.show()

  expect(presets.open.value).toBe(true)
  expect(listed(handle)).toEqual({
    ref: 'master',
    paths: ['Mock-Quad-Long-Range.param', 'Mock-Quad-Racer.param', 'Boats/Mock-Boat.parm'],
  })
  await presets.select('Mock-Quad-Racer.param')
  expect(textOf(handle)).toContain('LOIT_SPEED,2000')
  expect(presets.canReview()).toBe(true)

  presets.review()

  expect(presets.open.value).toBe(false)
  const { source, changes } = underReview(handle)
  expect(source).toEqual({ kind: 'preset', ref: 'master', path: 'Mock-Quad-Racer.param' })
  expect(changes).toEqual([
    ['BATT_CAPACITY', 5200, 1300], ['LOIT_SPEED', 1250, 2000], ['PILOT_SPEED_UP', 250, 500], ['NOT_ON_VEHICLE', null, 1],
  ])
  // Every change that can be made is ticked; the one the vehicle has not is shown, and cannot be.
  expect(fields.picked.value).toEqual(['BATT_CAPACITY', 'LOIT_SPEED', 'PILOT_SPEED_UP'])
  expect(capacity(handle)).toBe(5200)
})

it('writes a preset after the review\'s confirmation, guarded, and reads each value back', async () => {
  const handle = await connected()
  await handle.presets.show()
  await handle.presets.select('Mock-Quad-Long-Range.param')
  handle.presets.review()

  await handle.snapshots.apply()

  expect(handle.questions).toEqual(['Write 3 parameters to the vehicle (BATT_CAPACITY, WPNAV_SPEED, RTL_ALT)?'])
  expect(handle.fields.applied.value.map(line => [line.id, line.outcome])).toEqual([
    ['BATT_CAPACITY', 'verified'], ['WPNAV_SPEED', 'verified'], ['RTL_ALT', 'verified'],
  ])
  expect(capacity(handle)).toBe(8000)
})

it('does not put a preset under review while the vehicle may be armed, and the review writes nothing then', async () => {
  const handle = await connected()
  const { presets, fields, control, snapshots } = handle
  await presets.show()
  await presets.select('Mock-Quad-Long-Range.param')
  control.armed?.(true)
  await vi.waitFor(() => expect(armedOf(fields.telemetry.value)).toBe(true))

  expect(presets.canReview()).toBe(false)
  presets.review()
  expect(fields.importReview.value).toBeNull()
  expect(presets.open.value).toBe(true)

  // Armed between the review and the write: nothing is written.
  control.armed?.(false)
  await vi.waitFor(() => expect(armedOf(fields.telemetry.value)).toBe(false))
  presets.review()
  control.armed?.(true)
  await vi.waitFor(() => expect(armedOf(fields.telemetry.value)).toBe(true))
  await snapshots.apply()
  expect(fields.applied.value).toEqual([])
  expect(capacity(handle)).toBe(5200)
})

it('says when GitHub refuses, and until when', async () => {
  const { presets } = await connected({ presets: { listFails: 'RATE_LIMITED', retryAt: '1900000000' } })

  await presets.show()

  expect(presets.list.value).toBeNull()
  expect(presets.error.value).toMatch(/^GitHub refuses more requests from this computer until .+\. Try again then\.$/u)
  expect(presets.loading.value).toBe(false)
})

it('says why a preset could not be had, and only for the one still selected', async () => {
  const { presets } = onClient({ 'presets.list': LIST, 'presets.fetch': new BackendError('UNAVAILABLE', 'no answer') })
  await presets.show()

  await presets.select('A.param')

  expect(presets.preset.value).toBeNull()
  expect(presets.presetError.value).toBe(
    'Couldn\'t download from ArduPilot\'s GitHub: no answer. Check the internet connection and try again.',
  )
  expect(presets.canReview()).toBe(false)
  await presets.select(null)
  expect(presets.presetError.value).toBeNull()
})

it('asks GitHub again on refresh, and forgets a selection the new list has not', async () => {
  const { presets, call } = onClient({ 'presets.list': LIST, 'presets.fetch': fileOf('X,1\n') })
  await presets.show()
  await presets.select('A.param')
  expect(presets.preset.value?.text).toBe('X,1\n')

  await presets.refresh()

  expect(call).toHaveBeenLastCalledWith('presets.list', { refresh: true })
  expect(presets.selected.value).toBe('A.param')
  call.mockImplementation(() => Promise.resolve({ ...LIST, ref: 'master', pinned: false }))
  await presets.refresh()
  expect(presets.selected.value).toBeNull()
  expect(presets.preset.value).toBeNull()
})

it('puts nothing under review for a preset without parameter lines, and says so', async () => {
  const { presets, show } = onClient({ 'presets.list': LIST, 'presets.fetch': fileOf('# x\n') })
  await presets.show()
  await presets.select('A.param')

  presets.review()

  expect(show).not.toHaveBeenCalled()
  expect(presets.presetError.value).toMatch(/no parameter lines/u)
})

it('lets nothing go to the review while the vehicle may be armed', async () => {
  const { presets, show } = onClient({ 'presets.list': LIST, 'presets.fetch': fileOf('RTL_ALT,1\n') }, true)
  await presets.show()
  await presets.select('A.param')

  presets.review()

  expect(show).not.toHaveBeenCalled()
})

it('loads ArduPilot\'s renames with a preset, and reviews it with them', async () => {
  const ready = vi.fn(() => Promise.resolve())
  const now = vi.fn(() => undefined)
  const show = vi.fn()
  const answers: Record<string, unknown> = { 'presets.list': LIST, 'presets.fetch': fileOf('RTL_ALT,1\n') }
  const presets = useFramePresets({
    client: { call: (method: string) => answerOf(answers[method]) } as unknown as BackendClient,
    params: shallowRef(PARAMS),
    connection: shallowRef<Connection>({ state: 'connected', vehicle: { ...VEHICLE } }),
    metadata: () => new Map(),
    snapshots: { show },
    mayBeArmed: () => false,
    renames: { ready, now },
  })
  await presets.show()
  await presets.select('A.param')

  presets.review()

  expect(ready).toHaveBeenCalledOnce()
  expect(now).toHaveBeenCalled()
  expect(show).toHaveBeenCalledOnce()
})
