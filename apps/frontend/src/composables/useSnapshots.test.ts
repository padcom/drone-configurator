import { expect, it, vi } from 'vitest'
import { createBackendClient } from '@/backend/client'
import type { Param } from '@/generated/app'
import { armedOf } from '@/lib/app/armed'
import { type MockControl, mockBackend } from '@/mock/mock-backend'
import { createConfigurator } from './useConfigurator'
import { type SnapshotsModel, useSnapshots } from './useSnapshots'
import { createWriteLock } from './writeLock'

/**
 * A snapshot of the connected simulator's parameters with some values changed.
 *
 * @param snapshots the snapshots
 * @param changes the new values, by parameter id
 * @returns the snapshot's text
 */
function edited(snapshots: Pick<SnapshotsModel, 'snapshot'>, changes: Record<string, number>): string {
  const data = JSON.parse(snapshots.snapshot()) as { params: { id: string, value: number }[] }
  data.params = data.params.map(param => ({ ...param, value: changes[param.id] ?? param.value }))

  return JSON.stringify(data)
}

/**
 * A connected simulator, disarmed, with its parameters downloaded and every question answered with `answer`.
 *
 * @param answer what the user answers
 * @returns the composables, the mock's controls and the questions asked
 */
async function connected(answer = true) {
  const questions: string[] = []
  const control: MockControl = {}
  const handle = createConfigurator(mockBackend({ telemetryMs: 5, control }), question => {
    questions.push(question)

    return Promise.resolve(answer)
  })
  // The mock arms itself from its fourth sample unless told: a write from a review is refused while the vehicle may be armed.
  control.armed?.(false)
  await handle.vehicle.connect({ transport: 'simulator' })
  const state = () => [handle.parameters.list.value, armedOf(handle.vehicle.telemetry.value)]
  await vi.waitFor(() => expect(state()).toEqual(['complete', false]))

  return { ...handle, questions, control }
}

it('saves the parameters with the vehicle they are from', async () => {
  const { snapshots } = await connected()

  const data = JSON.parse(snapshots.snapshot()) as { vehicle: { type: string }, params: unknown[] }

  expect(data.vehicle.type).toBe('QUADROTOR')
  expect(data.params.length).toBeGreaterThan(0)
})

it('shows the changes of a snapshot for review with nothing ticked, and forgets the ticks of the one before', async () => {
  const { snapshots } = await connected()
  snapshots.load(edited(snapshots, { RTL_ALT: 2000 }))
  snapshots.toggle('RTL_ALT')
  expect(snapshots.picked.value).toEqual(['RTL_ALT'])

  snapshots.load(edited(snapshots, { WPNAV_SPEED: 800 }))

  expect(snapshots.picked.value).toEqual([])
  expect(snapshots.importReview.value?.changes.map(change => change.id)).toEqual(['WPNAV_SPEED'])
})

it('unticks a change that was ticked, and cannot tick one that cannot be applied', async () => {
  const { snapshots } = await connected()
  snapshots.load(edited(snapshots, { RTL_ALT: 2000, FENCE_ENABLE: 300 }))

  snapshots.toggle('RTL_ALT')
  snapshots.toggle('RTL_ALT')
  snapshots.toggle('FENCE_ENABLE')
  snapshots.toggle('NOT_IN_THE_SNAPSHOT')

  expect(snapshots.picked.value).toEqual([])
})

it('writes nothing, and keeps no backup, when the user does not confirm', async () => {
  const { snapshots, parameters, questions } = await connected(false)
  snapshots.load(edited(snapshots, { RTL_ALT: 2000 }))
  snapshots.toggle('RTL_ALT')

  await snapshots.apply()

  expect(questions).toHaveLength(1)
  expect(snapshots.backup.value).toBeNull()
  expect(snapshots.applied.value).toEqual([])
  expect(snapshots.applying.value).toBe(false)
  expect(parameters.params.value.find(param => param.id === 'RTL_ALT')?.value).toBe(1500)
})

it('writes nothing when no vehicle is connected', async () => {
  const questions: string[] = []
  const handle = createConfigurator(mockBackend(), question => {
    questions.push(question)

    return Promise.resolve(true)
  })
  handle.snapshots.picked.value = ['RTL_ALT']

  await handle.snapshots.apply()

  expect(questions).toEqual([])
  expect(handle.snapshots.applied.value).toEqual([])
})

it('writes nothing, and asks nothing, while the vehicle may be armed (nothing known counts as armed)', async () => {
  const { snapshots, parameters, fields, questions } = await connected()
  const added: Param = { id: 'LOG_BITMASK', index: 99, kind: 'int', type: 'INT32', value: 5 }
  parameters.params.value = [...parameters.params.value, added]
  snapshots.load(edited(snapshots, { LOG_BITMASK: 7, RTL_ALT: 2000 }))
  snapshots.toggle('LOG_BITMASK')
  snapshots.toggle('RTL_ALT')
  // The telemetry says nothing: the state is not known, and that counts as armed.
  fields.telemetry.value = null

  expect(snapshots.mayBeArmed()).toBe(true)
  await snapshots.apply()

  expect(questions).toEqual([])
  expect(snapshots.applied.value).toEqual([])
  expect(parameters.params.value.find(param => param.id === 'RTL_ALT')?.value).toBe(1500)
})

