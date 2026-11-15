// The Settings screen's "Flight controls": what a change of the flight mode of an armed vehicle asks (a confirmation unless the
// user chose that it asks nothing), kept in the settings; an entry that is not understood is the safe default.
import { afterEach, expect, it, vi } from 'vitest'
import { type VueWrapper, flushPromises, mount } from '@vue/test-utils'
import { createConfigurator } from '@/composables/useConfigurator'
import { forgetModeConfirmationChoice, parseModeConfirmation } from '@/composables/useModeConfirmation'
import { i18n, setLanguage } from '@/i18n/i18n'
import { mockBackend } from '@/mock/mock-backend'
import Settings from './Settings.vue'

let mounted: VueWrapper | undefined

afterEach(() => {
  setLanguage('en')
  forgetModeConfirmationChoice()
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

it('asks for a confirmation until the settings say otherwise: the safe default', async () => {
  const { wrapper } = await screen()
  const select = wrapper.get<HTMLSelectElement>('select[id$="-mode-confirm"]')

  expect(select.element.value).toBe('plain')
  expect(select.findAll('option').map(option => option.text())).toEqual(['Ask for a confirmation (recommended)', 'Do not ask'])
  expect(wrapper.text()).toContain('RTL, Land, Loiter and Brake never ask')
})

it('keeps the choice in the settings, and shows it at once', async () => {
  const { wrapper, handle } = await screen()
  await wrapper.get('select[id$="-mode-confirm"]').setValue('none')
  await flushPromises()

  expect(handle.settings.uiValue('confirm.mode')).toBe('none')
  expect(wrapper.get<HTMLSelectElement>('select[id$="-mode-confirm"]').element.value).toBe('none')
})

it('shows what the settings hold', async () => {
  const { wrapper } = await screen([{ key: 'confirm.mode', value: 'none' }])

  expect(wrapper.get<HTMLSelectElement>('select[id$="-mode-confirm"]').element.value).toBe('none')
})

it('takes anything that is not understood for the safe level', () => {
  const texts = ['none', 'plain', 'hold', '', 'NONE', undefined]

  expect(texts.map(parseModeConfirmation)).toEqual(['none', 'plain', 'plain', 'plain', 'plain', 'plain'])
})
