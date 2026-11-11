import { expect, it, vi } from 'vitest'
import { createBackendClient } from '@/backend/client'
import { PARAMS } from '@/mock/fixtures'
import { type MockOptions, mockBackend } from '@/mock/mock-backend'
import { compareNames } from '@/lib/params/naturalOrder'
import { type Toasts, createToasts } from './toasts'
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
  const toasts = createToasts()
  const deps = {
    client,
    toasts,
    fail: (message: string | null) => failures.push(message),
    problemWith: vi.fn((): string | null => null),
    warningWith: vi.fn((): string | null => null),
  }

  return { parameters: useParams(deps), deps, failures, toasts }
}

/**
 * The texts of the toasts that are shown.
 *
 * @param toasts the queue
 * @returns their texts
 */
const texts = (toasts: Toasts) => toasts.visible.value.map(toast => toast.text)

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
  // Put in its place by name, not at the end.
  const names = parameters.params.value.map(param => param.id)
  expect(names).toContain('NEW_ONE')
  expect(names).toEqual([...names].sort((a, b) => compareNames(a, b)))
})

it('puts a downloaded list in the natural order of the names, once, whatever order the vehicle sent it in', async () => {
  const sent = ['RC10_MIN', 'SERVO3_MIN', 'RC2_MIN', 'ARMING_CHECK', 'RC1_MIN', 'SERVO10_MIN'].map((id, index) => ({
    id, index, kind: 'int' as const, type: 'INT16', value: index,
  }))
  const client = {
    call: () => Promise.resolve({ params: sent, count: sent.length, complete: true, missing: [] }),
    onEvent: () => () => undefined,
  }
  const parameters = useParams({
    client: client as never,
    toasts: createToasts(),
    fail: () => undefined,
    problemWith: () => null,
    warningWith: () => null,
  })

  await parameters.refresh()

  expect(parameters.params.value.map(param => param.id))
    .toEqual(['ARMING_CHECK', 'RC1_MIN', 'RC2_MIN', 'RC10_MIN', 'SERVO3_MIN', 'SERVO10_MIN'])
  // The values and the vehicle's own indexes go with their parameters.
  expect(parameters.params.value.find(param => param.id === 'RC10_MIN')).toMatchObject({ index: 0, value: 0 })
})

it('shows a toast that stays while it runs, with the count and the way, and says how it ended', async () => {
  const { parameters, toasts } = await rig(true, { progress: { steps: 4, intervalMs: 20 } })

  const downloading = parameters.refresh()
  expect(texts(toasts)).toEqual(['Downloading the parameters…'])
  await vi.waitFor(() => expect(parameters.progress.value).not.toBeNull())
  const toast = toasts.visible.value[0]!
  expect(toast.sticky).toBe(true)
  expect(toast.progress).toMatchObject({ max: PARAMS.length, label: expect.stringMatching(/^\d+ of \d+ · by file transfer$/) })
  // The words do not change while it runs (a screen reader hears only how it starts and ends).
  expect(toast.text).toBe('Downloading the parameters…')
  await downloading

  expect(texts(toasts)).toEqual([`${PARAMS.length} parameters downloaded`])
  expect(toasts.visible.value[0]?.sticky).toBe(false)
  expect(toasts.visible.value[0]?.progress).toBeNull()
  expect(parameters.progress.value).toBeNull()
})

it('records how the download came: the way, why not the other, how long', async () => {
  const { parameters } = await rig(true, { ftp: 'timeout' })

  await parameters.refresh()

  expect(parameters.downloadInfo.value).toMatchObject({ source: 'list', fallback: 'timeout' })
  expect(parameters.downloadInfo.value?.elapsedMs).toBeGreaterThan(0)
})

it('records a download by file transfer without a reason', async () => {
  const { parameters } = await rig()

  await parameters.refresh()

  expect(parameters.downloadInfo.value?.source).toBe('ftp')
  expect(parameters.downloadInfo.value?.fallback).toBeUndefined()
})

it('is cancelled from the toast: the list stays as it was, and a new toast says so', async () => {
  const { parameters, toasts, failures } = await rig(true, { progress: { steps: 5, intervalMs: 30 } })
  await parameters.refresh()
  const before = parameters.params.value
  const initial = parameters.initial.value

  const downloading = parameters.refresh()
  await vi.waitFor(() => expect(parameters.progress.value).not.toBeNull())
  toasts.dismiss(toasts.visible.value.find(toast => toast.sticky)!.key, 'manual')
  await downloading

  expect(parameters.list.value).toBe('complete')
  expect(parameters.params.value).toBe(before)
  expect(parameters.initial.value).toBe(initial)
  expect(texts(toasts).at(-1)).toBe('Download cancelled')
  expect(failures).toEqual([])
})

it('is cancelled by cancel(): the same toast says so, and a first download goes back to none', async () => {
  const { parameters, toasts, failures } = await rig(true, { progress: { steps: 5, intervalMs: 30 } })

  const downloading = parameters.refresh()
  await vi.waitFor(() => expect(parameters.progress.value).not.toBeNull())
  await parameters.cancel()
  await downloading

  expect(parameters.list.value).toBe('none')
  expect(texts(toasts)).toEqual(['Download cancelled'])
  expect(failures).toEqual([])
})

it('does nothing to cancel when no download runs', async () => {
  const { parameters, toasts } = await rig()

  await parameters.cancel()

  expect(parameters.list.value).toBe('none')
  expect(texts(toasts)).toEqual([])
})

it('can be done again after a cancel', async () => {
  const { parameters } = await rig(true, { progress: { steps: 3, intervalMs: 20 } })
  const first = parameters.refresh()
  await vi.waitFor(() => expect(parameters.progress.value).not.toBeNull())
  await parameters.cancel()
  await first

  await parameters.refresh()

  expect(parameters.list.value).toBe('complete')
})

it('is a failure, not a cancel, when the backend aborts it on its own', async () => {
  const { parameters, toasts, failures } = await rig(false)

  await parameters.refresh()

  expect(parameters.list.value).toBe('failed')
  expect(texts(toasts)).toEqual(['The parameters could not be downloaded'])
  expect(toasts.visible.value[0]?.severity).toBe('error')
  expect(failures.at(-1)).toBe('NOT_CONNECTED: no vehicle is connected')
})

it('replaces a parameter by its newer self', async () => {
  const { parameters } = await rig()
  await parameters.refresh()

  parameters.replace({ ...parameters.params.value[0]!, value: 42 })
  expect(parameters.params.value[0]?.value).toBe(42)
})
