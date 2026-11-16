// The settings of guided control: the safe defaults (a plain confirmation, the failsafe blocks, 50 m, 500 m, 10 m/s, a Go here
// at 5 m/s),
// each choice kept in the settings and shown at once, what the settings hold shown, and an entry that is not understood is the
// default.
import { afterEach, expect, it, vi } from 'vitest'
import { type VueWrapper, flushPromises, mount } from '@vue/test-utils'
import { createConfigurator } from '@/composables/useConfigurator'
import { forgetGuidedChoices } from '@/composables/useGuidedPreferences'
import { i18n, setLanguage } from '@/i18n/i18n'
import { mockBackend } from '@/mock/mock-backend'
import GuidedSettings from './GuidedSettings.vue'

let mounted: VueWrapper | undefined

afterEach(() => {
  setLanguage('en')
  forgetGuidedChoices()
  mounted?.unmount()
  mounted = undefined
})

/**
 * The settings group over settings that hold these entries.
 *
 * @param ui the entries
 * @returns the group and the Configurator
 */
async function group(ui: { key: string, value: string }[] = []) {
  const handle = createConfigurator(mockBackend({ settings: { version: 1, ui } }))
  await vi.waitFor(() => expect(handle.settings.loaded.value).toBe(true))
  mounted = mount(GuidedSettings, { global: { plugins: [i18n] } })
  await flushPromises()

  return { wrapper: mounted, handle }
}

/**
 * What a select shows.
 *
 * @param wrapper the group
 * @param key which setting
 * @returns its value
 */
function valueOf(wrapper: VueWrapper, key: string): string {
  return wrapper.get<HTMLSelectElement>(`select[id$="-${key}"]`).element.value
}

it('has the safe defaults: a plain confirmation, a blocking failsafe, 50 m, 500 m, 10 m/s and a Go here at 5 m/s', async () => {
  const { wrapper } = await group()

  expect(['confirmation', 'failsafe', 'maxAltitude', 'maxDistance', 'maxSpeed', 'speed'].map(key => valueOf(wrapper, key)))
    .toEqual(['plain', 'block', '50', '500', '10', '5'])
})

it('offers none, plain and a hold, and block and warn, in words', async () => {
  const { wrapper } = await group()
  const texts = (key: string) => wrapper.get(`select[id$="-${key}"]`).findAll('option').map(option => option.text())

  expect(texts('confirmation')).toEqual(['Do not ask', 'Ask for a confirmation (recommended)', 'Ask for a hold'])
  expect(texts('failsafe')).toEqual(['Block the command (recommended)', 'Warn, and send it'])
  expect(texts('maxSpeed')).toContain('10 m/s')
})

it('keeps a choice in the settings, and shows it at once', async () => {
  const { wrapper, handle } = await group()
  await wrapper.get('select[id$="-confirmation"]').setValue('hold')
  await wrapper.get('select[id$="-failsafe"]').setValue('warn')
  await wrapper.get('select[id$="-maxDistance"]').setValue('1000')
  await flushPromises()

  expect(handle.settings.uiValue('guided.confirmation')).toBe('hold')
  expect(handle.settings.uiValue('guided.failsafe')).toBe('warn')
  expect(handle.settings.uiValue('guided.maxDistance')).toBe('1000')
  expect(valueOf(wrapper, 'confirmation')).toBe('hold')
})

it('shows what the settings hold, and takes anything it does not understand for the default', async () => {
  const { wrapper } = await group([
    { key: 'guided.confirmation', value: 'none' },
    { key: 'guided.failsafe', value: 'whatever' },
    { key: 'guided.maxAltitude', value: '77' },
    { key: 'guided.maxSpeed', value: '20' },
  ])

  expect(valueOf(wrapper, 'confirmation')).toBe('none')
  expect(valueOf(wrapper, 'failsafe')).toBe('block')
  expect(valueOf(wrapper, 'maxAltitude')).toBe('50')
  expect(valueOf(wrapper, 'maxSpeed')).toBe('20')
})
