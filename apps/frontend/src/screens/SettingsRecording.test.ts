// The Settings screen's Recording section (#30): every connection is recorded by default, into the app's data folder (shown),
// with a limit of 2 GB; each choice is an entry of the settings the backend reads at the next connection; what the recording is
// doing is said, and so are the old recordings the limit removed (once more as a toast).
import { afterEach, expect, it, vi } from 'vitest'
import { type VueWrapper, flushPromises, mount } from '@vue/test-utils'
import { createConfigurator } from '@/composables/useConfigurator'
import { useToasts } from '@/composables/toasts'
import { i18n, setLanguage } from '@/i18n/i18n'
import { type MockControl, mockBackend } from '@/mock/mock-backend'
import Settings from './Settings.vue'

let mounted: VueWrapper | undefined

afterEach(() => {
  const toasts = useToasts()
  toasts.visible.value.forEach(toast => toasts.dismiss(toast.key))
  setLanguage('en')
  mounted?.unmount()
  mounted = undefined
})

/**
 * The Settings screen over settings that hold these entries.
 *
 * @param ui the entries
 * @returns the screen, the Configurator and the mock's controls
 */
async function screen(ui: { key: string, value: string }[] = []) {
  const control: MockControl = {}
  const handle = createConfigurator(mockBackend({ settings: { version: 1, ui }, control }))
  await vi.waitFor(() => expect(handle.settings.loaded.value).toBe(true))
  mounted = mount(Settings, { global: { plugins: [i18n] } })
  await flushPromises()

  return { wrapper: mounted, handle, control }
}

it('records every connection by default, into the data folder it shows, up to 2 GB', async () => {
  const { wrapper } = await screen()

  expect(wrapper.get('#recording-enabled').attributes('aria-checked')).toBe('true')
  expect(wrapper.get('.settings-recording').text()).toContain('In use: /mock/data/recordings.')
  expect(wrapper.get('.settings-recording select').element).toHaveProperty('value', '2000')
  expect(wrapper.get('#recording-status').text()).toBe('Recording starts with the next connection.')
  expect(wrapper.get('#recording-status').attributes('role')).toBe('status')
})

it('keeps each choice in the settings the backend reads', async () => {
  const { wrapper, handle } = await screen()
  await wrapper.get('#recording-enabled').trigger('click')
  await flushPromises()

  expect(handle.settings.uiValue('recording.enabled')).toBe('false')
  expect(wrapper.get('#recording-status').text()).toBe('Not recording: turned off.')
  await wrapper.get('.settings-recording select').setValue('500')
  await flushPromises()

  expect(handle.settings.uiValue('recording.limitMb')).toBe('500')
  await wrapper.get('#recording-folder').setValue('  /srv/tlogs ')
  await wrapper.get('#recording-folder').trigger('change')
  await flushPromises()

  expect(handle.settings.uiValue('recording.folder')).toBe('/srv/tlogs')
  expect(wrapper.get('.settings-recording').text()).toContain('In use: /srv/tlogs.')
})

it('says which file a connection is recorded to', async () => {
  const { wrapper, handle } = await screen()
  await handle.vehicle.connect({ transport: 'simulator' })
  await handle.recording.refresh()
  await flushPromises()

  expect(wrapper.get('#recording-status').text()).toMatch(/^Recording to 2026-11-24_10-15-30\.tlog: 48(?:\.0)?\s?kB so far\.$/u)
})

it('says how many old recordings the limit removed, and tells it once as a toast', async () => {
  const { wrapper, control } = await screen()
  control.recording?.({ removed: 2 })
  await flushPromises()

  const removed = wrapper.get('#recording-removed').text()
  expect(removed).toContain('Old recordings removed to stay under the limit since the app started: 2')
  expect(useToasts().visible.value.map(toast => toast.text)).toContain('Old recordings removed to stay under the limit: 2.')
})

it('says why a recording stopped', async () => {
  const { wrapper, control } = await screen()
  control.recording?.({ failure: { code: 'no-folder', message: 'cannot make it' } })
  await flushPromises()

  expect(wrapper.get('#recording-status').text()).toBe('Telemetry recording stopped: the folder cannot be used.')
})
