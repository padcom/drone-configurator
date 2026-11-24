// The firmware's defaults of the parameters (#36), as a download brings them: what "Modified from default" is measured against.
import { expect, it, vi } from 'vitest'
import { createBackendClient } from '@/backend/client'
import { type MockOptions, mockBackend } from '@/mock/mock-backend'
import { createToasts } from './toasts'
import { useParams } from './useParams'

/**
 * Parameters on the mock backend, connected.
 *
 * @param options how the mock vehicle behaves
 * @returns the parameters
 */
async function rig(options: MockOptions = {}) {
  const client = createBackendClient(mockBackend(options))
  await client.call('vehicle.connect', { transport: 'simulator' })

  return useParams({ client, toasts: createToasts(), fail: vi.fn(), problemWith: () => null, warningWith: () => null })
}

it('takes the defaults of a download by file transfer, and tells the modified parameters from them', async () => {
  const parameters = await rig()

  await parameters.refresh()

  expect(parameters.defaults.value?.get('BATT_CAPACITY')).toBe(3300)
  expect(parameters.defaults.value?.get('RTL_ALT')).toBe(1500)
  expect([...parameters.modified.value].toSorted()).toEqual(['BATT_CAPACITY', 'FENCE_RADIUS', 'WPNAV_SPEED'])
})

it('keeps them through the resume after a link came back, and forgets them with the session', async () => {
  const parameters = await rig()
  await parameters.refresh()

  await parameters.refresh({ keepInitial: true })
  expect(parameters.defaults.value?.get('BATT_CAPACITY')).toBe(3300)

  parameters.clearInitial()
  expect(parameters.defaults.value).toBeNull()
  expect(parameters.modified.value.size).toBe(0)
})

it('knows none after a download by the list (the vehicle has no file transfer)', async () => {
  const parameters = await rig({ ftp: 'unsupported' })

  await parameters.refresh()

  expect(parameters.list.value).toBe('complete')
  expect(parameters.defaults.value).toBeNull()
})
