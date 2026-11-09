import { expect, it, vi } from 'vitest'
import { createBackendClient } from './backend/client'
import { VEHICLE } from './fixtures'
import { type MockControl, mockBackend } from './mock-backend'
import { useVehicle } from './useVehicle'

/**
 * A vehicle link on the mock backend, with spies for what it tells the rest of the interface.
 *
 * @returns the link, the spies, and the failures it recorded
 */
function rig() {
  const failures: (string | null)[] = []
  const control: MockControl = {}
  const vehicle = useVehicle({
    client: createBackendClient(mockBackend({ telemetryMs: 5, control })),
    fail: (message: string | null) => failures.push(message),
  })
  const sessions = vi.fn()
  vehicle.onSession(sessions)

  return { vehicle, sessions, failures, control }
}

it('connects to the simulator, shows the vehicle, and says the vehicle is connected once', async () => {
  const { vehicle, sessions, failures } = rig()

  await vehicle.connect({ transport: 'simulator' })

  expect(vehicle.connection.value).toMatchObject({ state: 'connected', vehicle: { sysid: 1, type: 'QUADROTOR' } })
  expect(sessions).toHaveBeenCalledTimes(1)
  expect(sessions).toHaveBeenCalledWith(true)
  expect(failures.at(-1)).toBeNull()
})

it('reports why a connection failed, and stays disconnected', async () => {
  const { vehicle, sessions, failures } = rig()

  await vehicle.connect({ transport: 'udp', port: 14550 })

  expect(vehicle.connection.value.state).toBe('disconnected')
  expect(failures.at(-1)).toBe('no heartbeat from udp 127.0.0.1:14550')
  expect(sessions).not.toHaveBeenCalledWith(true)
})

it('lists the serial ports', async () => {
  const { vehicle } = rig()

  await vehicle.listPorts()

  expect(vehicle.ports.value.map(port => port.path)).toEqual(['/dev/ttyACM0', '/dev/ttyAMA0'])
})

it('follows the telemetry once watching, and drops it on disconnect', async () => {
  const { vehicle, sessions } = rig()
  await vehicle.watch()
  await vehicle.connect({ transport: 'simulator' })
  await vi.waitFor(() => expect(vehicle.telemetry.value?.mode).toBeDefined())

  await vehicle.disconnect()

  expect(vehicle.connection.value.state).toBe('disconnected')
  expect(vehicle.telemetry.value).toBeNull()
  expect(sessions).toHaveBeenLastCalledWith(false)
})

it('keeps the vehicle and the last telemetry while the backend brings the link back, but offers no edits', async () => {
  const { vehicle, sessions, control } = rig()
  await vehicle.watch()
  await vehicle.connect({ transport: 'simulator' })
  await vi.waitFor(() => expect(vehicle.telemetry.value?.mode).toBeDefined())
  const last = vehicle.telemetry.value

  control.connection?.({ state: 'reconnecting', vehicle: { ...VEHICLE }, attempt: 2, nextRetryMs: 2000 })
  await vi.waitFor(() => expect(vehicle.connection.value.state).toBe('reconnecting'))

  expect(vehicle.connection.value).toMatchObject({ vehicle: { sysid: 1 }, attempt: 2, nextRetryMs: 2000 })
  expect(vehicle.telemetry.value).toBe(last)
  expect(sessions).toHaveBeenLastCalledWith(false)
})

it('ends the session when the backend itself restarts or stops while the link is being brought back', async () => {
  const { vehicle, sessions, control } = rig()
  await vehicle.watch()
  await vehicle.connect({ transport: 'simulator' })
  await vi.waitFor(() => expect(vehicle.telemetry.value).not.toBeNull())
  control.connection?.({ state: 'reconnecting', vehicle: { ...VEHICLE }, attempt: 3, nextRetryMs: 4000 })
  await vi.waitFor(() => expect(vehicle.connection.value.state).toBe('reconnecting'))

  vehicle.backendChanged('restarting')

  // A new backend has no link to the vehicle: "reconnecting, try 3" would be a lie.
  expect(vehicle.connection.value).toMatchObject({ state: 'lost', vehicle: { sysid: 1 } })
  expect(vehicle.connection.value.attempt).toBeUndefined()
  expect(vehicle.telemetry.value).toBeNull()
  expect(vehicle.notice.value).toBe('The backend restarted: the vehicle session ended. Connect again to continue.')
  expect(sessions).toHaveBeenLastCalledWith(false)
})

it('drops the telemetry when the link is given up after all', async () => {
  const { vehicle, control } = rig()
  await vehicle.watch()
  await vehicle.connect({ transport: 'simulator' })
  await vi.waitFor(() => expect(vehicle.telemetry.value).not.toBeNull())
  control.connection?.({ state: 'reconnecting', vehicle: { ...VEHICLE }, attempt: 1, nextRetryMs: 1000 })
  await vi.waitFor(() => expect(vehicle.connection.value.state).toBe('reconnecting'))

  control.connection?.({ state: 'disconnected' })
  await vi.waitFor(() => expect(vehicle.connection.value.state).toBe('disconnected'))

  expect(vehicle.telemetry.value).toBeNull()
})

it('starts a session again when the link comes back, and says whether it is the same vehicle', async () => {
  const { vehicle, sessions, control } = rig()
  await vehicle.watch()
  await vehicle.connect({ transport: 'simulator' })
  control.connection?.({ state: 'reconnecting', vehicle: { ...VEHICLE }, attempt: 1, nextRetryMs: 1000 })
  await vi.waitFor(() => expect(vehicle.connection.value.state).toBe('reconnecting'))

  control.connection?.({ state: 'connected', vehicle: { ...VEHICLE }, resumed: true })
  await vi.waitFor(() => expect(vehicle.connection.value.state).toBe('connected'))

  expect(vehicle.connection.value.resumed).toBe(true)
  expect(sessions.mock.calls.filter(([on]) => on === true)).toHaveLength(2)
})

it('ends the session, keeping the vehicle shown, when the backend restarts or stops, and says why', async () => {
  const { vehicle } = rig()
  await vehicle.connect({ transport: 'simulator' })

  vehicle.backendChanged('restarting')

  expect(vehicle.connection.value).toMatchObject({ state: 'lost', vehicle: { sysid: 1 } })
  expect(vehicle.notice.value).toBe('The backend restarted: the vehicle session ended. Connect again to continue.')
  expect(vehicle.telemetry.value).toBeNull()

  const second = rig()
  await second.vehicle.connect({ transport: 'simulator' })
  second.vehicle.backendChanged('failed')

  expect(second.vehicle.notice.value).toBe('The backend stopped: the vehicle session ended. Connect again to continue.')
})

it('ignores the backend being ready, and a restart while no vehicle is connected', () => {
  const { vehicle, sessions } = rig()

  vehicle.backendChanged('restarting')
  vehicle.backendChanged('ready')

  expect(vehicle.connection.value.state).toBe('disconnected')
  expect(vehicle.notice.value).toBeNull()
  expect(sessions).not.toHaveBeenCalled()
})

it('forgets the notice when connecting again', async () => {
  const { vehicle } = rig()
  await vehicle.connect({ transport: 'simulator' })
  vehicle.backendChanged('restarting')
  expect(vehicle.notice.value).not.toBeNull()

  await vehicle.connect({ transport: 'simulator' })

  expect(vehicle.notice.value).toBeNull()
  expect(vehicle.connection.value.state).toBe('connected')
})
