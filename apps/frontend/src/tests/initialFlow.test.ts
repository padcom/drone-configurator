// How the initial values follow the session: the first complete download takes them, the user's Download replaces them, a link
// that comes back to the same vehicle keeps them (its automatic download only updates the values), another vehicle has its own.
import { setTimeout as sleep } from 'node:timers/promises'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { type MockControl, mockBackend } from '@/mock/mock-backend'
import { VEHICLE } from '@/mock/fixtures'
import { createConfigurator } from '@/composables/useConfigurator'

/** A time that is long after the first download (the clock moves on while a test waits, so the times are told apart by this). */
const LATER = 1_000_000

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(1000)
})

afterEach(() => {
  vi.useRealTimers()
})

/**
 * A Configurator on the mock backend, connected to the simulated vehicle and with its list downloaded.
 *
 * @returns the Configurator and the control of the mock
 */
async function connected() {
  const control: MockControl = {}
  const handle = createConfigurator(mockBackend({ control }))
  await handle.vehicle.connect({ transport: 'simulator' })
  await vi.waitFor(() => expect(handle.fields.list.value).toBe('complete'))

  return { handle, control }
}

/**
 * Makes the list say that RTL_ALT is 99 (as if it had been written), without the vehicle's value changing.
 *
 * @param handle the Configurator
 */
function pretendRtlWasWritten(handle: Awaited<ReturnType<typeof connected>>['handle']): void {
  const param = handle.fields.params.value.find(candidate => candidate.id === 'RTL_ALT')
  handle.parameters.replace({ ...(param as NonNullable<typeof param>), value: 99 })
}

it('takes the values of the first complete download, with its time', async () => {
  const { handle } = await connected()

  expect(handle.fields.initial.value?.at).toBeLessThan(LATER)
  expect(handle.fields.initial.value?.values.get('RTL_ALT')).toBe(1500)
  expect(handle.parameters.changed.value.size).toBe(0)
})

it('are replaced by the Download the user presses', async () => {
  const { handle } = await connected()
  pretendRtlWasWritten(handle)
  expect([...handle.parameters.changed.value]).toEqual(['RTL_ALT'])

  vi.setSystemTime(LATER)
  await handle.parameters.refresh()

  expect(handle.fields.initial.value?.at).toBeGreaterThanOrEqual(LATER)
  expect(handle.parameters.changed.value.size).toBe(0)
})

it('are kept by the automatic download after a link came back to the same vehicle, which updates the values', async () => {
  const { handle, control } = await connected()
  pretendRtlWasWritten(handle)
  control.connection?.({ state: 'reconnecting', vehicle: { ...VEHICLE }, attempt: 1, nextRetryMs: 1000 })
  await vi.waitFor(() => expect(handle.fields.connection.value.state).toBe('reconnecting'))

  vi.setSystemTime(LATER)
  control.connection?.({ state: 'connected', vehicle: { ...VEHICLE }, resumed: true })
  await vi.waitFor(() => expect(handle.fields.params.value.find(p => p.id === 'RTL_ALT')?.value).toBe(1500))
  await vi.waitFor(() => expect(handle.fields.list.value).toBe('complete'))

  // The download ran (the vehicle's own value is back), and what "changed" is measured against is what it was.
  expect(handle.fields.initial.value?.at).toBeLessThan(LATER)
})

it('are forgotten when the link ends, and the next vehicle takes its own', async () => {
  const { handle, control } = await connected()

  control.connection?.({ state: 'disconnected' })
  await vi.waitFor(() => expect(handle.fields.connection.value.state).toBe('disconnected'))
  expect(handle.fields.initial.value).toBeNull()
  vi.setSystemTime(LATER)
  await handle.vehicle.connect({ transport: 'simulator' })
  await vi.waitFor(() => expect(handle.fields.initial.value?.at).toBeGreaterThanOrEqual(LATER))
})

it('are not replaced by a download that is not complete', async () => {
  const { handle } = await connected()
  const before = handle.fields.initial.value
  const downloaded = { params: handle.fields.params.value.slice(0, 3), missing: [3], complete: false }
  const { client } = (handle.parameters as unknown as { deps: { client: { call: () => unknown } } }).deps
  vi.spyOn(client, 'call').mockResolvedValueOnce(downloaded)

  vi.setSystemTime(LATER)
  await handle.parameters.refresh()

  expect(handle.fields.list.value).toBe('incomplete')
  expect(handle.fields.initial.value).toBe(before)
})

