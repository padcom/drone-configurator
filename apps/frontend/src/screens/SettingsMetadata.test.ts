// The Settings screen's metadata section: the path (written, or kept from a file loaded by hand), the file picker and the switch
// "Load the parameter metadata when the application starts" (on unless the settings say off).
import { afterEach, expect, it, vi } from 'vitest'
import { type VueWrapper, flushPromises, mount } from '@vue/test-utils'
import { createConfigurator } from '@/composables/useConfigurator'
import { i18n, setLanguage } from '@/i18n/i18n'
import { METADATA_AUTOLOAD_KEY, METADATA_PATH_KEY } from '@/lib/params/metadataSettings'
import { mockBackend } from '@/mock/mock-backend'
import Settings from './Settings.vue'

const FILE = JSON.stringify({
  format: 'drone-configurator/param-metadata',
  version: 1,
  params: { RTL_ALT: { description: 'Return altitude' } },
})

let mounted: VueWrapper | undefined

afterEach(() => {
  setLanguage('en')
  mounted?.unmount()
  mounted = undefined
})

/**
 * The Settings screen over settings that hold these entries.
 *
 * @param ui the entries
 * @param opens what the open dialog gives, one file at each use
 * @returns the screen and the Configurator
 */
async function screen(ui: { key: string, value: string }[] = [], opens: { path: string, text: string }[] = []) {
  const handle = createConfigurator(mockBackend({ settings: { version: 1, ui }, opens }))
  await vi.waitFor(() => expect(handle.settings.loaded.value).toBe(true))
  mounted = mount(Settings, { global: { plugins: [i18n] } })
  await flushPromises()

  return { wrapper: mounted, handle }
}

it('shows the path the settings hold, and the switch on when the settings have no entry for it', async () => {
  const { wrapper } = await screen([{ key: METADATA_PATH_KEY, value: '/data/apm.pdef.json' }])

  expect((wrapper.get('input[type="text"]').element as HTMLInputElement).value).toBe('/data/apm.pdef.json')
  expect(wrapper.get('#metadata-autoload').attributes('aria-checked')).toBe('true')
  expect(wrapper.text()).toContain('Load the parameter metadata when the application starts')
})

it('keeps the path that is written, and the switch when it is turned off (the path stays)', async () => {
  const { wrapper, handle } = await screen([{ key: METADATA_PATH_KEY, value: '/a.json' }])

  await wrapper.get('input[type="text"]').setValue('/b/apm.pdef.json')
  await wrapper.get('input[type="text"]').trigger('change')
  await flushPromises()
  expect(handle.settings.uiValue(METADATA_PATH_KEY)).toBe('/b/apm.pdef.json')

  await wrapper.get('#metadata-autoload').trigger('click')
  await flushPromises()
  expect(handle.settings.uiValue(METADATA_AUTOLOAD_KEY)).toBe('off')
  expect(wrapper.get('#metadata-autoload').attributes('aria-checked')).toBe('false')
  expect(handle.settings.uiValue(METADATA_PATH_KEY)).toBe('/b/apm.pdef.json')
})

it('picks a file with the dialog: it is loaded, and its path is shown', async () => {
  const { wrapper, handle } = await screen([], [{ path: '/data/m.json', text: FILE }])

  await wrapper.get('button[id$="metadata-pick"]').trigger('click')
  await flushPromises()

  expect((wrapper.get('input[type="text"]').element as HTMLInputElement).value).toBe('/data/m.json')
  expect(handle.metadata.metadata.value.has('RTL_ALT')).toBe(true)
  expect(wrapper.get('.settings-problem').text()).toBe('')
})

it('says why the picked file was not loaded, and keeps the path it had', async () => {
  const { wrapper } = await screen([{ key: METADATA_PATH_KEY, value: '/a.json' }], [{ path: '/data/n.json', text: '{}' }])

  await wrapper.get('button[id$="metadata-pick"]').trigger('click')
  await flushPromises()

  expect((wrapper.get('input[type="text"]').element as HTMLInputElement).value).toBe('/a.json')
  expect(wrapper.get('.settings-problem').text()).toMatch(/^Can't load the metadata: not a parameter metadata file/u)
})
