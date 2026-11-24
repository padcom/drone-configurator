import { expect, it, vi } from 'vitest'
import { shallowRef } from 'vue'
import { BackendError, type BackendClient } from '@/backend/client'
import type { Connection } from '@/generated/app'
import { armedOf } from '@/lib/app/armed'
import { type MockControl, mockBackend } from '@/mock/mock-backend'
import { PARAMS, VEHICLE } from '@/mock/fixtures'
import { createConfigurator } from './useConfigurator'
import { useCompare } from './useCompare'

/**
 * A connected simulator, disarmed, with its parameters downloaded and every question answered yes.
 *
 * @returns the composables, the mock's controls and the questions asked
 */
async function connected() {
  const questions: string[] = []
  const control: MockControl = {}
  const handle = createConfigurator(mockBackend({ telemetryMs: 5, control }), question => {
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
 * The comparison on a client whose `params.defaults` answers with `answer`.
 *
 * @param answer what the call resolves to, or the error it rejects with
 * @returns the comparison and the review's spy
 */
function onClient(answer: unknown) {
  const call = vi.fn(() => (answer instanceof Error ? Promise.reject(answer) : Promise.resolve(answer)))
  const show = vi.fn()
  const connection = shallowRef<Connection>({ state: 'connected', vehicle: { ...VEHICLE } })
  const compare = useCompare({
    client: { call } as unknown as BackendClient,
    params: shallowRef(PARAMS),
    connection,
    metadata: () => new Map(),
    snapshots: { show },
  })

  return { compare, show, call }
}

type Handle = Awaited<ReturnType<typeof connected>>

/**
 * The value of one of the vehicle's parameters.
 *
 * @param handle the Configurator
 * @returns its value, or undefined
 */
const capacity = (handle: Handle) => handle.fields.params.value.find(param => param.id === 'BATT_CAPACITY')?.value

/**
 * The changes under review, as `[id, from, to]`.
 *
 * @param handle the Configurator
 * @returns them
 */
const underReview = (handle: Handle) => (handle.fields.importReview.value?.changes ?? []).map(c => [c.id, c.from, c.to])

/**
 * How a row of the comparison compares.
 *
 * @param handle the Configurator
 * @param id the row's parameter
 * @returns its status, or undefined
 */
const statusOf = (handle: Handle, id: string) => handle.compare.rows.value.find(row => row.id === id)?.status

it('compares with the firmware defaults and copies a row across to the review, ticked, writing nothing yet', async () => {
  const handle = await connected()
  const { compare, fields } = handle

  await compare.loadDefaults()

  expect(compare.side.value).toMatchObject({ source: { kind: 'defaults' } })
  const differing = compare.rows.value.filter(row => row.status === 'differs').map(row => row.id)
  expect(differing).toEqual(['BATT_CAPACITY', 'FENCE_RADIUS', 'WPNAV_SPEED'])
  compare.toggle('BATT_CAPACITY')
  compare.toggle('FENCE_RADIUS')
  compare.toggle('FENCE_RADIUS')
  expect(compare.picked.value).toEqual(['BATT_CAPACITY'])

  compare.review()

  expect(compare.open.value).toBe(false)
  expect(fields.importReview.value).toMatchObject({ source: { kind: 'defaults' } })
  expect(underReview(handle)).toEqual([['BATT_CAPACITY', 5200, 3300]])
  expect(fields.picked.value).toEqual(['BATT_CAPACITY'])
  expect(capacity(handle)).toBe(5200)
})

it('writes a row copied across after the review\'s confirmation, and reads it back', async () => {
  const handle = await connected()
  await handle.compare.loadDefaults()
  handle.compare.toggle('BATT_CAPACITY')
  handle.compare.review()

  await handle.snapshots.apply()

  expect(handle.questions).toHaveLength(1)
  expect(handle.fields.applied.value).toEqual([{ id: 'BATT_CAPACITY', outcome: 'verified', detail: '3300' }])
  expect(capacity(handle)).toBe(3300)
  await handle.compare.loadDefaults()
  expect(statusOf(handle, 'BATT_CAPACITY')).toBe('same')
})

it('writes nothing copied across while the vehicle may be armed', async () => {
  const { compare, snapshots, fields, control } = await connected()
  await compare.loadDefaults()
  compare.toggle('BATT_CAPACITY')
  compare.review()
  control.armed?.(true)
  await vi.waitFor(() => expect(armedOf(fields.telemetry.value)).toBe(true))

  await snapshots.apply()

  expect(fields.applied.value).toEqual([])
  expect(fields.params.value.find(param => param.id === 'BATT_CAPACITY')?.value).toBe(5200)
})

it('compares with a file that misses parameters and has some the vehicle lacks, and copies only what can be made', async () => {
  const { compare } = await connected()

  compare.loadText('RTL_ALT,2000\nNOT_A_PARAM,1\n')

  expect(compare.rows.value.find(row => row.id === 'NOT_A_PARAM')?.status).toBe('otherOnly')
  expect(compare.rows.value.find(row => row.id === 'BATT_CAPACITY')?.status).toBe('vehicleOnly')
  compare.toggle('NOT_A_PARAM')
  compare.toggle('BATT_CAPACITY')
  expect(compare.picked.value).toEqual([])
  compare.setFilter({ group: 'RTL' })
  expect(compare.filter.value).toEqual({ onlyDifferences: true, group: 'RTL', search: '' })
})

it('says why a file cannot be compared with, and starts again on the next', () => {
  const { compare } = onClient(null)

  compare.loadText('nothing here')

  expect(compare.error.value).toBe('Can\'t load it: no parameter lines in it (NAME,VALUE or NAME VALUE, one per line).')
  expect(compare.open.value).toBe(true)
  compare.loadText('RTL_ALT,1500\n')
  expect(compare.error.value).toBeNull()
  expect(compare.rows.value.filter(row => row.status === 'same').map(row => row.id)).toEqual(['RTL_ALT'])
})

it('says plainly that a vehicle without file transfer has no defaults to give, and any other failure as it came', async () => {
  const unsupported = onClient(new BackendError('UNSUPPORTED', 'no FTP'))
  await unsupported.compare.loadDefaults()
  expect(unsupported.compare.error.value).toContain('it has no MAVLink FTP')
  expect(unsupported.compare.loading.value).toBe(false)

  const timeout = onClient(new BackendError('FTP_TIMEOUT', 'no answer'))
  await timeout.compare.loadDefaults()
  expect(timeout.compare.error.value).toBe('Couldn\'t read the defaults: FTP_TIMEOUT: no answer')
})

it('opens a file through the host\'s dialog, and does nothing when the dialog is cancelled', async () => {
  const chosen = onClient({ text: 'RTL_ALT,2000\n' })
  await chosen.compare.openFile()
  expect(chosen.call).toHaveBeenCalledWith('files.openParams', null)
  expect(chosen.compare.rows.value.find(row => row.id === 'RTL_ALT')?.other).toBe(2000)

  const cancelled = onClient({})
  await cancelled.compare.openFile()
  expect(cancelled.compare.open.value).toBe(false)
})

it('puts nothing under review when nothing is copied across', () => {
  const { compare, show } = onClient(null)
  compare.loadText('RTL_ALT,2000\n')

  compare.review()

  expect(show).not.toHaveBeenCalled()
  expect(compare.open.value).toBe(true)
  compare.close()
  expect(compare.open.value).toBe(false)
})
