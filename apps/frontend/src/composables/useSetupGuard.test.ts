// What a Setup page queues is "guarded": refused while the vehicle is armed or may be (unknown counts as armed), by the queue and
// by the backend; what the Parameters screen queues is not, and goes on as it did. And the vehicle's details and modes: read once
// for the vehicle, forgotten with it.
import { expect, it, vi } from 'vitest'
import { telemetryAt, SETUP_PARAMS } from '@/mock/fixtures'
import { type MockControl, mockBackend } from '@/mock/mock-backend'
import { feed } from '@/testing/testing'
import { createConfigurator } from './useConfigurator'

/**
 * A connected simulated vehicle that was set up, disarmed, its parameters read, and what it was asked to confirm.
 *
 * @returns the handle, the mock's controls and the questions
 */
async function connected() {
  const control: MockControl = {}
  const asked: string[] = []
  const handle = createConfigurator(mockBackend({ telemetryMs: 600_000, params: SETUP_PARAMS, control }), question => {
    asked.push(question)

    return Promise.resolve(true)
  })
  control.armed?.(false)
  await handle.vehicle.connect({ transport: 'simulator' })
  feed(handle, { telemetry: { ...telemetryAt(0), armed: false } })
  await vi.waitFor(() => expect(handle.parameters.list.value).toBe('complete'))

  return { handle, control, asked }
}

/**
 * The value of a parameter on the vehicle, as the interface has it.
 *
 * @param handle the Configurator
 * @param id the parameter
 * @returns its value
 */
function valueOf(handle: Awaited<ReturnType<typeof connected>>['handle'], id: string): number | undefined {
  return handle.parameters.params.value.find(param => param.id === id)?.value
}

it('queues a guarded change when the vehicle is disarmed, marks it, and writes it with the mark', async () => {
  const { handle, asked } = await connected()

  expect(handle.staged.stage([{ id: 'FS_GCS_ENABLE', to: 1 }], { guarded: true })).toBe(1)
  expect(handle.staged.pending()).toEqual([{ id: 'FS_GCS_ENABLE', from: 0, to: 1, guarded: true }])
  await handle.staged.writeAll()

  expect(asked).toHaveLength(1)
  expect(valueOf(handle, 'FS_GCS_ENABLE')).toBe(1)
  expect(handle.staged.pending()).toEqual([])
})

it('does not queue a guarded change while the vehicle is armed, and says why', async () => {
  const { handle, control } = await connected()
  control.armed?.(true)
  feed(handle, { telemetry: { ...telemetryAt(0), armed: true } })

  expect(handle.staged.stage([{ id: 'FS_GCS_ENABLE', to: 1 }], { guarded: true })).toBe(0)
  expect(handle.staged.refused.value).toContain('Setup changes are not written while the vehicle is armed')
  expect(handle.staged.pending()).toEqual([])
})

it('does not queue a guarded change while it is not known that the vehicle is disarmed', async () => {
  const { handle } = await connected()
  feed(handle, { telemetry: { ...telemetryAt(0), armed: false, heartbeatAgeMs: 9000 } })

  expect(handle.staged.stage([{ id: 'FS_GCS_ENABLE', to: 1 }], { guarded: true })).toBe(0)
  expect(handle.staged.refused.value).not.toBeNull()
})

it('does not write a guarded change that was queued before the vehicle armed, and asks nothing', async () => {
  const { handle, control, asked } = await connected()
  handle.staged.stage([{ id: 'FS_GCS_ENABLE', to: 1 }], { guarded: true })
  control.armed?.(true)
  feed(handle, { telemetry: { ...telemetryAt(0), armed: true } })
  await handle.staged.writeAll()

  expect(asked).toHaveLength(0)
  expect(valueOf(handle, 'FS_GCS_ENABLE')).toBe(0)
  expect(handle.staged.pending()).toHaveLength(1)
})

it('leaves what the Parameters screen queues alone: it is not guarded, armed or not', async () => {
  const { handle, control } = await connected()
  control.armed?.(true)
  feed(handle, { telemetry: { ...telemetryAt(0), armed: true } })

  expect(handle.staged.stage([{ id: 'FS_GCS_ENABLE', to: 1 }])).toBe(1)
  expect(handle.staged.pending()).toEqual([{ id: 'FS_GCS_ENABLE', from: 0, to: 1 }])
  await handle.staged.writeAll()

  expect(valueOf(handle, 'FS_GCS_ENABLE')).toBe(1)
})

it('reads the modes once for the vehicle, named by the dialect', async () => {
  const { handle } = await connected()
  await handle.setup.loadModes()
  const first = handle.setup.modes.value
  await handle.setup.loadModes()

  expect(handle.setup.modes.value).toBe(first)
  expect(first?.kind).toBe('copter')
  expect(first?.modes.find(mode => mode.number === 6)?.name).toBe('RTL')
})

it('reads the details each time asked, and forgets them and the modes with the vehicle', async () => {
  const { handle } = await connected()
  await handle.setup.loadModes()
  await handle.setup.loadDetails()

  expect(handle.setup.details.value?.version).toBe('4.6.2')
  await handle.vehicle.disconnect()
  await vi.waitFor(() => expect(handle.setup.modes.value).toBeNull())

  expect(handle.setup.details.value).toBeNull()
})
