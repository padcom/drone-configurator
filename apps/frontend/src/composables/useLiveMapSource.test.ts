// What the live map draws, from the connected vehicle's telemetry: a marker only with a position that can be drawn (never at
// (0, 0)), old when the position is, a trail that grows as the vehicle moves and starts again when it is armed or another vehicle
// connects, and home.
import { flushPromises } from '@vue/test-utils'
import { type EffectScope, effectScope } from 'vue'
import { afterEach, expect, it, vi } from 'vitest'
import { createConfigurator } from '@/composables/useConfigurator'
import { useLiveMapSource } from '@/composables/useLiveMapSource'
import type { Telemetry } from '@/generated/app'
import type { MapSource } from '@/lib/map/mapSource'
import { VEHICLE, telemetryAt } from '@/mock/fixtures'
import { mockBackend } from '@/mock/mock-backend'
import { feed } from '@/testing/testing'

const scopes: EffectScope[] = []

afterEach(() => {
  vi.useRealTimers()
  scopes.splice(0).forEach(scope => scope.stop())
})

/**
 * How long ago the marker says the vehicle was heard.
 *
 * @param source the map source
 * @returns milliseconds
 */
function ageOf(source: MapSource): number {
  return source.vehicle.value?.ageMs ?? 0
}

/**
 * A source over a Configurator whose vehicle is connected.
 *
 * @returns the source and what drives it
 */
async function rig() {
  const handle = createConfigurator(mockBackend({ telemetryMs: 600_000 }))
  // (the mock backend's first events, "disconnected", arrive before the state is changed here)
  await flushPromises()
  feed(handle, { connection: { state: 'connected', vehicle: { ...VEHICLE } } })
  // (a connection that comes up clears the telemetry of the one before, a moment later)
  await flushPromises()
  const scope = effectScope()
  scopes.push(scope)
  const source = scope.run(() => useLiveMapSource(handle))
  if (!source) {
    throw new Error('no source')
  }

  /**
   * The vehicle reports.
   *
   * @param telemetry what it says
   */
  async function report(telemetry: Telemetry): Promise<void> {
    feed(handle, { telemetry })
    await flushPromises()
  }

  return { handle, source, report }
}

/**
 * Telemetry with a position moved north by a number of steps (about 11 m each).
 *
 * @param steps how many
 * @param more what else it says
 * @returns the telemetry
 */
function at(steps: number, more: Partial<Telemetry> = {}): Telemetry {
  const base = telemetryAt(0)

  return {
    ...base,
    armed: false,
    position: { ...base.position!, lat: 47.397742 + steps * 0.0001, ageMs: 200 },
    ...more,
  }
}

it('has no vehicle before a position, and none at (0, 0)', async () => {
  const { source, report } = await rig()

  expect(source.vehicle.value).toBeNull()
  await report({ ...at(0), position: undefined })
  expect(source.vehicle.value).toBeNull()
  await report({ ...at(0), position: { ...at(0).position!, lat: 0, lon: 0 } })

  expect(source.vehicle.value).toBeNull()
  expect(source.trail.value).toHaveLength(0)
})

it('has the vehicle where it says it is, with its heading, and old when its position is', async () => {
  const { source, report } = await rig()
  await report(at(1))

  expect(source.vehicle.value).toMatchObject({ heading: 0, stale: false })
  expect(source.vehicle.value?.lat).toBeCloseTo(47.397842, 6)
  await report({ ...at(1), position: { ...at(1).position!, ageMs: 4000 } })
  expect(source.vehicle.value?.stale).toBe(true)
  expect(source.kind).toBe('live')
})

it('has home where the vehicle says, and none while it has not said', async () => {
  const { source, report } = await rig()
  await report({ ...at(0), home: undefined })

  expect(source.home.value).toBeNull()
  await report(at(0))
  expect(source.home.value).toEqual({ lat: 47.397742, lon: 8.545594 })
  await report({ ...at(0), home: { lat: 0, lon: 0, altitude: 0, ageMs: 1 } })

  expect(source.home.value).toBeNull()
})

it('draws the path: a place for each step the vehicle moves, none while it stands still', async () => {
  const { source, report } = await rig()
  await report(at(0))
  await report(at(0))
  await report(at(1))
  await report(at(2))

  expect(source.trail.value).toHaveLength(3)
  expect(source.trail.value[2]?.lat).toBeCloseTo(47.397942, 6)
})

it('starts the path again when the vehicle is armed, and when ANOTHER vehicle connects', async () => {
  const { handle, source, report } = await rig()
  await report(at(0))
  await report(at(1))
  await report(at(2, { armed: true }))

  expect(source.trail.value).toHaveLength(1)
  await report(at(3, { armed: true }))
  expect(source.trail.value).toHaveLength(2)
  feed(handle, { connection: { state: 'connected', vehicle: { ...VEHICLE, sysid: VEHICLE.sysid + 1 } } })
  await flushPromises()

  expect(source.trail.value).toHaveLength(0)
  // (what the other vehicle held is gone: a marker the other vehicle left is not drawn once its telemetry is)
  feed(handle, { telemetry: null })
  await flushPromises()

  expect(source.vehicle.value).toBeNull()
})

/**
 * The link goes: the vehicle's telemetry is gone with it.
 *
 * @param handle the Configurator
 */
async function loseTheLink(handle: Awaited<ReturnType<typeof rig>>['handle']): Promise<void> {
  feed(handle, { connection: { state: 'disconnected' } })
  feed(handle, { telemetry: null })
  await flushPromises()
}

it('keeps the path while the link is down, and the marker where it was last heard, old and getting older', async () => {
  vi.useFakeTimers()
  const { handle, source, report } = await rig()
  await report(at(0))
  await report(at(1))
  await loseTheLink(handle)

  expect(source.trail.value).toHaveLength(2)
  expect(source.vehicle.value).toMatchObject({ stale: true })
  expect(source.vehicle.value?.lat).toBeCloseTo(47.397842, 6)
  const first = ageOf(source)
  vi.advanceTimersByTime(5000)

  expect(ageOf(source)).toBeGreaterThanOrEqual(first + 4000)
})

it('goes on with the same path when the same vehicle comes back, and fresh again with its next position', async () => {
  const { handle, source, report } = await rig()
  await report(at(0))
  await report(at(1))
  await loseTheLink(handle)
  feed(handle, { connection: { state: 'connected', vehicle: { ...VEHICLE } } })
  await flushPromises()

  expect(source.trail.value).toHaveLength(2)
  expect(source.vehicle.value?.stale).toBe(true)
  await report(at(2))

  expect(source.trail.value).toHaveLength(3)
  expect(source.vehicle.value?.stale).toBe(false)
})
