import { expect, it } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory } from 'vue-router'
import TopBar from './TopBar.vue'
import { VEHICLE, telemetryAt } from './fixtures'
import type { Connection, Telemetry } from './generated/app'
import { i18n } from './i18n'
import { mockBackend } from './mock-backend'
import { createAppRouter } from './router'
import { feed, nextFrame } from './testing'
import { createConfigurator } from './useConfigurator'

const connected: Connection = { state: 'connected', vehicle: { ...VEHICLE } }

/**
 * The top bar on a fresh Configurator, with `connection` and `telemetry` already received.
 *
 * @param connection the link's state
 * @param telemetry what the vehicle sent, or null
 * @returns the bar, the text of its vehicle cell and of each live cell by its label
 */
async function barWith(connection: Connection, telemetry: Telemetry | null) {
  const handle = createConfigurator(mockBackend())
  const router = createAppRouter(createMemoryHistory())
  await router.push('/flight')
  const wrapper = mount(TopBar, { global: { plugins: [i18n, router] } })
  await flushPromises()
  feed(handle, { connection, telemetry })
  // The telemetry is published once per frame.
  await nextFrame()
  await wrapper.vm.$nextTick()

  return {
    wrapper,
    vehicle: wrapper.get('.vehicle').text(),
    cells: new Map(wrapper.findAll('.cell').map(cell => [cell.get('dt').text(), cell.get('dd').text()])),
  }
}

it('says what is true of a connected vehicle: its kind, system, mode, state, battery and GPS', async () => {
  const { vehicle, cells } = await barWith(connected, telemetryAt(10))

  expect(vehicle).toBe('QUADROTORARDUPILOTMEGA · system 1/1')
  expect(cells.get('MODE')).toBe('LOITER')
  expect(cells.get('STATE')).toBe('ARMED')
  expect(cells.get('BATTERY')).toBe('90%')
  expect(cells.get('GPS')).toMatch(/^3D fix · \d+$/u)
})

it('fills the STATE cell for an armed vehicle, and only then, with the word ARMED in it', async () => {
  const armed = await barWith(connected, telemetryAt(10))
  const disarmed = await barWith(connected, telemetryAt(1))

  expect(armed.wrapper.findAll('.cell.armed').map(cell => cell.get('dt').text())).toEqual(['STATE'])
  expect(disarmed.wrapper.findAll('.cell.armed')).toHaveLength(0)
  expect(disarmed.cells.get('STATE')).toBe('disarmed')
})

it('shows a dash, not a made-up value, for everything that is not known without a link', async () => {
  const { vehicle, cells, wrapper } = await barWith({ state: 'disconnected' }, null)

  expect(vehicle).toBe('disconnectedNo vehicle')
  expect([...cells.values()]).toEqual(['—', '—', '—', '—', '—'])
  expect(wrapper.get('#topbar-disconnect').attributes('disabled')).toBeDefined()
})

it('does not show the last mode of a link that is lost, and marks the vehicle cell as a warning', async () => {
  const { vehicle, cells, wrapper } = await barWith({ state: 'lost', vehicle: { ...VEHICLE } }, telemetryAt(10))

  expect(vehicle).toContain('lost')
  expect(wrapper.get('.vehicle').classes()).toContain('warn')
  expect([cells.get('MODE'), cells.get('STATE')]).toEqual(['—', '—'])
})

it('says the link is being brought back, with the attempt and the next retry in the vehicle cell', async () => {
  const reconnecting: Connection = { state: 'reconnecting', vehicle: { ...VEHICLE }, attempt: 3, nextRetryMs: 4000 }
  const { vehicle, cells, wrapper } = await barWith(reconnecting, telemetryAt(10))

  expect(vehicle).toBe('reconnectingtry 3, the next in 4 s')
  expect(wrapper.get('.vehicle').classes()).toContain('warn')
  expect(cells.get('MODE')).toBe('—')
})

it('says so when the heartbeat has gone quiet', async () => {
  const { cells } = await barWith(connected, { ...telemetryAt(10), heartbeatAgeMs: 4200 })

  expect(cells.get('MODE')).toBe('LOITER · stale, 4 s old')
  expect(cells.get('STATE')).toBe('ARMED · stale, 4 s old')
})

it('has no value for the link quality yet (nothing measures it), only a dash', async () => {
  expect((await barWith(connected, telemetryAt(1))).cells.get('LINK')).toBe('—')
})

it('is the banner of the page, names the application, and links home', async () => {
  const { wrapper } = await barWith(connected, telemetryAt(1))

  expect(wrapper.get('header').attributes('id')).toBe('top-bar')
  expect(wrapper.get('h1').text()).toBe('Drone Configurator')
  expect(wrapper.get('a.logo').attributes('aria-label')).toBe('Home')
  expect(wrapper.get('a.logo').attributes('href')).toBe('/flight')
})
