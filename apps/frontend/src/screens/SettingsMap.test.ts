// The Settings screen's Map section: the switch for loading tiles from the internet (on unless the settings say off), offline
// mode, the source and, for a custom one, its address (only its host is shown back, and a problem with it is said), the size of
// the cache and clearing it, and what the User-Agent and the privacy fact are. The settings are what the backend reads, so each
// choice is checked in the settings the mock holds.
import { afterEach, expect, it, vi } from 'vitest'
import { type VueWrapper, flushPromises, mount } from '@vue/test-utils'
import { createConfigurator } from '@/composables/useConfigurator'
import { forgetMapChoices } from '@/composables/useMapSettings'
import { i18n, setLanguage } from '@/i18n/i18n'
import { mockBackend } from '@/mock/mock-backend'
import Settings from './Settings.vue'

let mounted: VueWrapper | undefined

afterEach(() => {
  setLanguage('en')
  forgetMapChoices()
  mounted?.unmount()
  mounted = undefined
})

/**
 * The Settings screen over settings that hold these entries.
 *
 * @param ui the entries
 * @returns the screen and the Configurator
 */
async function screen(ui: { key: string, value: string }[] = []) {
  const handle = createConfigurator(mockBackend({ settings: { version: 1, ui } }))
  await vi.waitFor(() => expect(handle.settings.loaded.value).toBe(true))
  mounted = mount(Settings, { global: { plugins: [i18n] } })
  await flushPromises()

  return { wrapper: mounted, handle }
}

it('says what the server learns, with the User-Agent that is sent', async () => {
  const { wrapper } = await screen()

  const text = wrapper.get('#map-privacy').text()
  expect(text).toContain('IP address')
  expect(text).toContain('DroneConfigurator/0.1.0 (+https://github.com/padcom/drone-configurator)')
  expect(text).toContain('no position of the vehicle')
})

it('has the tiles on and the map online until the settings say otherwise, and says so', async () => {
  const { wrapper } = await screen()

  expect(wrapper.get('#map-enabled').attributes('aria-checked')).toBe('true')
  expect(wrapper.get('#map-offline').attributes('aria-checked')).toBe('false')
  expect(wrapper.get('#map-state').text()).toContain('loaded from the internet')
})

it('turns the tiles off and offline mode on in the settings, and says each state', async () => {
  const { wrapper, handle } = await screen()
  await wrapper.get('#map-offline').trigger('click')
  await flushPromises()

  expect(handle.settings.uiValue('map.offline')).toBe('true')
  expect(wrapper.get('#map-state').text()).toContain('only the tiles that were kept')
  await wrapper.get('#map-enabled').trigger('click')
  await flushPromises()

  expect(handle.settings.uiValue('map.enabled')).toBe('false')
  expect(wrapper.get('#map-state').text()).toContain('nothing is asked of a tile server')
  expect(handle.map.info.value?.enabled).toBe(false)
})

it('credits OpenStreetMap, and says its tiles are not downloaded in bulk', async () => {
  const { wrapper } = await screen()

  const text = wrapper.get('.settings-map').text()
  expect(text).toContain('© OpenStreetMap contributors')
  expect(text).toContain('https://www.openstreetmap.org/copyright')
  expect(text).toContain('no area is downloaded in bulk')
})

it('shows the host of a custom address and never the rest of it, and says why an address cannot be used', async () => {
  const { wrapper } = await screen([{ key: 'map.source', value: 'custom' }])
  expect(wrapper.get('#map-url-error').text()).toContain('no address is set')

  const field = wrapper.get('.settings-map input[type="text"]')
  await field.setValue('https://tiles.example.com/maps/{z}/{x}/{y}.png?key=SECRET')
  await field.trigger('change')
  await flushPromises()

  expect(wrapper.find('#map-url-error').exists()).toBe(false)
  const text = wrapper.get('.settings-map').text()
  expect(text).toContain('tiles.example.com')
  // (the field has the user's own text; the sentences about it have the host only)
  expect(wrapper.get('.settings-map p#map-cache-used').text()).not.toContain('SECRET')
  expect(text.replace(/\s+/gu, ' ').includes('key=SECRET')).toBe(false)

  await field.setValue('http://tiles.example.com/{z}/{x}/{y}.png')
  await field.trigger('change')
  await flushPromises()

  expect(wrapper.get('#map-url-error').text()).toContain('cannot be used')
})

it('says how much the cache holds and clears it, saying what went', async () => {
  const { wrapper } = await screen()
  expect(wrapper.get('#map-cache-used').text()).toContain('The cache holds')

  await wrapper.get('#map-clear').trigger('click')
  await flushPromises()

  expect(wrapper.get('#map-cleared').text()).toContain('40 tiles removed')
  expect(wrapper.get('#map-cache-used').text()).toContain('0 B')
})

it('says which folder the tiles are kept in, in full, so that it can be found and deleted', async () => {
  const { wrapper } = await screen()

  expect(wrapper.get('#map-cache-folder').text()).toBe(
    'The tiles are kept in this folder (you can delete it): '
    + '/home/user/.cache/pico-desktop/apps/dev.pico-desktop.drone-configurator/backend/tiles',
  )
})

it('keeps the size of the cache that is chosen', async () => {
  const { wrapper, handle } = await screen()
  const select = wrapper.get('.settings-map select[id$="-cache"]')
  await select.setValue('1000')
  await flushPromises()

  expect(handle.settings.uiValue('map.cacheMb')).toBe('1000')
  expect(handle.map.info.value?.cacheMb).toBe(1000)
})

it('says once that the settings could not be read when the backend says so', async () => {
  const { wrapper, handle } = await screen()
  const shown = handle.map.info.value as NonNullable<typeof handle.map.info.value>
  handle.map.info.value = { ...shown, notice: 'the settings could not be read' }
  await flushPromises()

  expect(wrapper.get('#map-notice').text()).toContain('could not be read')
})

it('says the server is left alone only while the settings leave it to be asked, and not after the back-off', async () => {
  const { wrapper, handle } = await screen()
  handle.map.status.value = { state: 'backing-off', reason: 'the server refused this client (403)', retryAfterMs: 30000 }
  await flushPromises()

  expect(wrapper.get('#map-state').text()).toContain('left alone for a while')
  expect(wrapper.get('#map-state').text()).toContain('refused this client (403)')
  // Offline wins over a back-off that was said earlier: nothing is asked of the server anyway.
  await wrapper.get('#map-offline').trigger('click')
  await flushPromises()
  expect(wrapper.get('#map-state').text()).toContain('only the tiles that were kept')
  await wrapper.get('#map-offline').trigger('click')
  await flushPromises()
  expect(wrapper.get('#map-state').text()).toContain('left alone for a while')
  // The backend says it is over.
  handle.map.status.value = { state: 'online' }
  await flushPromises()

  expect(wrapper.get('#map-state').text()).toContain('loaded from the internet')
})
