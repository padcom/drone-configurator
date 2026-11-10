import { expect, it, vi } from 'vitest'
import { createBackendClient } from './backend/client'
import { PARAMS } from './fixtures'
import { type MockOptions, mockBackend } from './mock-backend'
import { useParams } from './useParams'

/**
 * Parameters on the mock backend, with a vehicle connected or not, and what the rest of the interface would say.
 *
 * @param connected whether the simulated vehicle is connected
 * @param options how the mock vehicle behaves
 * @returns the parameters, the spies, and the failures they recorded
 */
async function rig(connected = true, options: MockOptions = {}) {
  const client = createBackendClient(mockBackend(options))
  if (connected) {
    await client.call('vehicle.connect', { transport: 'simulator' })
  }
  const failures: (string | null)[] = []
  const deps = {
    client,
    fail: (message: string | null) => failures.push(message),
    isConnected: () => connected,
    confirm: vi.fn().mockResolvedValue(true),
    problemWith: vi.fn((): string | null => null),
  }

  return { parameters: useParams(deps), deps, failures }
}

it('downloads the list, saying it is loading meanwhile', async () => {
  const { parameters } = await rig()

  const downloading = parameters.refresh()
  expect(parameters.list.value).toBe('loading')
  await downloading

  expect(parameters.list.value).toBe('complete')
  expect(parameters.params.value.map(p => p.id)).toEqual(PARAMS.map(p => p.id))
  expect(parameters.missing.value).toEqual([])
})

it('says the download failed, and why, when no vehicle is connected', async () => {
  const { parameters, failures } = await rig(false)

  await parameters.refresh()

  expect(parameters.list.value).toBe('failed')
  expect(failures.at(-1)).toBe('NOT_CONNECTED: no vehicle is connected')
})

it('selects a parameter and drafts its value; an unknown one clears the selection', async () => {
  const { parameters } = await rig()
  await parameters.refresh()

  parameters.select('RTL_ALT')
  expect(parameters.selected.value).toBe('RTL_ALT')
  expect(parameters.draft.value).toBe('1500')
  expect(parameters.selectedParam()?.id).toBe('RTL_ALT')

  parameters.select('NO_SUCH')
  expect(parameters.selected.value).toBeNull()
  expect(parameters.draft.value).toBe('')
})

it('forgets how the last write went when another parameter is selected, and when it is selected again', async () => {
  const { parameters } = await rig()
  await parameters.refresh()
  parameters.select('RTL_ALT')
  parameters.lastWrite.value = { kind: 'verified', id: 'RTL_ALT', value: 1600 }

  parameters.select('RTL_ALT')
  expect(parameters.lastWrite.value).not.toBeNull()
  parameters.select('BATT_CAPACITY')
  expect(parameters.lastWrite.value).toBeNull()
  parameters.select('RTL_ALT')
  expect(parameters.lastWrite.value).toBeNull()
})

it('narrows the list with the filter, case-insensitively', async () => {
  const { parameters } = await rig()
  await parameters.refresh()

  parameters.setFilter('batt')

  expect(parameters.visible().map(p => p.id)).toEqual(['BATT_CAPACITY', 'BATT_LOW_VOLT'])
})

it('keeps what was typed, and the problem with it, for the selected parameter', async () => {
  const { parameters, deps } = await rig()
  await parameters.refresh()
  parameters.select('RTL_ALT')
  deps.problemWith.mockReturnValue('a number, please')

  parameters.editDraft('abc')

  expect(parameters.draft.value).toBe('abc')
  expect(parameters.draftError.value).toBe('a number, please')
  expect(deps.problemWith).toHaveBeenCalledWith(expect.objectContaining({ id: 'RTL_ALT' }), 'abc')
})

it('writes after the user confirms, and the read-back decides the outcome', async () => {
  const { parameters, deps } = await rig()
  await parameters.refresh()
  parameters.select('RTL_ALT')
  parameters.editDraft('1600')

  await parameters.write()

  expect(deps.confirm).toHaveBeenCalledWith('Set RTL_ALT from 1500 to 1600?')
  expect(parameters.writing.value).toBe(false)
  expect(parameters.lastWrite.value).toEqual({ kind: 'verified', id: 'RTL_ALT', value: 1600 })
  expect(parameters.params.value.find(p => p.id === 'RTL_ALT')?.value).toBe(1600)
})

it('writes nothing when the user says no, when the draft is invalid, or when no vehicle is connected', async () => {
  const { parameters, deps } = await rig()
  await parameters.refresh()
  parameters.select('RTL_ALT')
  parameters.editDraft('1600')
  deps.confirm.mockResolvedValue(false)

  await parameters.write()
  expect(parameters.lastWrite.value).toBeNull()
  expect(parameters.writing.value).toBe(false)

  deps.confirm.mockClear()
  deps.problemWith.mockReturnValue('INT16 goes from -32768 to 32767')
  await parameters.write()
  expect(deps.confirm).not.toHaveBeenCalled()
  expect(parameters.draftError.value).toBe('INT16 goes from -32768 to 32767')

  const offline = await rig(false)
  offline.parameters.select('RTL_ALT')
  await offline.parameters.write()
  expect(offline.deps.confirm).not.toHaveBeenCalled()
})

it('reports a value the vehicle changed or refused, and a write that got no answer', async () => {
  const changed = await rig(true, { rounding: ['RTL_ALT'] })
  await changed.parameters.refresh()
  changed.parameters.select('RTL_ALT')
  changed.parameters.editDraft('1600.5')
  await changed.parameters.write()
  expect(changed.parameters.lastWrite.value).toMatchObject({ kind: 'changed', id: 'RTL_ALT', asked: 1600.5 })

  const silent = await rig(true, { silent: ['RTL_ALT'] })
  await silent.parameters.refresh()
  silent.parameters.select('RTL_ALT')
  silent.parameters.editDraft('1600')
  await silent.parameters.write()
  expect(silent.parameters.lastWrite.value).toMatchObject({ kind: 'failed', id: 'RTL_ALT' })
  expect(silent.parameters.writing.value).toBe(false)
})

it('follows a parameter the vehicle announces, and the draft too unless it is being edited', async () => {
  const { parameters } = await rig()
  await parameters.refresh()
  parameters.select('RTL_ALT')
  const announced = { ...parameters.selectedParam()!, value: 1700 }

  parameters.announced(announced)
  expect(parameters.params.value.find(p => p.id === 'RTL_ALT')?.value).toBe(1700)
  expect(parameters.draft.value).toBe('1700')

  parameters.editDraft('1800')
  parameters.announced({ ...announced, value: 1750 })
  expect(parameters.draft.value).toBe('1800')

  parameters.announced({ ...announced, id: 'NEW_ONE', index: 99 })
  expect(parameters.params.value.at(-1)?.id).toBe('NEW_ONE')
})

it('replaces a parameter by its newer self, and can stop a write that cannot finish any more', async () => {
  const { parameters } = await rig()
  await parameters.refresh()

  parameters.replace({ ...parameters.params.value[0]!, value: 42 })
  expect(parameters.params.value[0]?.value).toBe(42)

  parameters.writing.value = true
  parameters.stopWriting()
  expect(parameters.writing.value).toBe(false)
})
