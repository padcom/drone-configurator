// The Logs screen: a title, the tabs of its parts, and the part the address names; the parts are nested routes under the screen.
import { afterEach, expect, it, vi } from 'vitest'
import { type VueWrapper, flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory } from 'vue-router'
import Shell from '@/components/shell/Shell.vue'
import { i18n, setLanguage } from '@/i18n/i18n'
import { mockBackend } from '@/mock/mock-backend'
import { createAppRouter } from '@/router'
import { createConfigurator } from '@/composables/useConfigurator'
import { useCommandPalette } from '@/composables/useCommandPalette'

let mounted: VueWrapper | undefined

/**
 * The shell at `path`.
 *
 * @param path where the application is
 * @returns the shell and its router
 */
async function shellAt(path: string) {
  createConfigurator(mockBackend())
  const router = createAppRouter(createMemoryHistory())
  await router.push(path)
  mounted = mount(Shell, { global: { plugins: [i18n, router] }, attachTo: document.body })
  await router.isReady()
  await flushPromises()

  return { wrapper: mounted, router }
}

afterEach(() => {
  setLanguage('en')
  useCommandPalette().hide()
  mounted?.unmount()
  mounted = undefined
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

it('shows the title, the five tabs in the order of the design, and the first part, for the address of the screen', async () => {
  const { wrapper, router } = await shellAt('/logs')

  expect(router.currentRoute.value.path).toBe('/logs/flights')
  expect(wrapper.get('.logs-title').text()).toBe('Logs')
  expect(wrapper.findAll('.kit-section-nav .tab').map(tab => tab.text()))
    .toEqual(['Flights', 'Replay', 'Spectrum', 'On the vehicle', 'Tools'])
  expect(wrapper.get('.logs-flights .logs-flights-title').text()).toBe('Flights')
})

it('names the navigation, marks the tab that is shown by aria-current, and the tabs are links to the parts', async () => {
  const { wrapper } = await shellAt('/logs/vehicle')
  const nav = wrapper.get('.kit-section-nav')

  expect(nav.element.tagName).toBe('NAV')
  expect(nav.attributes('aria-label')).toBe('Logs sections')
  expect(nav.findAll('a[aria-current="page"]').map(tab => tab.text())).toEqual(['On the vehicle'])
  expect(nav.findAll('a').map(tab => tab.attributes('href')))
    .toEqual(['/logs/flights', '/logs/replay', '/logs/spectrum', '/logs/vehicle', '/logs/tools'])
})

it('says in each part what is missing and what it will take, never a blank panel', async () => {
  const { wrapper, router } = await shellAt('/logs/flights')
  const said: string[] = []

  // "Flights" and "On the vehicle" are built (LogsFlights.test.ts, LogsVehicle.test.ts); the others are still placeholders.
  for (const part of ['replay', 'spectrum', 'tools']) {
    // One part after the other: each is looked at while it is the one shown.
    // eslint-disable-next-line no-await-in-loop
    await router.push(`/logs/${part}`)
    // eslint-disable-next-line no-await-in-loop
    await flushPromises()
    const visible = wrapper.findAll('.logs-section').filter(section => section.isVisible())
    expect(visible, part).toHaveLength(1)
    said.push(`${visible[0]?.get('.title').text()} / ${visible[0]?.get('.help').text()}`)
  }

  expect(said.map(line => line.length > 20).every(Boolean)).toBe(true)
  expect(new Set(said).size).toBe(3)
  expect(said[0]).toContain('Replay is not available yet')
})

it('shows in "On the vehicle" that a vehicle must be connected, not a placeholder', async () => {
  const { wrapper } = await shellAt('/logs/vehicle')

  expect(wrapper.get('.logs-vehicle .kit-empty .title').text()).toBe('No vehicle is connected')
  expect(wrapper.find('.logs-section').exists()).toBe(false)
})

it('keeps the screen alive when a part is chosen: the title is the same element, and each part keeps its own state', async () => {
  const { wrapper, router } = await shellAt('/logs/flights')
  const title = wrapper.get('.logs-title').element
  const flights = wrapper.get('.logs-flights').element

  await router.push('/logs/tools')
  await flushPromises()
  expect(wrapper.get('.logs-title').element).toBe(title)
  await router.push('/logs/flights')
  await flushPromises()

  expect(wrapper.get('.logs-title').element).toBe(title)
  // The part that was left is the element that comes back, not a new one.
  expect(wrapper.findAll('.logs-flights').some(section => section.element === flights && section.isVisible())).toBe(true)
})

it('opens the part that was shown last for the address of the screen, and the first before any was', async () => {
  const { router } = await shellAt('/flight')
  await router.push('/logs')
  expect(router.currentRoute.value.path).toBe('/logs/flights')
  await router.push('/logs/spectrum')
  await router.push('/parameters')
  await router.push('/logs')

  expect(router.currentRoute.value.path).toBe('/logs/spectrum')
})

it('marks the Logs button of the rail as current whichever part is shown', async () => {
  const { wrapper } = await shellAt('/logs/replay')
  const current = wrapper.findAll('nav a[data-command-button][aria-current="page"]')
    .map(link => link.attributes('data-command-button'))

  expect(current).toEqual(['go.logs'])
})

it('sends an address under Logs that is no part to Logs itself (the part shown last), not to the first screen', async () => {
  const { router } = await shellAt('/logs/nothing')
  expect(router.currentRoute.value.path).toBe('/logs/flights')

  await router.push('/logs/tools')
  await router.push('/logs/zzz/deeper')

  expect(router.currentRoute.value.path).toBe('/logs/tools')
  // An address that is no screen at all still goes to the first screen.
  await router.push('/logsx')
  expect(router.currentRoute.value.path).toBe('/flight')
})

it('says which part was chosen, politely, in a status that is in the screen all the time', async () => {
  const { wrapper, router } = await shellAt('/logs/flights')
  const status = () => wrapper.get('.logs [role="status"]').text()

  expect(status()).toBe('Logs: Flights')
  await router.push('/logs/vehicle')
  await flushPromises()
  expect(status()).toBe('Logs: On the vehicle')
  // Another screen is shown: what the status says does not follow the route away from the screen.
  await router.push('/parameters')
  await flushPromises()
  await router.push('/logs')
  await flushPromises()

  expect(status()).toBe('Logs: On the vehicle')
})

it('keeps the words of its own part in a part that is kept alive while another is shown', async () => {
  const { router } = await shellAt('/logs/tools')
  // The part is a prop of the route's component, not read from the route that is current.
  const record = router.getRoutes().find(route => route.name === 'logs.vehicle')

  expect(record?.props.default).toEqual({ section: 'vehicle' })
  expect(router.resolve('/logs/spectrum').meta).toMatchObject({ section: 'spectrum', screenTitleKey: 'screen.logs' })
})

it('has the title and the words in another language, where the screen is: the tabs follow the language', async () => {
  const { wrapper } = await shellAt('/logs/flights')
  setLanguage('pl')
  await flushPromises()

  expect(wrapper.findAll('.kit-section-nav .tab').map(tab => tab.text()))
    .toEqual(['Loty', 'Odtwarzanie', 'Widmo', 'W pojeździe', 'Narzędzia'])
})