it('count a parameter that another ground station changed as changed, and a value put back as not', async () => {
  const { handle, control } = await connected()

  control.announce?.('RTL_ALT', 2000)
  await vi.waitFor(() => expect([...handle.parameters.changed.value]).toEqual(['RTL_ALT']))
  control.announce?.('RTL_ALT', 1500)

  await vi.waitFor(() => expect(handle.parameters.changed.value.size).toBe(0))
})

it('are not worked out again for a telemetry tick: the changed set is the same object', async () => {
  const { handle } = await connected()
  const before = handle.parameters.changed.value

  handle.fields.telemetry.value = null
  await Promise.resolve()

  expect(handle.parameters.changed.value).toBe(before)
})

it('take the queued resets out when a download gives the vehicle their values, and keep a typed change', async () => {
  const { handle } = await connected()
  pretendRtlWasWritten(handle)
  handle.parameters.select('FENCE_RADIUS')
  handle.parameters.editDraft('300')
  handle.staged.sync()
  handle.staged.resetTo([{ id: 'RTL_ALT', to: 1500 }])
  expect(handle.staged.changes.value.map(change => change.origin)).toEqual([undefined, 'reset'])

  await handle.parameters.refresh()
  await vi.waitFor(() => expect(handle.staged.matched.value).toEqual({ count: 1 }))

  expect(handle.staged.changes.value.map(change => change.id)).toEqual(['FENCE_RADIUS'])
})

it('keep the automatic download of a link that came back, that waited for a write, from replacing them', async () => {
  const { handle } = await connected()
  const before = handle.fields.initial.value
  pretendRtlWasWritten(handle)
  const release = handle.parameters.lock.take()
  vi.setSystemTime(LATER)

  await handle.parameters.refresh({ keepInitial: true })
  expect(handle.fields.list.value).toBe('complete')
  release?.()
  await vi.waitFor(() => expect(handle.fields.params.value.find(p => p.id === 'RTL_ALT')?.value).toBe(1500))

  expect(handle.fields.initial.value).toBe(before)
})

it('let a connection to another vehicle that waited for a write replace them', async () => {
  const { handle } = await connected()
  const release = handle.parameters.lock.take()
  vi.setSystemTime(LATER)

  await handle.parameters.refresh({ keepInitial: true })
  await handle.parameters.refresh()
  release?.()

  await vi.waitFor(() => expect(handle.fields.initial.value?.at).toBeGreaterThanOrEqual(LATER))
})

it('forget a download that waited for a write when the session ends: none is made with nobody connected', async () => {
  const { handle, control } = await connected()
  const release = handle.parameters.lock.take()
  await handle.parameters.refresh({ keepInitial: true })
  const lists = vi.spyOn((handle.parameters as unknown as { deps: { client: { call: () => unknown } } }).deps.client, 'call')

  control.connection?.({ state: 'disconnected' })
  await vi.waitFor(() => expect(handle.fields.connection.value.state).toBe('disconnected'))
  release?.()
  await sleep(20)

  expect(lists).not.toHaveBeenCalled()
  expect(handle.fields.list.value).toBe('complete')
  expect(handle.fields.error.value).toBeNull()
})

it('keep the download that the next vehicle asked for while the last write was still being given back', async () => {
  const { handle, control } = await connected()
  const release = handle.parameters.lock.take()
  control.connection?.({ state: 'disconnected' })
  await vi.waitFor(() => expect(handle.fields.connection.value.state).toBe('disconnected'))
  release?.()

  await handle.vehicle.connect({ transport: 'simulator' })

  await vi.waitFor(() => expect(handle.fields.initial.value).not.toBeNull())
})

it('does not download while a write holds the lock', async () => {
  const { handle } = await connected()
  const release = handle.parameters.lock.take()
  vi.setSystemTime(LATER)

  await handle.parameters.refresh()

  expect(handle.fields.initial.value?.at).toBeLessThan(LATER)
  release?.()
  await handle.parameters.refresh()
  expect(handle.fields.initial.value?.at).toBeGreaterThanOrEqual(LATER)
})
