// What a Go here may take for granted of the vehicle after a take-up: the page asks for the parameters again whenever the link
// comes back
// (the same vehicle, or another that answers in its place), so that the gate (the complete list) is not a memory of the
// vehicle before.
import { watch } from 'vue'
import { expect, it, vi } from 'vitest'
import { createConfigurator } from '@/composables/useConfigurator'
import { type MockControl, mockBackend } from '@/mock/mock-backend'

const VEHICLE = { sysid: 1, compid: 1, type: 'QUADROTOR', autopilot: 'ARDUPILOTMEGA' }

/**
 * A connected vehicle whose list is complete, and the states the list goes through from now on.
 *
 * @returns what drives it, and what it went through
 */
async function connected() {
  const control: MockControl = {}
  const handle = createConfigurator(mockBackend({ telemetryMs: 600_000, control }))
  await handle.vehicle.connect({ transport: 'simulator' })
  await vi.waitFor(() => expect(handle.fields.list.value).toBe('complete'))
  const seen: string[] = []
  watch(handle.fields.list, state => void seen.push(state), { flush: 'sync' })

  return { control, handle, seen }
}

it('downloads the parameters again when another vehicle answers in the place of the one that was connected', async () => {
  const { control, seen } = await connected()
  control.connection?.({ state: 'reconnecting', vehicle: VEHICLE, attempt: 1 })
  control.connection?.({ state: 'connected', vehicle: VEHICLE, errorCode: 'VEHICLE_CHANGED', error: 'another vehicle' })

  await vi.waitFor(() => expect(seen).toContain('loading'))
})

it('downloads the parameters again when the same vehicle comes back after a lost link', async () => {
  const { control, seen } = await connected()
  control.connection?.({ state: 'reconnecting', vehicle: VEHICLE, attempt: 1 })
  control.connection?.({ state: 'connected', vehicle: VEHICLE, resumed: true })

  await vi.waitFor(() => expect(seen).toContain('loading'))
})
