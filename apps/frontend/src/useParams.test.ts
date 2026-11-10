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
    problemWith: vi.fn((): string | null => null),
    warningWith: vi.fn((): string | null => null),
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

it('keeps what was typed when the selected parameter is pressed again, and starts over for another one', async () => {
  const { parameters } = await rig()
  await parameters.refresh()
  parameters.select('RTL_ALT')
  parameters.editDraft('1600')

  parameters.select('RTL_ALT')
  expect(parameters.draft.value).toBe('1600')
  parameters.select('BATT_CAPACITY')
  expect(parameters.draft.value).toBe('5200')
  parameters.select('RTL_ALT')
  expect(parameters.draft.value).toBe('1500')
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

it('keeps a warning from the metadata beside the draft, but none for the value the vehicle has', async () => {
  const { parameters, deps } = await rig()
  await parameters.refresh()
  parameters.select('RTL_ALT')
  deps.warningWith.mockReturnValue('Outside the usual range 30–300000 cm')

  parameters.editDraft('20')

  expect(parameters.draftError.value).toBeNull()
  expect(parameters.draftWarning.value).toBe('Outside the usual range 30–300000 cm')

  // Back at the value the vehicle has: nothing is unusual about it, whatever the metadata says.
  parameters.editDraft('1500')
  expect(parameters.draftWarning.value).toBeNull()

  // A new selection starts with the vehicle's own value: nothing unusual.
  parameters.editDraft('20')
  parameters.select('BATT_CAPACITY')
  expect(parameters.draftWarning.value).toBeNull()
  parameters.editDraft('20')
  expect(parameters.draftWarning.value).toBe('Outside the usual range 30–300000 cm')
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

it('replaces a parameter by its newer self', async () => {
  const { parameters } = await rig()
  await parameters.refresh()

  parameters.replace({ ...parameters.params.value[0]!, value: 42 })
  expect(parameters.params.value[0]?.value).toBe(42)
})
