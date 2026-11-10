import { expect, it, vi } from 'vitest'
import { createBackendClient } from './backend/client'
import { mockBackend } from './mock-backend'
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
 * A connected simulator, with its parameters downloaded and every question answered with `answer`.
 *
 * @param answer what the user answers
 * @returns the composables and the questions asked
 */
async function connected(answer = true) {
  const questions: string[] = []
  const handle = createConfigurator(mockBackend(), question => {
    questions.push(question)

    return Promise.resolve(answer)
  })
  await handle.vehicle.connect({ transport: 'simulator' })
  await vi.waitFor(() => expect(handle.parameters.list.value).toBe('complete'))

  return { ...handle, questions }
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
