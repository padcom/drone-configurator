import { expect, it } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import StatusBar from './StatusBar.vue'
import { VEHICLE, telemetryAt } from './fixtures'
import type { Connection, Telemetry } from './generated/app'
import { mockBackend } from './mock-backend'
import { feed, nextFrame, withI18n } from './testing'
import { createConfigurator } from './useConfigurator'

const connected: Connection = { state: 'connected', vehicle: { ...VEHICLE } }

/**
 * The status bar on a fresh Configurator, with `connection` and `telemetry` already received.
 *
 * @param connection the link's state
 * @param telemetry what the vehicle sent, or null
 * @returns the text of each item of the bar, by its label
 */
async function statusWith(connection: Connection, telemetry: Telemetry | null) {
  const handle = createConfigurator(mockBackend())
  const wrapper = mount(StatusBar, withI18n)
  await flushPromises()
  feed(handle, { connection, telemetry })
  // The telemetry is published once per frame.
  await nextFrame()
  await wrapper.vm.$nextTick()

  return new Map(wrapper.findAll('.item').map(item => {
    const label = item.find('.label').text()

    return [label, item.text().replace(label, '').trim()]
  }))
}

it('says what is true of a connected vehicle: its link, kind, mode and state', async () => {
  const status = await statusWith(connected, telemetryAt(10))

  expect(status.get('Connection')).toBe('connected')
  expect(status.get('Vehicle')).toBe('QUADROTOR · ARDUPILOTMEGA · system 1/1')
  expect(status.get('Mode')).toBe('LOITER')
  expect(status.get('State')).toBe('ARMED')
})

it('shows a dash, not a made-up value, for everything that is not known without a link', async () => {
  const status = await statusWith({ state: 'disconnected' }, null)

  expect(status.get('Connection')).toBe('disconnected')
  expect([status.get('Vehicle'), status.get('Mode'), status.get('State'), status.get('Link')]).toEqual(['—', '—', '—', '—'])
})

it('does not show the last mode of a link that is lost', async () => {
  const status = await statusWith({ state: 'lost', vehicle: { ...VEHICLE } }, telemetryAt(10))

  expect(status.get('Connection')).toBe('lost')
  expect(status.get('Vehicle')).toBe('QUADROTOR · ARDUPILOTMEGA · system 1/1')
  expect(status.get('Mode')).toBe('—')
  expect(status.get('State')).toBe('—')
})

it('says the link is being brought back, with the vehicle still named and the mode a dash', async () => {
  const reconnecting: Connection = { state: 'reconnecting', vehicle: { ...VEHICLE }, attempt: 1, nextRetryMs: 1000 }
  const status = await statusWith(reconnecting, telemetryAt(10))

  expect(status.get('Connection')).toBe('reconnecting')
  expect(status.get('Vehicle')).toBe('QUADROTOR · ARDUPILOTMEGA · system 1/1')
  expect(status.get('Mode')).toBe('—')
})

it('says so when the heartbeat has gone quiet, and marks an armed vehicle', async () => {
  const status = await statusWith(connected, { ...telemetryAt(10), heartbeatAgeMs: 4200 })

  expect(status.get('Mode')).toBe('LOITER · stale, 4 s old')
  expect(status.get('State')).toBe('ARMED · stale, 4 s old')
})

it('has no value for the link quality yet (nothing measures it), only a dash', async () => {
  expect((await statusWith(connected, telemetryAt(1))).get('Link')).toBe('—')
})

it('is a labelled region, and marks an armed vehicle with the warn style', async () => {
  const handle = createConfigurator(mockBackend())
  const wrapper = mount(StatusBar, withI18n)
  await flushPromises()
  feed(handle, { connection: connected, telemetry: telemetryAt(10) })
  await nextFrame()
  await wrapper.vm.$nextTick()

  expect(wrapper.find('footer').attributes('aria-label')).toBe('Status')
  expect(wrapper.findAll('.item.warn').map(item => item.text())).toEqual(['State ARMED'])
})
