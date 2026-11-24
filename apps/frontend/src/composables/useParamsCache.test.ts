// The list the backend keeps of each vehicle across sessions (#38), as the parameters show it: while the download that connects
// a vehicle runs, never as the initial values, replaced by the download, and taken away when the download does not replace it.
import { expect, it, vi } from 'vitest'
import { type BackendClient, createBackendClient } from '@/backend/client'
import { mockBackend } from '@/mock/mock-backend'
import { createToasts } from './toasts'
import { type ParamsModel, useParams } from './useParams'

/** How the mock's download goes: slowly enough to be seen while it runs. */
const SLOW = { progress: { steps: 5, intervalMs: 30 } }

/**
 * Parameters on a client of the mock backend, as a window that has just opened.
 *
 * @param client the client
 * @returns the parameters
 */
function paramsOn(client: BackendClient): ParamsModel {
  return useParams({
    client,
    toasts: createToasts(),
    fail: () => undefined,
    problemWith: () => null,
    warningWith: () => null,
  })
}

/**
 * A mock vehicle that was downloaded once (the backend keeps that list), and whose RTL_ALT was changed since.
 *
 * @returns the client
 */
async function vehicleDownloadedBefore(): Promise<BackendClient> {
  const client = createBackendClient(mockBackend(SLOW))
  await client.call('vehicle.connect', { transport: 'simulator' })
  await paramsOn(client).refresh()
  await client.call('params.write', { id: 'RTL_ALT', kind: 'int', type: 'INT32', value: 2500 })

  return client
}

/**
 * The value of a parameter in the list.
 *
 * @param parameters the parameters
 * @param id its name
 * @returns its value, or undefined
 */
const valueOf = (parameters: ParamsModel, id: string) => parameters.params.value.find(param => param.id === id)?.value

it('shows the kept list while the download runs, not as initial values, and the download replaces it', async () => {
  const parameters = paramsOn(await vehicleDownloadedBefore())

  const downloading = parameters.refresh({ fromCache: true })
  await vi.waitFor(() => expect(parameters.fromCache.value).not.toBeNull())
  expect(parameters.list.value).toBe('loading')
  expect(valueOf(parameters, 'RTL_ALT')).toBe(1500)
  expect(parameters.initial.value).toBeNull()
  expect(parameters.fromCache.value?.count).toBe(parameters.params.value.length)
  expect(parameters.fromCache.value?.savedAt).toBeGreaterThan(0)
  await downloading

  expect(parameters.list.value).toBe('complete')
  expect(parameters.fromCache.value).toBeNull()
  expect(valueOf(parameters, 'RTL_ALT')).toBe(2500)
  expect(parameters.initial.value).not.toBeNull()
})

it('does not ask for the kept list unless told to', async () => {
  const parameters = paramsOn(await vehicleDownloadedBefore())

  const downloading = parameters.refresh()
  await vi.waitFor(() => expect(parameters.progress.value).not.toBeNull())
  expect(parameters.params.value).toEqual([])
  await downloading
  expect(parameters.fromCache.value).toBeNull()
})

it('shows nothing when the backend keeps no list of the vehicle', async () => {
  const client = createBackendClient(mockBackend(SLOW))
  await client.call('vehicle.connect', { transport: 'simulator' })
  const parameters = paramsOn(client)

  const downloading = parameters.refresh({ fromCache: true })
  await vi.waitFor(() => expect(parameters.progress.value).not.toBeNull())
  expect(parameters.params.value).toEqual([])
  expect(parameters.fromCache.value).toBeNull()
  await downloading
  expect(parameters.list.value).toBe('complete')
})

it('takes the kept list away when the download is cancelled', async () => {
  const parameters = paramsOn(await vehicleDownloadedBefore())

  const downloading = parameters.refresh({ fromCache: true })
  await vi.waitFor(() => expect(parameters.fromCache.value).not.toBeNull())
  await parameters.cancel()
  await downloading

  expect(parameters.list.value).toBe('none')
  expect(parameters.params.value).toEqual([])
  expect(parameters.fromCache.value).toBeNull()
})

it('takes the kept list away when the download fails', async () => {
  const client = await vehicleDownloadedBefore()
  const parameters = paramsOn(client)

  const downloading = parameters.refresh({ fromCache: true })
  await vi.waitFor(() => expect(parameters.fromCache.value).not.toBeNull())
  await client.call('vehicle.disconnect', null)
  // The mock's download does not see the link go: it is cancelled as the backend's would end it, with ABORTED, unasked.
  await client.call('params.cancel', null)
  await downloading

  expect(parameters.list.value).toBe('failed')
  expect(parameters.params.value).toEqual([])
  expect(parameters.fromCache.value).toBeNull()
})

it('keeps asking for the kept list when the download waits for a write', async () => {
  const parameters = paramsOn(await vehicleDownloadedBefore())
  const release = parameters.lock.take()!

  const waiting = parameters.refresh({ fromCache: true })
  await waiting
  expect(parameters.list.value).toBe('none')
  release()

  await vi.waitFor(() => expect(parameters.fromCache.value).not.toBeNull())
  await vi.waitFor(() => expect(parameters.list.value).toBe('complete'))
  expect(parameters.fromCache.value).toBeNull()
})
