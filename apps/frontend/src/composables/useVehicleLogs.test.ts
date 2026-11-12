import { afterEach, expect, it, vi } from 'vitest'
import { telemetryAt } from '@/mock/fixtures'
import { type MockControl, type MockOptions, mockBackend } from '@/mock/mock-backend'
import type { MockLogsOptions } from '@/mock/mock-logs'
import { feed } from '@/testing/testing'
import { useToasts } from './toasts'
import { createConfigurator } from './useConfigurator'

afterEach(() => {
  const toasts = useToasts()
  toasts.visible.value.forEach(toast => toasts.dismiss(toast.key))
})

/**
 * A Configurator with the simulated vehicle connected, its logs listed, and the vehicle known to be disarmed (the mock's
 * telemetry is too slow to matter: the test says what the vehicle is).
 *
 * @param logs how the mock downloads
 * @param more more of the mock's options
 * @returns the handle
 */
async function listed(logs: MockLogsOptions = { steps: 2, intervalMs: 5 }, more: MockOptions = {}) {
  const control: MockControl = {}
  const handle = createConfigurator(mockBackend({ telemetryMs: 600_000, logs, control, ...more }))
  control.armed?.(false)
  await handle.vehicle.connect({ transport: 'simulator' })
  feed(handle, { telemetry: { ...telemetryAt(0), armed: false } })
  await handle.logs.refresh()

  return handle
}

it('lists the logs of the vehicle, none selected and none downloaded for it', async () => {
  const { logs } = await listed()

  expect(logs.logs.value.map(log => [log.id, log.downloaded])).toEqual([[1, false], [2, false], [3, true], [4, false]])
  expect(logs.selected.value).toEqual([])
  expect(logs.blocked.value).toBeNull()
})

it('downloads nothing on its own: not when the vehicle connects, and not when it is listed', async () => {
  const { logs } = await listed()

  expect(logs.progress.value).toEqual({})
  expect(logs.running.value).toBe(false)
  expect(logs.logs.value.filter(log => log.downloaded).map(log => log.id)).toEqual([3])
})

it('selects the new logs, and lets one go; a download with none selected does nothing', async () => {
  const { logs } = await listed()
  await logs.download()
  logs.selectNew()
  logs.toggle(2)

  expect(logs.selected.value).toEqual([1, 4])
  expect(logs.progress.value).toEqual({})
})

it('downloads the selected logs and shows each one done, then lists them as downloaded', async () => {
  const { logs } = await listed()
  logs.selectNew()
  await logs.download()

  expect(logs.outcome.value).toEqual({ kind: 'downloaded', count: 3, stopped: false })
  expect(Object.values(logs.progress.value).map(p => p.state)).toEqual(['done', 'done', 'done'])
  expect(logs.logs.value.every(log => log.downloaded)).toBe(true)
  expect(logs.selected.value).toEqual([])
})

it('does not send a download while the vehicle is armed, or not known to be disarmed', async () => {
  const handle = await listed()
  const { logs } = handle
  logs.selectNew()
  feed(handle, { telemetry: { ...telemetryAt(0), armed: true } })
  await logs.download()

  expect(logs.blocked.value).toBe('armed')
  expect(logs.progress.value).toEqual({})
  feed(handle, { telemetry: { ...telemetryAt(0), armed: false, heartbeatAgeMs: 5000 } })
  await logs.download()

  expect(logs.blocked.value).toBe('unknown')
  expect(logs.progress.value).toEqual({})
  expect(logs.logs.value.filter(log => log.downloaded)).toHaveLength(1)
})

it('does not erase while armed or not known to be disarmed', async () => {
  const handle = await listed()
  feed(handle, { telemetry: { ...telemetryAt(0), armed: true } })
  await handle.logs.erase()
  feed(handle, { telemetry: null })
  await handle.logs.erase()

  expect(handle.logs.outcome.value).toBeNull()
  expect(handle.logs.logs.value).toHaveLength(4)
})

it('erases only what was downloaded, and says how many stayed', async () => {
  const { logs } = await listed()
  await logs.erase()

  expect(logs.outcome.value).toEqual({ kind: 'erased', erased: 1, kept: 3 })
  expect(logs.logs.value.map(log => log.id)).toEqual([1, 2, 4])
})

it('stops on cancel, keeps what was fetched, and the next download says it went on from there', async () => {
  const { logs } = await listed({ steps: 4, intervalMs: 20 })
  logs.selectNew()
  const first = logs.download()
  await vi.waitFor(() => expect(logs.progress.value[1]?.state).toBe('downloading'))
  await logs.cancel()
  await first

  expect(logs.outcome.value).toMatchObject({ kind: 'downloaded', stopped: true })
  // No log is left "downloading" or "queued": the rows say what the list says.
  expect(logs.progress.value).toEqual({})
  expect(logs.logs.value.find(log => log.id === 1)?.downloaded).toBe(false)
  logs.selectNew()
  await logs.download()

  expect(logs.progress.value[1]?.resumedFrom).toBeGreaterThan(0)
  expect(logs.logs.value.every(log => log.downloaded)).toBe(true)
})

it('forgets the logs when the vehicle is disconnected', async () => {
  const handle = await listed()
  await handle.vehicle.disconnect()
  await vi.waitFor(() => expect(handle.logs.logs.value).toEqual([]))

  expect(handle.logs.listed.value).toBe(false)
})

it('is unavailable, with no error, when the backend has no logs methods (UNKNOWN_METHOD)', async () => {
  const { logs } = await listed(undefined, { withoutLogs: true })

  expect(logs.unavailable.value).toBe(true)
  expect(logs.error.value).toBeNull()
  expect(logs.listed.value).toBe(false)
})

it('shows another error as the error, and does not call the logs unavailable', async () => {
  const handle = await listed()
  await handle.vehicle.disconnect()
  await handle.logs.refresh()

  expect(handle.logs.unavailable.value).toBe(false)
  expect(handle.logs.error.value).toContain('NOT_CONNECTED')
})

it('forgets the list, the marks, the selection and the outcome when another vehicle is reported connected', async () => {
  const control: MockControl = {}
  const handle = createConfigurator(mockBackend({ telemetryMs: 600_000, control }))
  control.armed?.(false)
  await handle.vehicle.connect({ transport: 'simulator' })
  await handle.logs.refresh()
  handle.logs.selectNew()
  control.connection?.({ state: 'connected', vehicle: { sysid: 2, compid: 1, type: 'HEXAROTOR', autopilot: 'ARDUPILOTMEGA' } })
  await vi.waitFor(() => expect(handle.logs.listed.value).toBe(false))

  expect(handle.logs.logs.value).toEqual([])
  expect(handle.logs.selected.value).toEqual([])
})

it('keeps the list when the same vehicle comes back (resumed)', async () => {
  const handle = await listed()
  handle.vehicle.connection.value = { ...handle.vehicle.connection.value, resumed: true }
  await Promise.resolve()

  expect(handle.logs.listed.value).toBe(true)
})

it('does not count a copy of the right size and the wrong checksum as downloaded, and never erases it', async () => {
  const logs = [{ id: 1, size: 100, downloaded: true }, { id: 2, size: 100, downloaded: true }]
  const handle = await listed({ steps: 2, intervalMs: 5, logs, damaged: [2] })
  const model = handle.logs

  expect(model.logs.value.map(log => [log.id, log.downloaded])).toEqual([[1, true], [2, false]])
  await model.erase()

  expect(model.outcome.value).toEqual({ kind: 'erased', erased: 1, kept: 1 })
  expect(model.logs.value.map(log => log.id)).toEqual([2])
})
