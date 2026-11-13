// The download after landing: off unless chosen; one attempt for each landing, after the newest log has stopped growing; never
// while armed, not known to be disarmed, or the link is not up; stopped when the vehicle arms; a failure or an interruption
// is told once and never tried again by itself.
import { expect, it, vi } from 'vitest'
import { nextTick, shallowRef } from 'vue'
import type { Connection, Telemetry, VehicleLog } from '@/generated/app'
import type { ToastInput } from './toasts'
import type { LogsModel } from './useVehicleLogs'
import { useAutoDownload } from './useAutoDownload'

const ARMED = { armed: true, heartbeatAgeMs: 0 } as Telemetry
const DISARMED = { armed: false, heartbeatAgeMs: 0 } as Telemetry
const STALE = { armed: false, heartbeatAgeMs: 60_000 } as Telemetry

/** What the fake vehicle's logs do. */
interface Behaviour {
  /** A download that does not match (the backend says so). */
  downloadFails?: boolean
  /** The newest log is on this computer already. */
  alreadyDownloaded?: boolean
}

/**
 * A vehicle's logs that grow as told: each look at the list (refresh) shows the next size of the newest log.
 *
 * @param sizes the size of the newest log at each look
 * @param behaviour what the fake does
 * @returns the model and what was asked of it
 */
// eslint-disable-next-line max-lines-per-function -- one fake vehicle, kept in one place
function fakeLogs(sizes: number[], behaviour: Behaviour = {}) {
  const calls = { refresh: 0, download: 0, cancel: 0, selected: [] as number[] }
  const logs = shallowRef<VehicleLog[]>([])
  const error = shallowRef<string | null>(null)
  const refresh = () => {
    const size = sizes[Math.min(calls.refresh, sizes.length - 1)] ?? 0
    calls.refresh += 1
    logs.value = [{ id: 7, size, downloaded: behaviour.alreadyDownloaded === true || logs.value[0]?.downloaded === true }]

    return Promise.resolve()
  }
  const download = () => {
    calls.download += 1

    if (behaviour.downloadFails === true) {
      error.value = 'the copy does not match'
    } else {
      logs.value = logs.value.map(log => ({ ...log, downloaded: true }))
    }

    return Promise.resolve()
  }
  const model = {
    logs,
    error,
    refresh,
    download,
    clearSelection: () => {
      calls.selected = []
    },
    toggle: (id: number) => {
      calls.selected.push(id)
    },
    cancel: () => {
      calls.cancel += 1

      return Promise.resolve()
    },
  } as unknown as LogsModel

  return { model, calls }
}

/**
 * The auto-download over a fake vehicle.
 *
 * @param sizes the sizes of the newest log at each look
 * @param logsOptions what the fake logs do
 * @param enabled whether the user chose it
 * @returns what a test needs
 */
function setup(sizes: number[], logsOptions: Behaviour = {}, enabled = true) {
  const { model, calls } = fakeLogs(sizes, logsOptions)
  const telemetry = shallowRef<Telemetry | null>(ARMED)
  const connection = shallowRef<Connection>({ state: 'connected' })
  const told: ToastInput[] = []
  const auto = useAutoDownload({
    logs: model, connection, telemetry, enabled: () => enabled, tell: input => told.push(input), pollMs: 10, maxWaitMs: 400,
  })

  return { auto, calls, telemetry, connection, told }
}

/**
 * Lands the vehicle (armed to disarmed) and waits for the attempt.
 *
 * @param t what `setup` made
 */
async function land(t: ReturnType<typeof setup>): Promise<void> {
  await nextTick()
  t.telemetry.value = DISARMED
  await nextTick()
  await t.auto.attempt.value
}

it('downloads the newest log after landing, once it has stopped growing, and says it is verified', async () => {
  const t = setup([100, 200, 300, 300])
  await land(t)

  // Looked at until the size was the same twice: 300, 300.
  expect(t.calls.refresh).toBe(4)
  expect(t.calls.selected).toEqual([7])
  expect(t.calls.download).toBe(1)
  expect(t.told).toHaveLength(1)
  expect(t.told[0]).toMatchObject({ severity: 'success' })
  expect(t.told[0]?.text).toContain('7')
})

it('does nothing when it is off, the default', async () => {
  const t = setup([100, 100], {}, false)
  await land(t)

  expect(t.calls.refresh).toBe(0)
  expect(t.calls.download).toBe(0)
  expect(t.told).toHaveLength(0)
})

it('does not start while the link is not up (reconnecting), and not when the armed state is not known', async () => {
  const lost = setup([100, 100])
  lost.connection.value = { state: 'reconnecting' }
  await land(lost)
  expect(lost.calls.download).toBe(0)

  const unknown = setup([100, 100])
  await nextTick()
  unknown.telemetry.value = STALE
  await nextTick()
  await unknown.auto.attempt.value
  expect(unknown.calls.download).toBe(0)
})

it('stops when the vehicle arms again while it waits: nothing is downloaded or told, the backend is asked to stop', async () => {
  const t = setup([100, 200, 300, 400, 500, 600, 700, 800])
  await nextTick()
  t.telemetry.value = DISARMED
  await nextTick()
  await vi.waitFor(() => expect(t.calls.refresh).toBeGreaterThan(0))
  t.telemetry.value = ARMED
  await nextTick()
  await t.auto.attempt.value

  expect(t.calls.download).toBe(0)
  expect(t.calls.cancel).toBe(1)
  expect(t.told).toHaveLength(0)
})

it('tells a failure once and does not try again by itself', async () => {
  const t = setup([100, 100], { downloadFails: true })
  await land(t)

  expect(t.calls.download).toBe(1)
  expect(t.told).toHaveLength(1)
  expect(t.told[0]).toMatchObject({ severity: 'warning' })
  expect(t.told[0]?.text).toContain('the copy does not match')
  expect(t.told[0]?.text).toContain('not tried again')
  // A while later nothing happens: no retry loop.
  await new Promise(resolve => {
    setTimeout(resolve, 80)
  })
  expect(t.calls.download).toBe(1)
  expect(t.told).toHaveLength(1)
})

it('downloads nothing when the newest log never stops growing, and says so once', async () => {
  const t = setup(Array.from({ length: 200 }, (_, i) => 100 + i))
  await land(t)

  expect(t.calls.download).toBe(0)
  expect(t.told).toHaveLength(1)
  expect(t.told[0]).toMatchObject({ severity: 'warning' })
})

it('leaves a log alone that is already downloaded', async () => {
  const t = setup([100, 100], { alreadyDownloaded: true })
  await land(t)

  expect(t.calls.download).toBe(0)
  expect(t.told).toHaveLength(0)
})

it('makes one attempt for each landing', async () => {
  const t = setup([100, 100])
  await land(t)
  t.telemetry.value = ARMED
  await nextTick()
  await land(t)

  // The second landing finds the log already downloaded by the first.
  expect(t.calls.download).toBe(1)
})