it('writes nothing when the vehicle arms while the question is up', async () => {
  const { snapshots, parameters, fields } = await connected()
  snapshots.load(edited(snapshots, { RTL_ALT: 2000 }))
  snapshots.toggle('RTL_ALT')
  const confirm = vi.fn(() => {
    fields.telemetry.value = null

    return Promise.resolve(true)
  })
  const armedLater = useSnapshots({
    client: createBackendClient(mockBackend()),
    fail: () => undefined,
    confirm,
    parameters,
    connection: fields.connection,
    mayBeArmed: () => armedOf(fields.telemetry.value) !== false,
  })
  armedLater.load(edited(snapshots, { RTL_ALT: 2000 }))
  armedLater.toggle('RTL_ALT')

  await armedLater.apply()

  expect(confirm).toHaveBeenCalledTimes(1)
  expect(armedLater.applied.value).toEqual([])
  expect(armedLater.backup.value).toBeNull()
})

it('loads a parameter file for review: the changes, the unknown names, and the notes of the file', async () => {
  const { snapshots } = await connected()
  snapshots.load('# from the field\r\nRTL_ALT,2000\r\nNOT_A_PARAM,1\r\nWPNAV_SPEED 500\r\nWPNAV_SPEED 800\r\nrubbish\r\n')

  const review = snapshots.importReview.value
  expect(review?.source).toEqual({ kind: 'file', format: 'param' })
  expect(review?.changes.map(change => [change.id, change.from, change.to, change.problem])).toEqual([
    ['RTL_ALT', 1500, 2000, null],
    ['NOT_A_PARAM', null, 1, 'not on this vehicle'],
    ['WPNAV_SPEED', 1000, 800, null],
  ])
  expect(review?.notes).toEqual([
    'WPNAV_SPEED is on lines 4, 5: the value on line 5 is used.',
    'Line 6 is not a parameter, left out: rubbish',
  ])
  expect(snapshots.picked.value).toEqual([])
})

it('writes the ticked changes of a parameter file with a read-back, guarded as a Setup write', async () => {
  const { snapshots, parameters, control } = await connected()
  snapshots.load('RTL_ALT 2000\nWPNAV_SPEED 800\n')
  snapshots.toggle('RTL_ALT')

  await snapshots.apply()

  expect(snapshots.applied.value).toEqual([{ id: 'RTL_ALT', outcome: 'verified', detail: '2000' }])
  expect(control.writesSent?.()).toEqual(['RTL_ALT'])
  expect(parameters.params.value.find(param => param.id === 'RTL_ALT')?.value).toBe(2000)
  expect(parameters.params.value.find(param => param.id === 'WPNAV_SPEED')?.value).toBe(1000)
})

it('says a text with no parameter lines is not a parameter file', async () => {
  const { snapshots } = await connected()

  snapshots.load('# only a comment\n\n')

  expect(snapshots.importReview.value).toBeNull()
  expect(snapshots.importError.value).toBe('Can\'t load it: no parameter lines in it (NAME,VALUE or NAME VALUE, one per line).')
})

it('saves the parameters as a parameter file in each format', async () => {
  const { snapshots } = await connected()

  expect(snapshots.paramFile('param')).toContain('\nRTL_ALT,1500\n')
  expect(snapshots.paramFile('parm')).toContain('\nRTL_ALT          1500\n')
  expect(snapshots.paramFile('qgc')).toContain('\n1\t1\tRTL_ALT\t1500\t')
})

it('opens a parameter file through the dialog for parameter files', async () => {
  const opens = [{ path: '/a/b.param', text: 'RTL_ALT,2000\n' }]
  const handle = createConfigurator(mockBackend({ opens }))
  await handle.snapshots.openFile()

  expect(handle.snapshots.importReview.value?.source).toEqual({ kind: 'file', format: 'param' })
})

it('closes the review and forgets its ticks and results', async () => {
  const { snapshots } = await connected()
  snapshots.load(edited(snapshots, { RTL_ALT: 2000 }))
  snapshots.toggle('RTL_ALT')
  await snapshots.apply()
  expect(snapshots.applied.value).toHaveLength(1)

  snapshots.close()

  expect(snapshots.importReview.value).toBeNull()
  expect(snapshots.importError.value).toBeNull()
  expect(snapshots.picked.value).toEqual([])
  expect(snapshots.applied.value).toEqual([])
})

it('reports a file the dialog could not save, and says nothing was saved', async () => {
  const failures: (string | null)[] = []
  const client = createBackendClient(mockBackend())
  const params = { params: { value: [] }, replace: () => undefined, lock: createWriteLock() } as never
  const snapshots = useSnapshots({
    client,
    fail: message => failures.push(message),
    confirm: () => Promise.resolve(true),
    parameters: params,
    connection: { value: { state: 'disconnected' } } as never,
  })
  vi.spyOn(client, 'call').mockRejectedValue(new Error('disk full'))

  const path = await snapshots.saveFile('params.json', '{}')

  expect(path).toBeNull()
  expect(failures.at(-1)).toBe('Couldn\'t save: disk full')
})
