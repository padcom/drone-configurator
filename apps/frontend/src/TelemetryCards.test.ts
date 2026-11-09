import { expect, it } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import TelemetryCards from './TelemetryCards.vue'
import { mockBackend } from './mock-backend'
import { feed, nextFrame, withI18n } from './testing'
import { createConfigurator } from './useConfigurator'
import { telemetryAt } from './fixtures'
import type { Telemetry } from './generated/app'
import { STALE_MS, isStale } from './telemetryCards'

/**
 * Mounts the cards on a fresh Configurator, with `telemetry` already received.
 *
 * @param telemetry what the vehicle sent, or null
 * @returns the mounted component
 */
async function cardsWith(telemetry: Telemetry | null) {
  const handle = createConfigurator(mockBackend())
  const wrapper = mount(TelemetryCards, withI18n)
  // Through the Configurator, as the backend's events would be: a ref written directly is overwritten by its next render.
  await flushPromises()
  feed(handle, { telemetry })
  // The telemetry is published once per frame.
  await nextFrame()
  await wrapper.vm.$nextTick()

  return wrapper
}

it('shows the cards', async () => {
  const wrapper = await cardsWith(telemetryAt(10))

  expect(wrapper.text()).toContain('LOITER')
  expect(wrapper.text()).toContain('ARMED')
  expect(wrapper.text()).toContain('12.50 V · 90%')
  expect(wrapper.find('.card.warn').exists()).toBe(true)
})

it('says to connect when there is no telemetry', async () => {
  expect((await cardsWith(null)).text()).toContain('No telemetry')
})

it('shows a dash for what the vehicle has not reported yet, not zeros', async () => {
  const wrapper = await cardsWith({ armed: false, mode: 'STABILIZE', heartbeatAgeMs: 100 })

  const values = wrapper.findAll('.card').map(card => card.text())
  expect(values).toContain('Battery—')
  expect(values).toContain('Attitude—')
  expect(wrapper.find('.card.warn').exists()).toBe(false)
})

it('marks a stale heartbeat', async () => {
  const wrapper = await cardsWith({ ...telemetryAt(1), heartbeatAgeMs: 3500 })

  expect(wrapper.find('.card.warn').text()).toBe('Heartbeat3500 ms ago')
})

it('shows the cards of the groups the vehicle sent: position, GPS and speed', async () => {
  const text = (await cardsWith(telemetryAt(10))).findAll('.card').map(card => card.text())

  expect(text).toContain('Position47.397842° 8.545594° · 20.0 m above home')
  expect(text).toContain('GPS3D fix · 12 satellites')
  expect(text).toContain('Speedground 1.0 m/s · air 1.2 m/s · climb 0.0 m/s')
})

it('has no card for a group that was never sent, and no zeros in its place', async () => {
  const { position, gps, speed, ...flat } = telemetryAt(10)
  const labels = (await cardsWith(flat)).findAll('.card').map(card => card.text())

  expect(position && gps && speed).toBeTruthy()
  expect(labels.filter(card => /^(?:Position|GPS|Speed)/u.test(card))).toEqual([])
})

it('leaves the satellites out when the receiver does not say, and names an unknown fix type', async () => {
  const base = telemetryAt(10)
  const noSatellites = await cardsWith({ ...base, gps: { fixType: 6, ageMs: 100 } })
  expect(noSatellites.text()).toContain('GPSRTK fixed')
  expect(noSatellites.text()).not.toContain('satellites')

  const unknown = await cardsWith({ ...base, gps: { fixType: 42, satellites: 5, ageMs: 100 } })
  expect(unknown.text()).toContain('GPSUnknown fix · 5 satellites')
})

it('reads the battery and attitude from their groups, which win over the flat fields', async () => {
  const base = telemetryAt(10)
  const wrapper = await cardsWith({
    ...base,
    battery: { voltage: 11.1, remaining: 55, cells: [], ageMs: 100 },
    attitude: { roll: 1, pitch: 2, yaw: 3, rollSpeed: 0, pitchSpeed: 0, yawSpeed: 0, ageMs: 100 },
  })

  expect(wrapper.text()).toContain('11.10 V · 55%')
  expect(wrapper.text()).toContain('roll 1.0° · pitch 2.0° · yaw 3°')
})

it('marks a value that has not been updated for more than 3 s as stale, in words and not by colour alone', async () => {
  const base = telemetryAt(10)
  const wrapper = await cardsWith({
    ...base,
    battery: { voltage: 12.5, remaining: 90, cells: [], ageMs: 5400 },
  })

  const battery = wrapper.findAll('.card').find(card => card.text().startsWith('Battery'))
  expect(battery?.text()).toBe('Battery12.50 V · 90% · stale, 5 s old')
  expect(battery?.classes()).toEqual(expect.arrayContaining(['warn', 'stale']))
  // The others are fresh.
  expect(wrapper.findAll('.card.stale').length).toBe(1)
})

it('does not call a value stale at exactly the limit, or a value without an age', async () => {
  expect(isStale(STALE_MS)).toBe(false)
  expect(isStale(STALE_MS + 1)).toBe(true)
  expect(isStale(200, 100)).toBe(true)

  const wrapper = await cardsWith({ ...telemetryAt(10), battery: { voltage: 12.5, cells: [], ageMs: STALE_MS } })

  expect(wrapper.findAll('.card.stale').length).toBe(0)
})

it('shows the mode as text, not markup', async () => {
  const wrapper = await cardsWith({ armed: false, mode: '<b>X</b>', heartbeatAgeMs: 1 })

  expect(wrapper.text()).toContain('<b>X</b>')
  expect(wrapper.find('b').exists()).toBe(false)
})
