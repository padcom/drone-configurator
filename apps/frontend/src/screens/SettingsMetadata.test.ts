// The Settings screen's metadata section: the path (written, or kept from a file loaded by hand), the file picker, the switch
// "Load the parameter metadata when the application starts" (on unless the settings say off), the switch "Download the parameter
// metadata for the connected vehicle" (on unless the settings say off), the line that says where the metadata came from, and
// its button that downloads it again.
import { afterEach, expect, it, vi } from 'vitest'
import { type VueWrapper, flushPromises, mount } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { createConfigurator } from '@/composables/useConfigurator'
import { i18n, setLanguage } from '@/i18n/i18n'
import { METADATA_AUTOLOAD_KEY, METADATA_DOWNLOAD_KEY, METADATA_PATH_KEY } from '@/lib/params/metadataSettings'
import type { MetadataFile } from '@/generated/app'
import { mockBackend } from '@/mock/mock-backend'
import { useToasts } from '@/composables/toasts'
import { useMetadataToasts } from '@/lib/params/metadataToasts'
import Parameters from './Parameters.vue'
import Settings from './Settings.vue'

const FILE = JSON.stringify({
  format: 'drone-configurator/param-metadata',
  version: 1,
  params: { RTL_ALT: { description: 'Return altitude' } },
})

const LATEST: MetadataFile = {
  vehicle: 'copter',
  version: '4.5.7',
  exact: false,
  format: 'json',
  text: JSON.stringify({ json: { version: 0 }, ArduCopter: { RTL_ALT: { DisplayName: 'Return height' } } }),
  fromCache: true,
  stale: false,
  fetchedAt: Date.UTC(2026, 10, 20),
}

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
})

it('tells a picked file that is not metadata ONCE, in a toast, with Parameters and Settings both mounted', async () => {
  const { wrapper } = await screen([{ key: METADATA_PATH_KEY, value: '/a.json' }], [{ path: '/data/n.json', text: '{}' }])
  const parameters = mount(Parameters, { global: { plugins: [i18n] } })
  const shell = mount(defineComponent({
    setup() {
      useMetadataToasts()

      return () => null
    },
  }), { global: { plugins: [i18n] } })

  await wrapper.get('button[id$="metadata-pick"]').trigger('click')
  await flushPromises()

  // the path it had stays, and the words are said once (not by the page too)
  expect((wrapper.get('input[type="text"]').element as HTMLInputElement).value).toBe('/a.json')
  const said = useToasts().visible.value.map(toast => toast.text)
  expect(said).toHaveLength(1)
  expect(said[0]).toMatch(/^Can't load the metadata: not a parameter metadata file/u)
  expect(wrapper.text()).not.toContain('not a parameter metadata file')
  parameters.unmount()
  shell.unmount()
})

it('does not keep the path of a file that loaded but is not a .json, and says so once', async () => {
  const { wrapper, handle } = await screen([], [{ path: '/data/m.txt', text: FILE }])

  await wrapper.get('button[id$="metadata-pick"]').trigger('click')
  await flushPromises()

  expect(handle.metadata.metadata.value.has('RTL_ALT')).toBe(true)
  expect(handle.settings.uiValue(METADATA_PATH_KEY)).toBeUndefined()
  const said = useToasts().visible.value.map(toast => toast.text)
  expect(said).toEqual(['The path of /data/m.txt was not kept: only a .json file is loaded when the application starts.'])
})

/**
 * How many times a text is in some other.
 *
 * @param text what is searched
 * @param part what is looked for
 * @returns the count
 */
function timesIn(text: string, part: string): number {
  return text.split(part).length - 1
}

it('shows the stored path ONCE, in its field and not again in Settings\' own text, with or without a failure toast', async () => {
  const path = '/data/apm.pdef.json'
  const { wrapper, handle } = await screen([{ key: METADATA_PATH_KEY, value: path }])
  const field = (wrapper.get('input[type="text"]').element as HTMLInputElement).value

  expect(field).toBe(path)
  expect(timesIn(wrapper.text(), path)).toBe(0)

  // the file is not there: the start-up load says so in a toast, which carries the path by design (it is not Settings' text)
  const toasts = useToasts()
  const failed = await handle.metadata.loadFrom(path)
  toasts.push({ severity: 'error', text: failed ?? '', sticky: true })
  await flushPromises()

  expect(toasts.visible.value.map(toast => timesIn(toast.text, path))).toEqual([1])
  expect((wrapper.get('input[type="text"]').element as HTMLInputElement).value).toBe(path)
  // Settings' own text and markup, with the field's value as the one place: nothing else in the page has it
  expect(timesIn(wrapper.text(), path)).toBe(0)
  expect(timesIn(wrapper.html(), path)).toBe(0)
})

it('has the download switch on by default, keeps it off, and says where the metadata came from', async () => {
  const { wrapper, handle } = await screen()

  expect(wrapper.get('#metadata-download').attributes('aria-checked')).toBe('true')
  const nothingYet = 'Nothing downloaded yet. It is downloaded when a vehicle is connected.'
  expect(wrapper.get('#metadata-download-status').text()).toBe(nothingYet)
  // No vehicle: nothing to download again.
  expect(wrapper.get('#metadata-refresh').attributes('disabled')).toBeDefined()

  await wrapper.get('#metadata-download').trigger('click')
  await flushPromises()
  expect(handle.settings.uiValue(METADATA_DOWNLOAD_KEY)).toBe('off')
  expect(wrapper.get('#metadata-download').attributes('aria-checked')).toBe('false')
})

it('downloads the connected vehicle\'s metadata again with its button, a button the keyboard reaches', async () => {
  const handle = createConfigurator(mockBackend({ metadata: [LATEST] }))
  await vi.waitFor(() => expect(handle.settings.loaded.value).toBe(true))
  mounted = mount(Settings, { global: { plugins: [i18n] } })
  await handle.vehicle.connect({ transport: 'simulator' })
  await vi.waitFor(() => expect(handle.metadata.source.value).toBe('download'))
  await flushPromises()
  const status = () => mounted?.get('#metadata-download-status').text()
  expect(status()).toMatch(
    /^Latest Copter metadata from ArduPilot, downloaded .*: ArduPilot has none for 4\.5\.7\. Loaded from this computer in /u,
  )

  const button = mounted.get('#metadata-refresh')
  expect(button.element.tagName).toBe('BUTTON')
  expect(button.attributes('disabled')).toBeUndefined()
  await button.trigger('click')
  await flushPromises()
  await vi.waitFor(() => expect(handle.metadata.downloading.value).toBe(false))

  expect(status()).toMatch(/^Latest Copter metadata from ArduPilot/u)
  await handle.vehicle.disconnect()
})
